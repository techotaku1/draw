import type { Point } from '@/features/landmarks/types';

/** Anatomical landmarks the user marks on the reference image. */
export type JointId =
  | 'headTop'
  | 'chin'
  | 'neck'
  | 'shoulderL'
  | 'shoulderR'
  | 'elbowL'
  | 'elbowR'
  | 'wristL'
  | 'wristR'
  | 'chest'
  | 'pelvis'
  | 'hipL'
  | 'hipR'
  | 'kneeL'
  | 'kneeR'
  | 'ankleL'
  | 'ankleR';

/** Body region a landmark or bone belongs to, used for grouping and color. */
export type JointGroup = 'head' | 'torso' | 'arms' | 'legs';

/** The landmarks marked so far. A pose is partial until every joint is set. */
export type Pose = Partial<Record<JointId, Point>>;

/** A straight segment between two landmarks — a "bone" of the wireframe. */
export type Bone = {
  id: string;
  from: Point;
  to: Point;
  group: JointGroup;
  /** Relative stroke weight, larger for the spine and the big limb segments. */
  weight: number;
};

/** A circle drawn on a landmark, the classic articulation marker. */
export type JointMarker = {
  id: JointId;
  at: Point;
  radius: number;
  group: JointGroup;
};

/** A geometric primitive of the "encaje" — the blocked-in volume pass. */
export type Mass =
  | {
      kind: 'head';
      id: 'head';
      /** The skull: a circle touching the top of the head. */
      cranium: { center: Point; radius: number };
      /** Cheek lines and jaw, from one side of the cranium to the other. */
      jaw: Point[];
    }
  | {
      kind: 'ellipse';
      id: 'ribcage';
      center: Point;
      rx: number;
      ry: number;
      /** Rotation in degrees, clockwise, around `center`. */
      rotation: number;
    }
  | {
      kind: 'quad';
      id: 'pelvis';
      points: [Point, Point, Point, Point];
    };

/** A tilt reference line, used to read the contrapposto of the pose. */
export type Axis = {
  from: Point;
  to: Point;
  /** Signed angle against the horizontal, in degrees. */
  tiltDeg: number;
};

/** Measurements derived from the pose, used to coach proportions. */
export type Metrics = {
  /** Head height in normalized units, the module every proportion uses. */
  headUnit: number | null;
  /** Figure height expressed in head units — the "N heads tall" rule. */
  headsTall: number | null;
  shoulderTiltDeg: number | null;
  hipTiltDeg: number | null;
  /** Opposition between the shoulder and hip axes. Zero reads as stiff. */
  contrappostoDeg: number | null;
};

/** Everything needed to draw the structural sketch over the reference image. */
export type Skeleton = {
  /** Sampled polyline of the sweeping curve through the pose. */
  actionLine: Point[];
  masses: Mass[];
  bones: Bone[];
  joints: JointMarker[];
  axes: {
    shoulders: Axis | null;
    hips: Axis | null;
  };
  metrics: Metrics;
};
