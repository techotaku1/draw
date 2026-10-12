import type { Marks, Point } from '@/features/landmarks/types';
import { angleDeg, distance, midpoint, round, toViewBox } from '@/features/landmarks/viewbox';
import { FACE_IDS } from './landmarks';
import type { FaceGuides, FaceMetrics, GuideLine } from './types';

/** How far the guide lines run past the cranium, as a fraction of its width. */
const LINE_OVERSHOOT = 0.25;

/** Sag of a horizontal guide at its midpoint, as a fraction of its half-width. */
const WRAP_DEPTH = 0.22;

/** Wrap kept even on a dead-on face, so the guides still read as a ball. */
const WRAP_FLOOR = 0.3;

/** Face turn, in cranium radii, at which the guides reach their full wrap. */
const FULL_TURN = 0.35;

const EMPTY_METRICS: FaceMetrics = {
  headHeight: null,
  headRatio: null,
  eyeLevel: null,
  eyeVsCranium: null,
  eyeSpread: null,
  eyeTiltDeg: null,
  noseLevel: null,
  mouthLevel: null,
  featureDrift: null,
};

/** Below this the three skull points are collinear and define no circle. */
const COLLINEAR_EPSILON = 1e-6;

/**
 * Largest cranium the temples can justify, as a multiple of half their span.
 * A three-quarter view foreshortens the temples, so the ball is legitimately
 * wider than they are — but only so far. Past this the three points are
 * near-collinear and the circle through them runs away: dragging one temple
 * across the other took the radius from 199 to 641 and threw the centre out of
 * the face entirely.
 */
const MAX_CRANIUM_SPREAD = 2.2;

// The circle through three points. The cranium is a ball seen in projection, so
// its outline passes through the crown and both temples whatever way the head
// is turned or tilted — which a circle built from a width and a vertical offset
// cannot follow.
const circleThrough = (a: Point, b: Point, c: Point): { center: Point; radius: number } | null => {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));

  if (Math.abs(d) < COLLINEAR_EPSILON) {
    return null;
  }

  const sa = a.x * a.x + a.y * a.y;
  const sb = b.x * b.x + b.y * b.y;
  const sc = c.x * c.x + c.y * c.y;

  const center = {
    x: (sa * (b.y - c.y) + sb * (c.y - a.y) + sc * (a.y - b.y)) / d,
    y: (sa * (c.x - b.x) + sb * (a.x - c.x) + sc * (b.x - a.x)) / d,
  };

  return { center, radius: Math.hypot(a.x - center.x, a.y - center.y) };
};

const unitVector = (from: Point, to: Point): Point | null => {
  const length = Math.hypot(to.x - from.x, to.y - from.y);

  return length === 0 ? null : { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
};

/**
 * Boxes the head in a frame aligned to its own axis.
 *
 * The references draw every head inside a rectangle, and that frame is what
 * makes proportion readable: it shows at a glance how tall the head is against
 * its width, and where each horizontal division falls inside it. Measuring
 * along the crown-to-chin axis instead of the screen means a tilted head gets
 * a tilted box rather than a larger upright one.
 *
 * @param marks Landmarks in SVG user-space.
 * @returns The four corners, or an empty array without a head axis.
 */
const buildHeadBox = (marks: Marks): Point[] => {
  const { crownTop, chin } = marks;
  const down = crownTop && chin ? unitVector(crownTop, chin) : null;

  if (!(crownTop && down)) {
    return [];
  }

  const right = { x: -down.y, y: down.x };
  const corners = FACE_IDS.map((id) => marks[id]).filter((point) => point !== undefined);

  if (corners.length < 2) {
    return [];
  }

  const along = corners.map((p) => (p.x - crownTop.x) * down.x + (p.y - crownTop.y) * down.y);
  const across = corners.map((p) => (p.x - crownTop.x) * right.x + (p.y - crownTop.y) * right.y);

  const at = (u: number, v: number): Point => ({
    x: crownTop.x + down.x * u + right.x * v,
    y: crownTop.y + down.y * u + right.y * v,
  });

  const top = Math.min(...along);
  const bottom = Math.max(...along);
  const left = Math.min(...across);
  const rightEdge = Math.max(...across);

  return [
    at(top, left),
    at(top, rightEdge),
    at(bottom, rightEdge),
    at(bottom, left),
    at(top, left),
  ];
};

/**
 * Fits the cranium to the three skull points.
 *
 * The circle through them follows a head that is turned or tilted, because a
 * ball in projection lands on its own outline. It is only trustworthy while
 * the points stay spread out: as they line up the circle diverges, so an
 * implausible radius falls back to a crown-anchored estimate sized by the
 * temples. That keeps a mis-dragged landmark looking wrong rather than
 * painting an arc across the whole picture.
 *
 * @param crownTop Top of the skull.
 * @param templeL One temple.
 * @param templeR The other temple.
 * @returns The cranium circle, or `null` when the temples coincide.
 */
const fitCranium = (
  crownTop: Point,
  templeL: Point,
  templeR: Point,
): { center: Point; radius: number } | null => {
  const halfSpan = distance(templeL, templeR) / 2;

  if (halfSpan <= 0) {
    return null;
  }

  const fitted = circleThrough(crownTop, templeL, templeR);

  if (fitted && fitted.radius <= halfSpan * MAX_CRANIUM_SPREAD) {
    return fitted;
  }

  // Anchor on the crown along the real head axis, so the fallback still
  // follows a tilt instead of assuming the head is upright.
  const towardTemples = unitVector(crownTop, midpoint(templeL, templeR));

  if (!towardTemples) {
    return null;
  }

  return {
    center: {
      x: crownTop.x + towardTemples.x * halfSpan,
      y: crownTop.y + towardTemples.y * halfSpan,
    },
    radius: halfSpan,
  };
};

// Samples a quadratic curve through three points, used for the soft arcs.
const arc = (from: Point, through: Point, to: Point, samples = 18): Point[] => {
  // Lift the control point so the curve actually passes through `through`.
  const control = {
    x: 2 * through.x - (from.x + to.x) / 2,
    y: 2 * through.y - (from.y + to.y) / 2,
  };
  const out: Point[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const inv = 1 - t;

    out.push({
      x: inv * inv * from.x + 2 * inv * t * control.x + t * t * to.x,
      y: inv * inv * from.y + 2 * inv * t * control.y + t * t * to.y,
    });
  }

  return out;
};

// Distance from `point` to the infinite line through `a` and `b`, signed so
// that the two sides of the axis keep opposite signs.
const signedDistanceToLine = (point: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return 0;
  }

  return ((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
};

// Projects `point` onto the axis and reports how far along it lands, 0 to 1.
const positionAlong = (point: Point, from: Point, to: Point): number => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return 0;
  }

  return ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
};

const extend = (from: Point, to: Point, by: number): [Point, Point] => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return [from, to];
  }

  const ux = (dx / length) * by;
  const uy = (dy / length) * by;

  return [
    { x: from.x - ux, y: from.y - uy },
    { x: to.x + ux, y: to.y + uy },
  ];
};

// How far the nose and mouth stray from the symmetry axis, in cranium widths.
const measureDrift = (
  marks: Marks,
  axisFrom: Point,
  axisTo: Point,
  craniumWidth: number | null,
): number | null => {
  const { noseTip, mouth } = marks;

  if (!craniumWidth || craniumWidth <= 0 || !(noseTip || mouth)) {
    return null;
  }

  const worst = Math.max(
    noseTip ? Math.abs(signedDistanceToLine(noseTip, axisFrom, axisTo)) : 0,
    mouth ? Math.abs(signedDistanceToLine(mouth, axisFrom, axisTo)) : 0,
  );

  return round(worst / craniumWidth, 3);
};

// Signed gap between the eye line and the bottom edge of the cranium circle.
const measureEyeVsCranium = (
  eyeLevel: number | null,
  craniumRadius: number | null,
  headHeight: number,
): number | null => {
  if (eyeLevel === null || craniumRadius === null || headHeight <= 0) {
    return null;
  }

  return round(eyeLevel - (craniumRadius * 2) / headHeight, 3);
};

const buildMetrics = (marks: Marks, craniumRadius: number | null): FaceMetrics => {
  const { crownTop, chin, templeL, templeR, eyeL, eyeR, noseTip, mouth } = marks;

  if (!(crownTop && chin)) {
    return EMPTY_METRICS;
  }

  const headHeight = distance(crownTop, chin);
  const hasTemples = Boolean(templeL && templeR);
  const craniumWidth = templeL && templeR ? distance(templeL, templeR) : null;
  const eyeMid = eyeL && eyeR ? midpoint(eyeL, eyeR) : null;
  const eyeLevel = eyeMid ? positionAlong(eyeMid, crownTop, chin) : null;
  const usableWidth = craniumWidth && craniumWidth > 0 ? craniumWidth : null;

  const levelBelowEyes = (point: Point | undefined): number | null =>
    point && eyeMid ? round(positionAlong(point, eyeMid, chin), 3) : null;

  return {
    headHeight: round(headHeight, 1),
    headRatio: usableWidth ? round(headHeight / usableWidth, 2) : null,
    eyeLevel: eyeLevel === null ? null : round(eyeLevel, 3),
    eyeVsCranium: measureEyeVsCranium(eyeLevel, craniumRadius, headHeight),
    eyeSpread: eyeL && eyeR && usableWidth ? round(distance(eyeL, eyeR) / usableWidth, 2) : null,
    eyeTiltDeg: eyeL && eyeR ? round(angleDeg(eyeL, eyeR)) : null,
    noseLevel: levelBelowEyes(noseTip),
    mouthLevel: levelBelowEyes(mouth),
    featureDrift: hasTemples ? measureDrift(marks, crownTop, chin, usableWidth) : null,
  };
};

// On a three-quarter view the axis bows toward the side the head turns to, so
// it is sampled through the eye midpoint rather than drawn straight.
const buildAxis = (
  crownTop: Point | undefined,
  chin: Point | undefined,
  eyeL: Point | undefined,
  eyeR: Point | undefined,
): Point[] => {
  if (!(crownTop && chin)) {
    return [];
  }

  return eyeL && eyeR ? arc(crownTop, midpoint(eyeL, eyeR), chin) : [crownTop, chin];
};

type Cranium = { center: Point; radius: number } | null;

/**
 * Bows a horizontal guide so it wraps the cranium instead of cutting across it
 * flat. A line level with the middle of the ball curves most; one near the
 * crown, or below the ball entirely, flattens out — which is how a latitude
 * line behaves on a sphere.
 *
 * The depth is a constant rather than a measured pitch: ten landmarks cannot
 * separate a head tilted forward from a face that is simply built long.
 *
 * @param from One end of the guide.
 * @param to The other end.
 * @param cranium The fitted cranium circle, or `null` when unavailable.
 * @param down Unit vector pointing from the crown toward the chin.
 * @param turn How far the face has turned, from `measureTurn`.
 * @returns The sampled arc, or the straight chord when there is no cranium.
 */
const wrapAcrossCranium = (
  from: Point,
  to: Point,
  cranium: Cranium,
  down: Point | null,
  turn: number,
): Point[] => {
  if (!(cranium && down) || cranium.radius <= 0) {
    return [from, to];
  }

  const mid = midpoint(from, to);
  // cos of the latitude: 1 level with the centre of the ball, 0 at its poles.
  const offset = (mid.y - cranium.center.y) / cranium.radius;
  const latitude = Math.sqrt(Math.max(0, 1 - offset * offset));
  const sag = (distance(from, to) / 2) * latitude * WRAP_DEPTH * turn;

  return arc(from, { x: mid.x + down.x * sag, y: mid.y + down.y * sag }, to);
};

/**
 * How far the face has turned away from dead-on, as a factor between the floor
 * and one. A frontal face keeps its eye midpoint on the crown-to-chin chord; a
 * three-quarter view pushes it off, which is the same signal the symmetry axis
 * already bows with.
 *
 * @param marks Landmarks in SVG user-space.
 * @param cranium The fitted cranium circle, or `null` when unavailable.
 * @returns A multiplier for the wrap depth.
 */
const measureTurn = (marks: Marks, cranium: Cranium): number => {
  const { crownTop, chin, eyeL, eyeR } = marks;

  if (!(crownTop && chin && eyeL && eyeR && cranium) || cranium.radius <= 0) {
    return WRAP_FLOOR;
  }

  const off = Math.abs(signedDistanceToLine(midpoint(eyeL, eyeR), crownTop, chin));
  const turn = Math.min(1, off / cranium.radius / FULL_TURN);

  return WRAP_FLOOR + (1 - WRAP_FLOOR) * turn;
};

/**
 * The vertical half of the grid. A face is five eye-widths across, so the
 * ruler is the width of the head cut into fifths: a rule down each side of the
 * face and four inside it.
 *
 * It is measured off the temples rather than multiplied out from the eye
 * spacing. Extrapolating eye-width times five pushed the outer rules past the
 * edge of the head whenever a character's eyes were set wide, which this style
 * does constantly. Anchoring to the skull cannot overflow, and when the eyes
 * do not land on the grid, that gap is the very thing the artist wants to see.
 *
 * The pupils should fall near the middle of the second and fourth fifths,
 * bracketed by rules rather than skewered by one, so no rule runs through the
 * centre of either eye.
 *
 * @param marks Landmarks already projected into view-box space.
 * @returns Six verticals, or none when the head is not outlined yet.
 */
const buildFifths = (marks: Marks): GuideLine[] => {
  const { crownTop, chin, templeL, templeR } = marks;

  if (!(crownTop && chin && templeL && templeR)) {
    return [];
  }

  const stride = { x: (templeR.x - templeL.x) / 5, y: (templeR.y - templeL.y) / 5 };
  const half = { x: (chin.x - crownTop.x) / 2, y: (chin.y - crownTop.y) / 2 };
  const headMiddle = midpoint(crownTop, chin);
  const templeMiddle = midpoint(templeL, templeR);

  // Carrying only the sideways part of each step keeps every rule spanning
  // exactly crown to chin, instead of starting at temple height and hanging
  // off the bottom of the face.
  return [0, 1, 2, 3, 4, 5].map((step) => {
    const foot = {
      x: headMiddle.x + templeL.x + stride.x * step - templeMiddle.x,
      y: headMiddle.y + templeL.y + stride.y * step - templeMiddle.y,
    };

    return {
      id: `fifth-${step}`,
      points: [
        { x: foot.x - half.x, y: foot.y - half.y },
        { x: foot.x + half.x, y: foot.y + half.y },
      ],
      kind: 'fifth' as const,
    };
  });
};

const buildLines = (marks: Marks, overshoot: number, cranium: Cranium): GuideLine[] => {
  const { crownTop, chin, eyeL, eyeR, noseTip, mouth } = marks;
  const lines: GuideLine[] = [];

  if (!(eyeL && eyeR)) {
    return lines;
  }

  const down = crownTop && chin ? unitVector(crownTop, chin) : null;
  const turn = measureTurn(marks, cranium);
  const [eyeFrom, eyeTo] = extend(eyeL, eyeR, overshoot);

  const tilt = (angleDeg(eyeL, eyeR) * Math.PI) / 180;

  /**
   * A horizontal division of the face: a rule at one landmark's height,
   * borrowing the eye line's direction.
   *
   * Every division shares that tilt on purpose. A ruled construction keeps
   * them parallel; letting each landmark set its own angle makes the face
   * read as if it were coming apart.
   *
   * @param at The point the rule passes through.
   * @param half Half its length.
   * @returns The two ends of the rule.
   */
  const ruleAt = (at: Point, half: number) => [
    { x: at.x - Math.cos(tilt) * half, y: at.y - Math.sin(tilt) * half },
    { x: at.x + Math.cos(tilt) * half, y: at.y + Math.sin(tilt) * half },
  ];

  const wide = distance(eyeL, eyeR) / 2 + overshoot;

  // Loomis divides the face into three equal parts: hairline to brow, brow to
  // the end of the nose, nose to chin. Two of those thirds span brow to chin,
  // so the hairline sits half that distance above the brow — derived, which is
  // why it needs no landmark of its own.
  if (marks.brow && chin) {
    const third = { x: (chin.x - marks.brow.x) / 2, y: (chin.y - marks.brow.y) / 2 };
    const hair = { x: marks.brow.x - third.x, y: marks.brow.y - third.y };
    const [from, to] = ruleAt(hair, wide);

    if (from && to) {
      lines.push({
        id: 'hairLine',
        points: wrapAcrossCranium(from, to, cranium, down, turn),
        kind: 'hairLine',
      });
    }
  }

  if (marks.brow) {
    const [from, to] = ruleAt(marks.brow, wide);

    if (from && to) {
      lines.push({
        id: 'browLine',
        points: wrapAcrossCranium(from, to, cranium, down, turn),
        kind: 'browLine',
      });
    }
  }

  lines.push(
    {
      id: 'eyeLine',
      points: wrapAcrossCranium(eyeFrom, eyeTo, cranium, down, turn),
      kind: 'eyeLine',
    },
    ...buildFifths(marks),
  );

  // Nose and mouth are the same construction: a short rule at the landmark's
  // own height, borrowing the eye line's tilt so every horizontal division of
  // the face stays parallel. The nose rule is the narrower of the two because
  // the nose reads about as wide as the gap between the eyes, while the mouth
  // runs out to the pupils.
  // The lower divisions narrow as the face tapers: the nose reads about as wide
  // as the gap between the eyes, the mouth runs out toward the pupils, and the
  // chin is the narrowest of the three.
  for (const [id, mark, span] of [
    ['noseLine', noseTip, 0.26],
    ['mouthLine', mouth, 0.35],
    ['chinLine', chin, 0.22],
  ] as const) {
    if (!mark) {
      continue;
    }

    const [from, to] = ruleAt(mark, distance(eyeL, eyeR) * span);

    if (!(from && to)) {
      continue;
    }

    lines.push({
      id,
      points: wrapAcrossCranium(from, to, cranium, down, turn),
      kind: id,
    });
  }

  return lines;
};

/**
 * The far end of one jaw arm: the straight line that runs from the chin
 * through the marked corner, carried up the side of the head.
 *
 * The line is pinned to two real landmarks, so it lies on the jaw that was
 * actually drawn — that comes first. Where it reaches is second: it stops on
 * the cranium circle when it crosses one, and otherwise at its closest
 * approach to the circle. Bending it to force contact is what drew the spike,
 * and it would also pull the line off the character's jaw.
 *
 * @param chin The tip of the chin, where both arms meet.
 * @param corner The marked jaw corner the arm runs through.
 * @param cranium The fitted cranium circle.
 * @returns The far end of the arm, never nearer the chin than the corner is.
 */
const jawArmEnd = (chin: Point, corner: Point, cranium: NonNullable<Cranium>): Point => {
  const along = unitVector(chin, corner);

  if (!along) {
    return corner;
  }

  const toCenter = { x: cranium.center.x - chin.x, y: cranium.center.y - chin.y };
  const closest = toCenter.x * along.x + toCenter.y * along.y;
  const strayed = toCenter.x ** 2 + toCenter.y ** 2 - closest ** 2;
  const inside = cranium.radius ** 2 - strayed;

  // Crossing the circle: stop where it leaves. Missing it: stop where it comes
  // nearest, which still carries the line up alongside the skull.
  const travel = inside >= 0 ? closest + Math.sqrt(inside) : closest;
  const reach = Math.max(travel, distance(chin, corner));

  return { x: chin.x + along.x * reach, y: chin.y + along.y * reach };
};

/**
 * The V of the jaw, carried up until each arm lands on the cranium circle.
 *
 * A manga head is not a circle with a separate V floating under it: the jaw
 * grows out of the skull. Each arm is therefore ONE straight diagonal, with no
 * vertex between the skull and the chin — a bend there drew a visible spike.
 *
 * The line is pinned to the chin and the marked corner, so it lies along the
 * jaw of the drawing that was uploaded rather than on an idealised one, and it
 * is then carried up the side of the head toward the cranium.
 *
 * @param chin The tip of the chin.
 * @param jawL The left jaw corner.
 * @param jawR The right jaw corner.
 * @param cranium The fitted cranium circle, when there is one.
 * @returns The jaw polyline, left to right.
 */
const buildJaw = (chin: Point, jawL: Point, jawR: Point, cranium: Cranium): Point[] => {
  if (!cranium) {
    return [jawL, chin, jawR];
  }

  return [jawArmEnd(chin, jawL, cranium), chin, jawArmEnd(chin, jawR, cranium)];
};

/**
 * Turns the marked landmarks into the anime face construction: cranium circle,
 * V of the jaw, symmetry axis, eye line, five-eye verticals and the arc that
 * joins the eyes through the nose.
 *
 * @param marks Landmarks in normalized image space.
 * @param aspect Reference image aspect ratio (`width / height`).
 * @returns The guide geometry in SVG user-space, plus its metrics.
 */
export const buildFaceGuides = (marks: Marks, aspect: number): FaceGuides => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const p = toViewBox(marks, safeAspect, FACE_IDS);
  const { crownTop, chin, templeL, templeR, eyeL, eyeR, jawL, jawR, noseTip } = p;

  let cranium: FaceGuides['cranium'] = null;

  if (templeL && templeR && crownTop) {
    cranium = fitCranium(crownTop, templeL, templeR);
  }

  const width = templeL && templeR ? distance(templeL, templeR) : 0;

  return {
    cranium,
    headBox: buildHeadBox(p),
    jaw: jawL && chin && jawR ? buildJaw(chin, jawL, jawR, cranium) : [],
    axis: buildAxis(crownTop, chin, eyeL, eyeR),
    noseArc: eyeL && eyeR && noseTip ? arc(eyeL, noseTip, eyeR) : [],
    lines: buildLines(p, width * LINE_OVERSHOOT, cranium),
    metrics: buildMetrics(p, cranium?.radius ?? null),
  };
};
