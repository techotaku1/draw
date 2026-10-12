import type { Point } from '@/features/landmarks/types';
import { VIEWBOX_WIDTH, viewBoxHeight } from '@/features/landmarks/viewbox';
import { JOINT_SEQUENCE } from './joints';
import type { Axis, Bone, JointMarker, Mass, Metrics, Pose, Skeleton } from './types';

/**
 * Ankles sit above the soles. A standing figure gains roughly a quarter of a
 * head below the ankle, so the height estimate adds it back.
 */
const FOOT_HEIGHT_IN_HEADS = 0.25;

const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

const lerp = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

// Signed angle of `a -> b` against the horizontal, in degrees.
const angleDeg = (a: Point, b: Point): number => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
};

// Samples a Catmull-Rom spline through every control point, which is what makes
// the action line read as one sweeping gesture instead of a broken polyline.
const smoothCurve = (points: Point[], samplesPerSegment = 14): Point[] => {
  const [first] = points;
  const last = points.at(-1);

  if (!first || !last || points.length < 2) {
    return [...points];
  }

  const padded = [first, ...points, last];
  const out: Point[] = [];

  for (let i = 0; i + 3 < padded.length; i += 1) {
    const p0 = padded[i];
    const p1 = padded[i + 1];
    const p2 = padded[i + 2];
    const p3 = padded[i + 3];

    if (!(p0 && p1 && p2 && p3)) {
      continue;
    }

    for (let s = 0; s < samplesPerSegment; s += 1) {
      const t = s / samplesPerSegment;
      const t2 = t * t;
      const t3 = t2 * t;

      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }

  out.push(last);

  return out;
};

// Projects a normalized pose into the SVG user-space defined above. Walking the
// known landmark list keeps the result typed without casting the object keys.
const toViewBox = (pose: Pose, aspect: number): Pose => {
  const scale = viewBoxHeight(aspect);
  const projected: Pose = {};

  for (const def of JOINT_SEQUENCE) {
    const point = pose[def.id];

    if (point) {
      projected[def.id] = {
        x: point.x * VIEWBOX_WIDTH,
        y: point.y * scale,
      };
    }
  }

  return projected;
};

const footCenter = (pose: Pose): Point | undefined => {
  if (pose.ankleL && pose.ankleR) {
    return midpoint(pose.ankleL, pose.ankleR);
  }

  return pose.ankleL ?? pose.ankleR;
};

const buildActionLine = (pose: Pose): Point[] => {
  const feet = footCenter(pose);
  const anchors = [pose.headTop, pose.chest, pose.pelvis, feet].filter((point): point is Point =>
    Boolean(point),
  );

  if (anchors.length < 2) {
    return [];
  }

  return smoothCurve(anchors);
};

const buildMasses = (pose: Pose): Mass[] => {
  const masses: Mass[] = [];
  const { headTop, chin, shoulderL, shoulderR, pelvis, hipL, hipR } = pose;

  if (headTop && chin) {
    const height = distance(headTop, chin);

    masses.push({
      kind: 'ellipse',
      id: 'head',
      center: midpoint(headTop, chin),
      // A human skull reads as an egg roughly three quarters as wide as tall.
      rx: (height / 2) * 0.76,
      ry: height / 2,
      // The ellipse is authored upright, so align it with the head axis.
      rotation: angleDeg(headTop, chin) - 90,
    });
  }

  if (shoulderL && shoulderR && pelvis) {
    const shoulderMid = midpoint(shoulderL, shoulderR);
    // The ribcage stops short of the pelvis: the gap is the soft waist.
    const ribBottom = lerp(shoulderMid, pelvis, 0.78);

    masses.push({
      kind: 'ellipse',
      id: 'ribcage',
      center: midpoint(shoulderMid, ribBottom),
      rx: (distance(shoulderL, shoulderR) / 2) * 0.94,
      ry: distance(shoulderMid, ribBottom) / 2,
      rotation: angleDeg(shoulderMid, ribBottom) - 90,
    });
  }

  if (hipL && hipR && pelvis) {
    const width = distance(hipL, hipR);
    const axis = angleDeg(hipL, hipR);
    // Drop perpendicular to the hip line so the box follows the pelvic tilt.
    const downRad = ((axis + 90) * Math.PI) / 180;
    const depth = width * 0.62;
    const dx = Math.cos(downRad) * depth;
    const dy = Math.sin(downRad) * depth;
    const inset = width * 0.14;
    const insetX = Math.cos((axis * Math.PI) / 180) * inset;
    const insetY = Math.sin((axis * Math.PI) / 180) * inset;

    masses.push({
      kind: 'quad',
      id: 'pelvis',
      points: [
        { x: hipL.x, y: hipL.y },
        { x: hipR.x, y: hipR.y },
        { x: hipR.x + dx - insetX, y: hipR.y + dy - insetY },
        { x: hipL.x + dx + insetX, y: hipL.y + dy + insetY },
      ],
    });
  }

  return masses;
};

type BoneSpec = [
  id: string,
  from: keyof Pose,
  to: keyof Pose,
  group: Bone['group'],
  weight: number,
];

const BONE_SPECS: BoneSpec[] = [
  ['neck', 'chin', 'neck', 'head', 1],
  ['spineUpper', 'neck', 'chest', 'torso', 1.6],
  ['spineLower', 'chest', 'pelvis', 'torso', 1.6],
  ['clavicleL', 'neck', 'shoulderL', 'torso', 0.9],
  ['clavicleR', 'neck', 'shoulderR', 'torso', 0.9],
  ['pelvisL', 'pelvis', 'hipL', 'torso', 0.9],
  ['pelvisR', 'pelvis', 'hipR', 'torso', 0.9],
  ['upperArmL', 'shoulderL', 'elbowL', 'arms', 1.2],
  ['forearmL', 'elbowL', 'wristL', 'arms', 1],
  ['upperArmR', 'shoulderR', 'elbowR', 'arms', 1.2],
  ['forearmR', 'elbowR', 'wristR', 'arms', 1],
  ['thighL', 'hipL', 'kneeL', 'legs', 1.4],
  ['shinL', 'kneeL', 'ankleL', 'legs', 1.2],
  ['thighR', 'hipR', 'kneeR', 'legs', 1.4],
  ['shinR', 'kneeR', 'ankleR', 'legs', 1.2],
];

const buildBones = (pose: Pose): Bone[] => {
  const bones: Bone[] = [];

  for (const [id, fromId, toId, group, weight] of BONE_SPECS) {
    const from = pose[fromId];
    const to = pose[toId];

    if (from && to) {
      bones.push({ id, from, to, group, weight });
    }
  }

  return bones;
};

type MarkerSpec = [id: keyof Pose, group: JointMarker['group'], scale: number];

const MARKER_SPECS: MarkerSpec[] = [
  ['neck', 'head', 0.1],
  ['shoulderL', 'torso', 0.15],
  ['shoulderR', 'torso', 0.15],
  ['chest', 'torso', 0.1],
  ['pelvis', 'torso', 0.11],
  ['hipL', 'torso', 0.15],
  ['hipR', 'torso', 0.15],
  ['elbowL', 'arms', 0.12],
  ['elbowR', 'arms', 0.12],
  ['wristL', 'arms', 0.09],
  ['wristR', 'arms', 0.09],
  ['kneeL', 'legs', 0.13],
  ['kneeR', 'legs', 0.13],
  ['ankleL', 'legs', 0.09],
  ['ankleR', 'legs', 0.09],
];

const buildJointMarkers = (pose: Pose, headUnit: number): JointMarker[] => {
  const markers: JointMarker[] = [];

  for (const [id, group, scale] of MARKER_SPECS) {
    const at = pose[id];

    if (at) {
      markers.push({ id, at, radius: headUnit * scale, group });
    }
  }

  return markers;
};

const buildAxis = (from: Point | undefined, to: Point | undefined): Axis | null => {
  if (!(from && to)) {
    return null;
  }

  return { from, to, tiltDeg: round(angleDeg(from, to)) };
};

// Falls back to a fraction of the marked bounding box when the head landmarks
// are missing, so partial poses still render sensible markers.
const estimateHeadUnit = (pose: Pose, aspect: number): number | null => {
  if (pose.headTop && pose.chin) {
    return distance(pose.headTop, pose.chin);
  }

  const points = Object.values(pose).filter((point): point is Point => Boolean(point));

  if (points.length < 2) {
    return null;
  }

  const ys = points.map((point) => point.y);
  const span = Math.max(...ys) - Math.min(...ys);

  return span > 0 ? span / 7.5 : viewBoxHeight(aspect) / 7.5;
};

const buildMetrics = (
  pose: Pose,
  headUnit: number | null,
  shoulders: Axis | null,
  hips: Axis | null,
): Metrics => {
  const feet = footCenter(pose);
  let headsTall: number | null = null;

  if (headUnit && headUnit > 0 && pose.headTop && feet) {
    const verticalSpan = Math.abs(feet.y - pose.headTop.y);

    headsTall = round(verticalSpan / headUnit + FOOT_HEIGHT_IN_HEADS, 2);
  }

  const shoulderTiltDeg = shoulders?.tiltDeg ?? null;
  const hipTiltDeg = hips?.tiltDeg ?? null;

  return {
    headUnit,
    headsTall,
    shoulderTiltDeg,
    hipTiltDeg,
    contrappostoDeg:
      shoulderTiltDeg === null || hipTiltDeg === null
        ? null
        : round(Math.abs(shoulderTiltDeg - hipTiltDeg)),
  };
};

/**
 * Turns the marked landmarks into the full structural sketch: action line,
 * blocked-in masses, wireframe bones, articulation circles and the proportion
 * metrics used to coach the drawing.
 *
 * @param pose Landmarks in normalized image space.
 * @param aspect Reference image aspect ratio (`width / height`).
 * @returns The sketch geometry in SVG user-space, plus its metrics.
 */
export const buildSkeleton = (pose: Pose, aspect: number): Skeleton => {
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const projected = toViewBox(pose, safeAspect);
  const headUnit = estimateHeadUnit(projected, safeAspect);
  const shoulders = buildAxis(projected.shoulderL, projected.shoulderR);
  const hips = buildAxis(projected.hipL, projected.hipR);

  return {
    actionLine: buildActionLine(projected),
    masses: buildMasses(projected),
    bones: buildBones(projected),
    joints: buildJointMarkers(projected, headUnit ?? viewBoxHeight(safeAspect) / 7.5),
    axes: { shoulders, hips },
    metrics: buildMetrics(projected, headUnit, shoulders, hips),
  };
};
