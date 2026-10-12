import { NextResponse } from 'next/server';
import * as z from 'zod';
import { STYLE_PRESETS } from '@/features/skeleton/styles';
import {
  callGemini,
  describeError,
  getGeminiClient,
  isGeminiConfigured,
  isOverloadError,
} from '@/libs/Gemini';
import { logger } from '@/libs/Logger';
import { skeletonCoachSchema } from '@/validations/SkeletonCoachValidation';
import type { SkeletonCoachInput } from '@/validations/SkeletonCoachValidation';

const SYSTEM_INSTRUCTION = [
  'You are a figure drawing instructor specialised in anime, manga and comic construction.',
  'You receive measurements taken from a structural sketch (encaje / wireframe skeleton).',
  'Answer with at most four short bullet points of concrete, actionable correction.',
  'Talk about proportion, action line, shoulder and hip opposition, and limb placement.',
  'Never mention that you are an AI and never restate the raw numbers back as a list.',
].join(' ');

const describe = (value: number | null, unit: string): string =>
  value === null ? 'not measured' : `${value}${unit}`;

const buildPrompt = (input: SkeletonCoachInput): string => {
  const target = STYLE_PRESETS[input.artStyle].headsTall;

  return [
    `Target style: ${input.artStyle} (canonical height ${target.min}-${target.max} heads).`,
    `Measured figure height: ${describe(input.metrics.headsTall, ' heads')}.`,
    `Shoulder axis tilt: ${describe(input.metrics.shoulderTiltDeg, ' degrees')}.`,
    `Hip axis tilt: ${describe(input.metrics.hipTiltDeg, ' degrees')}.`,
    `Opposition between both axes: ${describe(input.metrics.contrappostoDeg, ' degrees')}.`,
    `Write the answer in the language with code "${input.locale}".`,
  ].join('\n');
};

export const POST = async (request: Request) => {
  const parse = skeletonCoachSchema.safeParse(await request.json());

  if (!parse.success) {
    return NextResponse.json(z.treeifyError(parse.error), { status: 422 });
  }

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: 'GEMINI_API_KEY is not configured on the server' },
      { status: 503 },
    );
  }

  try {
    const { result: response } = await callGemini(
      async (model) =>
        await getGeminiClient().models.generateContent({
          model,
          contents: buildPrompt(parse.data),
          config: { systemInstruction: SYSTEM_INSTRUCTION },
        }),
    );

    const advice = response.text?.trim();

    if (!advice) {
      return NextResponse.json({ error: 'Empty response from the model' }, { status: 502 });
    }

    return NextResponse.json({ advice });
  } catch (error) {
    logger.error('Skeleton coach request failed', { reason: describeError(error) });

    if (isOverloadError(error)) {
      return NextResponse.json({ error: 'The model is busy' }, { status: 429 });
    }

    return NextResponse.json({ error: 'Coach request failed' }, { status: 502 });
  }
};
