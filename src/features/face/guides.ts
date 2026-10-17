import type { Marks, Point } from '@/features/landmarks/types';
import { angleDeg, distance, midpoint, round, toViewBox } from '@/features/landmarks/viewbox';
import { FACE_IDS } from './landmarks';
import type { FaceGuides, FaceMetrics, GuideLine } from './types';

/**
 * How far the horizontal guides run past the cranium on each side, in radii.
 * Manga construction rules them clean across the head and beyond it, through
 * the ears, so every division visibly meets the skull and the cheek lines.
 */
const LINE_OVERSHOOT = 0.35;

/**
 * Half-length of a horizontal guide before the cranium exists, as a multiple
 * of the eye spacing. In this style the head is about twice as wide as the
 * eyes are apart, so this already reaches the sides of the face.
 */
const LOOSE_REACH = 1.2;

/** How far the symmetry axis runs past the crown and the chin, in head heights. */
const AXIS_OVERSHOOT = 0.08;

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
 *
 * Turning a ball of radius `R` by an angle brings its temples `R * cos` apart
 * while the crown stays `R` above their chord, so the circle through the three
 * points is legitimately wider than the temples — by exactly
 * `(1 / cos + cos) / 2`, which is 1 dead on, 1.06 at forty-five degrees and
 * 1.25 at sixty. This cap is the value of that expression at sixty-two
 * degrees, past which one temple is disappearing behind the nose and the
 * construction has stopped being a front view of a head.
 *
 * Above it the crown was not read off the skull. Spiky hair puts it a quarter
 * of a head higher than the bone, which on a measured frontal reference gave
 * 1.46 — a circle 30% wider than the drawn head, with the jaw departing from
 * its inflated sides. The far end of the same scale is the near-collinear
 * runaway: dragging one temple across the other took the radius from 199 to
 * 641 and threw the centre out of the face entirely.
 */
const MAX_CRANIUM_SPREAD = 1.3;

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
 * the crown stands at a believable height over the temple chord: the further
 * it rises the wider that circle grows, without bound, so a radius the temples
 * cannot justify falls back to a crown-anchored estimate sized by the temples.
 * That keeps a crown read off a character's hair, or a mis-dragged landmark,
 * looking wrong rather than painting an arc across the whole picture.
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

/** Landmark pairs whose midpoints all sit on the line of symmetry. */
const SYMMETRIC_PAIRS = [
  ['templeL', 'templeR'],
  ['eyeL', 'eyeR'],
  ['jawL', 'jawR'],
] as const;

const AXIS_SAMPLES = 18;

/**
 * How far the line of symmetry bows away from the straight crown-to-chin
 * chord, as the amplitude of a single `t * (1 - t)` arch.
 *
 * A turned head pushes every paired landmark the same way, so the bow is read
 * from the temples, the eyes and the jaw corners together instead of from the
 * eyes alone. A pair placed a few pixels off then moves the axis a third as far
 * as it used to, which is what stops a dead-on face from being drawn with a
 * crooked midline — the complaint that sent us here.
 *
 * One parameter is enough because the axis is pinned at both ends: it has to
 * start at the crown and finish at the chin, so only its sag is free.
 *
 * @param marks Landmarks in SVG user-space.
 * @returns The bow amplitude, signed the same way as `signedDistanceToLine`.
 */
const measureBow = (marks: Marks): number => {
  const { crownTop, chin } = marks;

  if (!(crownTop && chin)) {
    return 0;
  }

  let weighted = 0;
  let weights = 0;

  for (const [left, right] of SYMMETRIC_PAIRS) {
    const a = marks[left];
    const b = marks[right];

    if (!(a && b)) {
      continue;
    }

    const mid = midpoint(a, b);
    const shape = (() => {
      const t = positionAlong(mid, crownTop, chin);

      return t * (1 - t);
    })();

    if (shape <= 0) {
      continue;
    }

    weighted += shape * signedDistanceToLine(mid, crownTop, chin);
    weights += shape * shape;
  }

  return weights === 0 ? 0 : weighted / weights;
};

/**
 * The line of symmetry, from just above the crown to just below the chin.
 *
 * Straight on a frontal face and bowed on a three-quarter view, with the bow
 * fitted to every paired landmark at once rather than threaded through the eye
 * midpoint. Forcing the curve through one pair meant any error in that pair
 * became a visible lean in the face's own axis.
 *
 * It runs a little past both ends, as the centre line of a construction
 * sheet does, so the crown and the chin read as points on the axis rather
 * than as where it stops.
 *
 * @param marks Landmarks in SVG user-space.
 * @returns The sampled axis, or an empty array without a head axis.
 */
const buildAxis = (marks: Marks): Point[] => {
  const { crownTop, chin } = marks;

  if (!(crownTop && chin)) {
    return [];
  }

  const dx = chin.x - crownTop.x;
  const dy = chin.y - crownTop.y;
  const length = Math.hypot(dx, dy);

  if (length === 0) {
    return [];
  }

  const normal = { x: dy / length, y: -dx / length };
  const amount = measureBow(marks);
  const out: Point[] = [];

  for (let i = 0; i <= AXIS_SAMPLES; i += 1) {
    const t = -AXIS_OVERSHOOT + ((1 + 2 * AXIS_OVERSHOOT) * i) / AXIS_SAMPLES;
    const sag = amount * t * (1 - t);

    out.push({
      x: crownTop.x + dx * t + normal.x * sag,
      y: crownTop.y + dy * t + normal.y * sag,
    });
  }

  return out;
};

type Cranium = { center: Point; radius: number } | null;

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

/**
 * The horizontal divisions of the face, each ruled straight across the whole
 * head through its own landmark.
 *
 * This is how the construction is drawn on the reference sheet the studio
 * follows: every division is one straight stroke that crosses the skull from
 * side to side and runs out past the ears, in the front, the profile and the
 * three-quarter view alike. Short rules floating at each landmark — the nose
 * and the chin barely a pupil wide — never reached the circle or the cheek
 * lines, so nothing tied the features to the head they sit on.
 *
 * Every division borrows the eye line's direction on purpose. A ruled
 * construction keeps them parallel; letting each landmark set its own angle
 * makes the face read as if it were coming apart. They are centred on the
 * cranium rather than on their landmark, so a turned face still gets rules
 * that span the head instead of hanging off one side of it.
 *
 * The hairline needs no landmark: manga construction places it halfway
 * between the top of the skull and the centre of the cranium circle, which is
 * where all three views of the reference sheet put it.
 *
 * @param marks Landmarks in SVG user-space.
 * @param cranium The fitted cranium circle, when there is one.
 * @returns The five-eye verticals followed by the horizontal divisions.
 */
const buildLines = (marks: Marks, cranium: Cranium): GuideLine[] => {
  const { crownTop, chin, eyeL, eyeR, noseTip, mouth } = marks;
  const across = eyeL && eyeR ? unitVector(eyeL, eyeR) : null;

  if (!(eyeL && eyeR && across)) {
    return [];
  }

  const head =
    cranium && cranium.radius > 0
      ? { center: cranium.center, reach: cranium.radius * (1 + LINE_OVERSHOOT) }
      : { center: midpoint(eyeL, eyeR), reach: distance(eyeL, eyeR) * LOOSE_REACH };

  const ruleThrough = (at: Point): Point[] => {
    const shift = (head.center.x - at.x) * across.x + (head.center.y - at.y) * across.y;
    const middle = { x: at.x + across.x * shift, y: at.y + across.y * shift };

    return [
      { x: middle.x - across.x * head.reach, y: middle.y - across.y * head.reach },
      { x: middle.x + across.x * head.reach, y: middle.y + across.y * head.reach },
    ];
  };

  const down = crownTop && chin ? unitVector(crownTop, chin) : null;
  const hair =
    cranium && down
      ? {
          x: cranium.center.x - (down.x * cranium.radius) / 2,
          y: cranium.center.y - (down.y * cranium.radius) / 2,
        }
      : undefined;

  const divisions: [GuideLine['kind'], Point | undefined][] = [
    ['hairLine', hair],
    ['browLine', marks.brow],
    ['eyeLine', midpoint(eyeL, eyeR)],
    ['noseLine', noseTip],
    ['mouthLine', mouth],
    ['chinLine', chin],
  ];

  // The fifths go first so the ruler is painted under the divisions.
  const lines = buildFifths(marks);

  for (const [kind, at] of divisions) {
    if (at) {
      lines.push({ id: kind, points: ruleThrough(at), kind });
    }
  }

  return lines;
};

/**
 * Half the length of the flat stroke that closes the chin, as a fraction of
 * the distance between the jaw corners. Manga construction ends the face in a
 * short level stroke rather than a point or a bowl: on the reference sheet the
 * artists' guides are measured from, the chin is 12 units wide under a jaw
 * 99 across.
 */
const CHIN_FLAT = 0.06;

/**
 * Where a cheek line leaves the cranium: the point of the circle on its
 * temple's side.
 *
 * The temple is one of the three points the circle was fitted through, so on a
 * fitted cranium this is the temple itself — where the drawn outline of the
 * face meets the skull, level with the top of the ear. A temple the fit had to
 * discard (a crown read off the hair) is pulled onto the circle along its
 * radius instead, so the cheek still starts on the skull rather than floating
 * off it. A temple above the widest point would start the cheek inside the
 * ball and cut a chord across it, so the start never rises past the widest
 * point.
 *
 * @param temple The temple on this side.
 * @param cranium The fitted cranium circle.
 * @param down Unit vector from the crown toward the chin.
 * @returns The point on the circle the cheek line starts from.
 */
const cheekStart = (temple: Point, cranium: NonNullable<Cranium>, down: Point): Point => {
  const offset = { x: temple.x - cranium.center.x, y: temple.y - cranium.center.y };
  const below = offset.x * down.x + offset.y * down.y;
  const reach = below < 0 ? { x: offset.x - down.x * below, y: offset.y - down.y * below } : offset;
  const length = Math.hypot(reach.x, reach.y);

  if (length === 0) {
    return temple;
  }

  return {
    x: cranium.center.x + (reach.x / length) * cranium.radius,
    y: cranium.center.y + (reach.y / length) * cranium.radius,
  };
};

/**
 * The jaw as a manga artist rules it: a straight cheek line from the side of
 * the cranium down to each jaw corner, then straight into a short flat chin.
 *
 * Every segment is a straight stroke and every joint a real corner, because
 * that is the construction on the reference sheet: the circle is the skull,
 * the cheek lines hang off it where the face meets it, and the jaw corner and
 * the chin are the two places the outline turns. The rounded curve this
 * replaced left the circle at its widest point and bowed out past the drawn
 * cheeks into a U, so it traced neither the skull nor the face.
 *
 * Without a cranium there is nothing to hang the cheeks from, so the corners
 * and the chin are joined as a bare V.
 *
 * @param marks Landmarks in SVG user-space.
 * @param cranium The fitted cranium circle, when there is one.
 * @param down Unit vector from the crown toward the chin, when there is one.
 * @returns The jaw polyline, left to right, or an empty array.
 */
const buildJaw = (marks: Marks, cranium: Cranium, down: Point | null): Point[] => {
  const { chin, jawL, jawR, templeL, templeR } = marks;

  if (!(chin && jawL && jawR)) {
    return [];
  }

  if (!(cranium && down && templeL && templeR) || cranium.radius <= 0) {
    return [jawL, chin, jawR];
  }

  const half = distance(jawL, jawR) * CHIN_FLAT;
  const across = { x: -down.y * half, y: down.x * half };
  const one = { x: chin.x + across.x, y: chin.y + across.y };
  const other = { x: chin.x - across.x, y: chin.y - across.y };
  // `across` follows the head axis, not the image, so which end of the flat is
  // the left one is read off the jaw corners rather than assumed.
  const [chinL, chinR] = distance(one, jawL) <= distance(other, jawL) ? [one, other] : [other, one];

  return [
    cheekStart(templeL, cranium, down),
    jawL,
    chinL,
    chinR,
    jawR,
    cheekStart(templeR, cranium, down),
  ];
};

/**
 * Turns the marked landmarks into the manga face construction: cranium
 * circle, cheek lines and jaw hung off it, symmetry axis, the horizontal
 * divisions ruled across the whole head, five-eye verticals and the arc that
 * joins the eyes through the nose.
 *
 * @param marks Landmarks in normalized image space.
 * @param aspect Reference image aspect ratio (`width / height`).
 * @returns The guide geometry in SVG user-space, plus its metrics.
 */
export const buildFaceGuides = (marks: Marks, aspect: number): FaceGuides => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const p = toViewBox(marks, safeAspect, FACE_IDS);
  const { crownTop, chin, templeL, templeR, eyeL, eyeR, noseTip } = p;

  let cranium: FaceGuides['cranium'] = null;

  if (templeL && templeR && crownTop) {
    cranium = fitCranium(crownTop, templeL, templeR);
  }

  const down = crownTop && chin ? unitVector(crownTop, chin) : null;

  return {
    cranium,
    headBox: buildHeadBox(p),
    jaw: buildJaw(p, cranium, down),
    axis: buildAxis(p),
    noseArc: eyeL && eyeR && noseTip ? arc(eyeL, noseTip, eyeR) : [],
    lines: buildLines(p, cranium),
    metrics: buildMetrics(p, cranium?.radius ?? null),
  };
};
