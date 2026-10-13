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

/** Landmark pairs whose midpoints all sit on the line of symmetry. */
const SYMMETRIC_PAIRS = [
  ['templeL', 'templeR'],
  ['eyeL', 'eyeR'],
  ['jawL', 'jawR'],
] as const;

/** Value of `t * (1 - t)` at the middle of the axis, where the bow is largest. */
const BOW_PEAK = 0.25;

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
 * The line of symmetry, from the crown to the chin.
 *
 * Straight on a frontal face and bowed on a three-quarter view, with the bow
 * fitted to every paired landmark at once rather than threaded through the eye
 * midpoint. Forcing the curve through one pair meant any error in that pair
 * became a visible lean in the face's own axis.
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
    const t = i / AXIS_SAMPLES;
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
  const offset =
    ((mid.x - cranium.center.x) * down.x + (mid.y - cranium.center.y) * down.y) / cranium.radius;
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
  if (!cranium || cranium.radius <= 0) {
    return WRAP_FLOOR;
  }

  // The same fitted bow the axis is drawn with, taken at its deepest point, so
  // the wrap and the midline can never disagree about which way the head faces.
  const off = Math.abs(measureBow(marks)) * BOW_PEAK;
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
 * Samples one cubic Hermite span: two endpoints and the direction the curve
 * takes at each of them.
 *
 * Hermite rather than Bézier because what this jaw has to honour is tangents,
 * not control points — leave the skull straight down, arrive at the chin
 * straight across — and a Hermite span takes those directions as its input
 * instead of making us solve for handles that produce them.
 *
 * @param from Where the span starts.
 * @param fromTangent Direction and strength of departure at `from`.
 * @param to Where the span ends.
 * @param toTangent Direction and strength of arrival at `to`.
 * @param samples How many segments to cut the span into.
 * @returns The sampled polyline, both endpoints included.
 */
const hermite = (
  from: Point,
  fromTangent: Point,
  to: Point,
  toTangent: Point,
  samples: number,
): Point[] => {
  const out: Point[] = [];

  for (let i = 0; i <= samples; i += 1) {
    const t = i / samples;
    const square = t * t;
    const cube = square * t;
    const startWeight = 2 * cube - 3 * square + 1;
    const startSlope = cube - 2 * square + t;
    const endWeight = 3 * square - 2 * cube;
    const endSlope = cube - square;

    out.push({
      x:
        startWeight * from.x +
        startSlope * fromTangent.x +
        endWeight * to.x +
        endSlope * toTangent.x,
      y:
        startWeight * from.y +
        startSlope * fromTangent.y +
        endWeight * to.y +
        endSlope * toTangent.y,
    });
  }

  return out;
};

/**
 * Segments per span. The arrival at the chin is exactly flat by construction,
 * but a coarse polyline still shows a kink there because each drawn chord is a
 * secant of a curve that is turning hard: at 14 the two arms met at 12 degrees,
 * at 24 they meet at 6.
 */
const JAW_SAMPLES = 24;

/**
 * How strongly the arm is already travelling sideways when it reaches the
 * chin, as a multiple of the corner-to-chin distance. It sets how round the
 * bottom of the face is: at zero the two arms meet in a spike, and large
 * values spread the turn so far up the jaw that the chin reads as broad.
 * Measured across four corner placements, 1.2 brings the meeting angle under
 * six degrees without the curve ever dipping below the marked chin.
 */
const CHIN_ROUNDING = 1.2;

/**
 * One side of the jaw: off the cranium, through the marked corner, into the
 * chin.
 *
 * Three conditions make this the line an artist draws, and all three are
 * tangent conditions, which is why the span is Hermite:
 *
 * 1. It leaves the widest point of the cranium heading straight down the head
 *    axis. The circle is also vertical there, so skull and jaw are one
 *    unbroken outline with no crease at the join. This is also what fixed the
 *    real defect: the old code looked for a tangent line from the corner to
 *    the circle and gave up when there was none — which is every frontal face,
 *    because a jaw is narrower than the skull above it. The widest point
 *    always exists, so the curve is always built.
 * 2. It passes exactly through the marked corner, which is the whole point of
 *    marking it.
 * 3. It arrives at the chin moving straight across the face. Both arms do, so
 *    they meet in a round chin instead of the V that was being drawn.
 *
 * @param corner The marked jaw corner, which the arm passes through.
 * @param chin The tip of the chin.
 * @param cranium The fitted cranium circle.
 * @param down Unit vector from the crown toward the chin.
 * @returns The sampled arm, from the cranium down to the chin.
 */
const jawArm = (
  corner: Point,
  chin: Point,
  cranium: NonNullable<Cranium>,
  down: Point,
): Point[] => {
  const across = { x: -down.y, y: down.x };
  const sideways =
    (corner.x - cranium.center.x) * across.x + (corner.y - cranium.center.y) * across.y;
  const sign = sideways >= 0 ? 1 : -1;
  const outward = { x: across.x * sign, y: across.y * sign };

  const departure = {
    x: cranium.center.x + outward.x * cranium.radius,
    y: cranium.center.y + outward.y * cranium.radius,
  };

  // The corner is a waypoint, not a corner in the geometric sense: both spans
  // pass through it heading the same way, so the arm reads as one stroke.
  //
  // That shared direction is scaled by each span's own chord rather than used
  // at one length for both. The span above the corner is short and the one
  // below it is long, and feeding the long span's tangent into the short one
  // is the classic Catmull-Rom overshoot: it bowed the jaw sideways out of the
  // skull by four units before the chord scaling, and by nothing after it.
  const waist = unitVector(departure, chin);

  if (!waist) {
    return [departure, corner, chin];
  }

  const upper = distance(departure, corner);
  const lower = distance(corner, chin);
  const flatten = lower * CHIN_ROUNDING;

  return [
    ...hermite(
      departure,
      { x: down.x * upper, y: down.y * upper },
      corner,
      { x: waist.x * upper, y: waist.y * upper },
      JAW_SAMPLES,
    ),
    ...hermite(
      corner,
      { x: waist.x * lower, y: waist.y * lower },
      chin,
      { x: -outward.x * flatten, y: -outward.y * flatten },
      JAW_SAMPLES,
    ).slice(1),
  ];
};

/**
 * The jaw, carried up until each arm meets the cranium circle.
 *
 * A manga head is not a circle with a separate V floating under it: the jaw
 * continues the skull, and the chin is round.
 *
 * @param chin The tip of the chin.
 * @param jawL The left jaw corner.
 * @param jawR The right jaw corner.
 * @param cranium The fitted cranium circle, when there is one.
 * @param down Unit vector from the crown toward the chin, when there is one.
 * @returns The jaw polyline, left to right.
 */
const buildJaw = (
  chin: Point,
  jawL: Point,
  jawR: Point,
  cranium: Cranium,
  down: Point | null,
): Point[] => {
  if (!(cranium && down) || cranium.radius <= 0) {
    return [jawL, chin, jawR];
  }

  return [
    ...jawArm(jawL, chin, cranium, down),
    ...jawArm(jawR, chin, cranium, down).toReversed().slice(1),
  ];
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

  const width = templeL && templeR ? distance(templeL, templeR) : 0;

  let cranium: FaceGuides['cranium'] = null;

  if (templeL && templeR && crownTop) {
    cranium = fitCranium(crownTop, templeL, templeR);
  }

  const down = crownTop && chin ? unitVector(crownTop, chin) : null;

  return {
    cranium,
    headBox: buildHeadBox(p),
    jaw: jawL && chin && jawR ? buildJaw(chin, jawL, jawR, cranium, down) : [],
    axis: buildAxis(p),
    noseArc: eyeL && eyeR && noseTip ? arc(eyeL, noseTip, eyeR) : [],
    lines: buildLines(p, width * LINE_OVERSHOOT, cranium),
    metrics: buildMetrics(p, cranium?.radius ?? null),
  };
};
