import { NextResponse } from 'next/server';
import * as z from 'zod';
import { FACE_IDS } from '@/features/face/landmarks';
import type { Point } from '@/features/landmarks/types';
import { JOINT_SEQUENCE } from '@/features/skeleton/joints';
import {
  callGemini,
  describeError,
  GEMINI_MODEL,
  getGeminiClient,
  isDailyQuotaError,
  isGeminiConfigured,
  isOverloadError,
  isQuotaError,
  retryAfterSeconds,
} from '@/libs/Gemini';
import { logger } from '@/libs/Logger';
import { detectPoseSchema } from '@/validations/DetectPoseValidation';

/** Gemini reports positions on a 0-1000 grid, the convention its docs use. */
const GRID = 1000;

const BODY_DESCRIPTIONS: Record<string, string> = {
  headTop:
    'the very top of the BONE of the skull, on the midline of the head. Hair, helmets and headgear sit above it: estimate where the cranium itself ends instead of following the outer silhouette',
  chin: 'the bottom tip of the chin, on the midline of the face, directly below the nose and the mouth',
  neck: 'the pit of the neck, between the collarbones',
  chest:
    'the middle of the breastbone, high on the chest at about one third of the way down from the pit of the neck to the navel — NOT the solar plexus and NOT the waist',
  pelvis: 'the centre of the pelvis, between both hip joints',
  shoulderL: 'the shoulder joint on the LEFT side of the image',
  shoulderR: 'the shoulder joint on the RIGHT side of the image',
  hipL: 'the hip joint on the LEFT side of the image',
  hipR: 'the hip joint on the RIGHT side of the image',
  elbowL: 'the elbow on the LEFT side of the image',
  elbowR: 'the elbow on the RIGHT side of the image',
  wristL: 'the wrist on the LEFT side of the image',
  wristR: 'the wrist on the RIGHT side of the image',
  kneeL: 'the knee on the LEFT side of the image',
  kneeR: 'the knee on the RIGHT side of the image',
  ankleL: 'the ankle on the LEFT side of the image',
  ankleR: 'the ankle on the RIGHT side of the image',
};

const FACE_DESCRIPTIONS: Record<string, string> = {
  crownTop:
    'the very top of the BONE of the skull, on the symmetry axis of the face. Spiky or voluminous hair rises well above it: do not follow the hair silhouette, estimate where the cranium itself ends underneath',
  templeL:
    'the widest point of the SKULL on the LEFT side of the image, at temple height, roughly level with the top of the ears. This is bone width, not hair width: on a character with large hair the skull is much narrower than the silhouette',
  templeR:
    'the widest point of the SKULL on the RIGHT side of the image, at temple height, roughly level with the top of the ears. This is bone width, not hair width: on a character with large hair the skull is much narrower than the silhouette. It must be as far from the midline as templeL is, on the opposite side',
  brow: 'the brow ridge, on the symmetry axis of the face directly above the bridge of the nose. It is ALWAYS higher in the image than both eyes, so its y must be smaller than the y of eyeL and eyeR. Place it at the upper edge of the eyebrows, never level with or below the pupils, and never on an eyebrow itself',
  eyeL: 'the centre of the pupil of the eye on the LEFT side of the image',
  eyeR: 'the centre of the pupil of the eye on the RIGHT side of the image',
  jawL: 'the angle of the jaw on the LEFT side of the image. Trace the OUTER OUTLINE OF THE FACE downward from the temple: it runs almost straight down past the cheek, then turns inward toward the chin. Put the landmark exactly at that turn. It lies ON that outline, never inside the cheek, and it is the outline of the SKIN that counts, not the outline of the hair. It sits roughly straight below the outer corner of eyeL, at a height between the eye line and the tip of the nose. It is nearly as far from the centre of the face as templeL is: the jaw is only slightly narrower than the skull, so a point near the middle of the face is badly wrong',
  jawR: 'the angle of the jaw on the RIGHT side of the image. Trace the OUTER OUTLINE OF THE FACE downward from the temple: it runs almost straight down past the cheek, then turns inward toward the chin. Put the landmark exactly at that turn. It lies ON that outline, never inside the cheek, and it is the outline of the SKIN that counts, not the outline of the hair. It sits roughly straight below the outer corner of eyeR, at a height between the eye line and the tip of the nose. It is nearly as far from the centre of the face as templeR is, and it must mirror jawL: the same height and the same distance from the midline, unless the head is clearly turned',
  chin: 'the lowest point of the OUTLINE OF THE FACE, where the two sides of the jaw meet at the bottom. Put it exactly on that outline, not a little above it inside the face and not below it: it is the last pixel of skin before the background or the neck begins. It is the bottom of the FACE, never the bottom of the head or of the hair, so ignore hair, a collar, a scarf or a shadow hanging below it. It sits on the symmetry axis, lined up vertically with brow, noseTip and mouth, and centred between jawL and jawR. The gap from mouth down to chin is roughly twice the gap from noseTip down to mouth',
  noseTip: 'the tip of the nose, on the symmetry axis of the face, between brow and mouth',
  mouth:
    'the centre of the mouth, where both lips meet, on the symmetry axis of the face, below noseTip and above chin',
};

const TARGETS = {
  body: {
    ids: JOINT_SEQUENCE.map((def) => def.id as string),
    descriptions: BODY_DESCRIPTIONS,
    subject: 'the single main figure',
  },
  face: {
    ids: FACE_IDS,
    descriptions: FACE_DESCRIPTIONS,
    subject: 'the head of the single main character',
  },
} as const;

type Target = keyof typeof TARGETS;

// The test is the hips, not "is any torso visible". Asking the looser question
// classified every bust as a body, because shoulders and an upper chest count
// as a partly visible torso — and a body sheet on a portrait draws no eye,
// brow, nose, mouth or jaw line at all.
const CLASSIFY_PROMPT = [
  'Decide which drawing construction fits this image.',
  'Answer "body" ONLY when the figure is visible down to the hips or further,',
  'so that the pelvis is in frame and a full skeleton can be built on it.',
  'Answer "face" in every other case.',
  'A portrait or a bust is "face": the head alone, or the head together with the',
  'neck, the shoulders and the upper chest. Shoulders being visible does NOT make',
  'it a body, because without the pelvis there is no skeleton to construct.',
  'If the hips are cropped out, hidden or merely guessed at, answer "face".',
  'When the two readings seem equally good, answer "face".',
].join(' ');

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    subject: {
      type: 'string',
      enum: ['body', 'face'],
      description: 'Which landmark set fits this framing',
    },
  },
  required: ['subject'],
};

const readSubject = (raw: string): Target | null => {
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }

  const subject = new Map<string, unknown>(Object.entries(parsed)).get('subject');

  return subject === 'body' || subject === 'face' ? subject : null;
};

const buildResponseSchema = (target: Target) => {
  const { ids, descriptions } = TARGETS[target];
  const properties: Record<string, unknown> = {};

  for (const id of ids) {
    properties[id] = {
      type: 'object',
      description: descriptions[id],
      properties: {
        x: { type: 'integer', description: `Horizontal position, 0 to ${GRID}` },
        y: { type: 'integer', description: `Vertical position, 0 to ${GRID}` },
      },
      required: ['x', 'y'],
    };
  }

  return { type: 'object', properties, required: [...ids] };
};

// The canon every manga head-construction tutorial teaches. These are not
// where the landmarks go — the drawing decides that — but a stylised face
// stays close to them, so they catch a point that has drifted somewhere
// impossible. Face only: a body has its own proportions.
const FACE_PROPORTIONS = [
  'Use the standard proportions of a drawn head to check your answer, and correct',
  'any landmark that disagrees with all the others:',
  'the eye line sits near the vertical middle between crownTop and chin;',
  'the brow sits near the lower edge of the skull, above the eye line;',
  'noseTip sits near the middle between the eye line and chin;',
  'mouth sits between noseTip and chin, closer to noseTip than to chin;',
  'the gap between eyeL and eyeR is about the width of one eye, so the distance',
  'from eyeL to eyeR is two eye-widths;',
  'the face is about FIVE eye-widths across, which makes templeL and templeR each',
  'about two and a half eye-widths out from the midline — use that as a ruler;',
  'the distance from jawL to jawR is most of the distance from templeL to templeR,',
  'never a small fraction of it, because the jaw hangs just inside the widest part',
  'of the skull rather than near the middle of the face;',
  'and the head is taller than it is wide.',
].join(' ');

const buildPrompt = (target: Target): string =>
  [
    `Locate the anatomical landmarks of ${TARGETS[target].subject} in this image.`,
    `Report every position on a ${GRID} by ${GRID} grid, where x=0 is the left edge,`,
    `x=${GRID} the right edge, y=0 the top edge and y=${GRID} the bottom edge.`,
    "LEFT and RIGHT always mean the viewer's left and right in the image, never the",
    "subject's own anatomical left and right.",
    'Estimate occluded or cropped landmarks from the visible shape instead of omitting them.',
    // A comic page is several drawings, borders and lettering at once. Without
    // this the model averages across panels and the whole skeleton drifts.
    'The image may be a comic or manga page holding several panels, speech balloons,',
    'caption boxes, sound effects and logos. Ignore all of them. Ignore every panel',
    'border and every block of text. Choose the ONE figure that occupies the most area',
    'and place every landmark on that same figure — never mix landmarks from two',
    'figures or two panels.',
    // Stylised hair is the single biggest source of error on anime references:
    // the model traces the silhouette of the hair instead of the skull inside it.
    'Hair, helmets, hats and headgear are NOT part of the skull. Where they hide the',
    'head, estimate where the bone actually sits underneath and place the landmark',
    'there, not on the outer silhouette.',
    // Drift off the midline is what makes a construction look wrong even when
    // each point is individually close.
    'Keep the midline consistent: the landmarks that sit on the centre of the face or',
    'body must fall on one straight line through the figure, and the paired left and',
    'right landmarks must sit on opposite sides of it at comparable distances.',
    'If the figure is foreshortened or seen at a steep angle, report where each',
    'landmark appears in the picture plane, not where it would be if the figure faced',
    'the viewer.',
    ...(target === 'face' ? [FACE_PROPORTIONS] : []),
  ].join(' ');

const readPoint = (value: unknown): Point | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const fields = new Map<string, unknown>(Object.entries(value));
  const x = fields.get('x');
  const y = fields.get('y');

  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }

  // Clamp: the model occasionally reports slightly outside the grid.
  return {
    x: Math.min(1, Math.max(0, x / GRID)),
    y: Math.min(1, Math.max(0, y / GRID)),
  };
};

/**
 * Converts the model's grid answer into landmarks in normalized image space.
 * @param raw The JSON text returned by the model.
 * @param ids The landmark ids expected for the requested target.
 * @returns Every landmark that came back usable; missing ones are left unset.
 */
const readLandmarks = (raw: string, ids: readonly string[]): Record<string, Point> => {
  const parsed: unknown = JSON.parse(raw);
  const found: Record<string, Point> = {};

  if (typeof parsed !== 'object' || parsed === null) {
    return found;
  }

  const points = new Map<string, unknown>(Object.entries(parsed));

  for (const id of ids) {
    const point = readPoint(points.get(id));

    if (point) {
      found[id] = point;
    }
  }

  return found;
};

/**
 * Asks the model how the image is framed before locating anything, so a
 * portrait gets the face landmarks and a figure gets the body ones.
 * @param imagePart The inline image to classify.
 * @returns The landmark set that fits, defaulting to `face` when unclear.
 */
const classify = async (imagePart: { inlineData: { mimeType: string; data: string } }) => {
  const { result: response } = await callGemini(
    async (model) =>
      await getGeminiClient().models.generateContent({
        model,
        contents: [{ role: 'user', parts: [imagePart, { text: CLASSIFY_PROMPT }] }],
        config: {
          responseMimeType: 'application/json',
          responseJsonSchema: CLASSIFY_SCHEMA,
          temperature: 0,
        },
      }),
  );

  const raw = response.text?.trim();

  // Same tiebreak the prompt gives the model, so an unreadable answer and an
  // undecided one land in the same place. Face is the safer miss: its landmarks
  // all sit on the head, which is in frame either way, whereas a body sheet on
  // a portrait hangs its hips and legs off the bottom of the picture.
  return (raw ? readSubject(raw) : null) ?? 'face';
};

export const POST = async (request: Request) => {
  const parse = detectPoseSchema.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server' },
      { status: 503 },
    );
  }

  const imagePart = {
    inlineData: { mimeType: parse.data.mimeType, data: parse.data.image },
  };

  try {
    const target = parse.data.target === 'auto' ? await classify(imagePart) : parse.data.target;

    const { result: response, model } = await callGemini(
      async (id) =>
        await getGeminiClient().models.generateContent({
          model: id,
          contents: [{ role: 'user', parts: [imagePart, { text: buildPrompt(target) }] }],
          config: {
            responseMimeType: 'application/json',
            responseJsonSchema: buildResponseSchema(target),
            // Landmark positions are a measurement, not a creative choice.
            temperature: 0,
          },
        }),
    );

    const raw = response.text?.trim();

    if (!raw) {
      return NextResponse.json({ error: 'Empty response from the model' }, { status: 502 });
    }

    const pose = readLandmarks(raw, TARGETS[target].ids);

    if (Object.keys(pose).length === 0) {
      return NextResponse.json({ error: 'No landmark was detected' }, { status: 502 });
    }

    // The client warns when the fallback answered: its landmarks are usable but
    // measurably looser, so they deserve a closer look before being trusted.
    return NextResponse.json({ target, pose, fallback: model !== GEMINI_MODEL });
  } catch (error) {
    logger.error('Landmark detection failed', { reason: describeError(error) });

    // A spent quota and a busy model both arrive as 429, but waiting only fixes
    // one of them. The client needs to tell the user which it is.
    if (isQuotaError(error)) {
      return NextResponse.json(
        {
          error: 'Quota exhausted',
          reason: isDailyQuotaError(error) ? 'quota_daily' : 'quota_rate',
          retryAfter: retryAfterSeconds(error),
        },
        { status: 429 },
      );
    }

    // 429 keeps "the model is busy" apart from 503, which the client reads as
    // a missing API key.
    if (isOverloadError(error)) {
      return NextResponse.json({ error: 'The model is busy', reason: 'busy' }, { status: 429 });
    }

    return NextResponse.json({ error: 'Landmark detection failed' }, { status: 502 });
  }
};
