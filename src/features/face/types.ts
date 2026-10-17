import type { Point } from '@/features/landmarks/types';

/**
 * A straight guide drawn across the construction, as its two ends. The
 * horizontals cross the whole head; the five-eye verticals run crown to chin.
 */
export type GuideLine = {
  id: string;
  points: Point[];
  kind: 'hairLine' | 'browLine' | 'eyeLine' | 'fifth' | 'noseLine' | 'mouthLine' | 'chinLine';
};

/** Measurements derived from the marked face, used to coach proportions. */
export type FaceMetrics = {
  /** Head height in user units, from the crown to the chin. */
  headHeight: number | null;
  /** Head height divided by cranium width. Higher reads as an older face. */
  headRatio: number | null;
  /**
   * Where the eye line sits down the head, `0` at the crown and `1` at the
   * chin. The anime construction puts it at the lower edge of the cranium.
   */
  eyeLevel: number | null;
  /**
   * Signed gap between the eye line and the bottom of the cranium circle, as a
   * fraction of head height. Negative means the eyes sit above that edge.
   */
  eyeVsCranium: number | null;
  /** Eye separation as a fraction of cranium width. */
  eyeSpread: number | null;
  /** Tilt of the eye line against the horizontal, in degrees. */
  eyeTiltDeg: number | null;
  /** Nose position between the eye line and the chin. */
  noseLevel: number | null;
  /** Mouth position between the eye line and the chin. */
  mouthLevel: number | null;
  /**
   * How far the nose and mouth drift off the symmetry axis, as a fraction of
   * cranium width. The guide insists both stay aligned with it.
   */
  featureDrift: number | null;
};

/** Everything needed to draw the face construction over the reference image. */
export type FaceGuides = {
  /** The cranium circle: the shape every other measurement hangs off. */
  cranium: { center: Point; radius: number } | null;
  /**
   * The frame that boxes the head, as four corners. It follows the head axis
   * rather than the screen, so a tilted head gets a tilted box — which is what
   * makes it useful for checking proportion.
   */
  headBox: Point[];
  /**
   * Cheek lines and jaw, left to right: from the cranium down to one jaw
   * corner, across a short flat chin and up to the cranium on the other side.
   * Without a cranium, just the V from one corner through the chin to the
   * other.
   */
  jaw: Point[];
  /** Sampled polyline of the symmetry axis, running just past the crown and the chin. */
  axis: Point[];
  /** Curve joining both eyes through the nose. */
  noseArc: Point[];
  lines: GuideLine[];
  metrics: FaceMetrics;
};
