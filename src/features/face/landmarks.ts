export type FaceLandmarkId =
  | 'crownTop'
  | 'templeL'
  | 'templeR'
  | 'brow'
  | 'eyeL'
  | 'eyeR'
  | 'jawL'
  | 'jawR'
  | 'chin'
  | 'noseTip'
  | 'mouth';

export const FACE_COLOR = {
  cranium: '#f97316',
  eyes: '#2563eb',
  jaw: '#db2777',
  features: '#16a34a',
} as const;

/**
 * Capture order. It follows the construction taught in the guide: the cranium
 * circle first, then the eye line that sits at its lower edge, then the V of
 * the jaw, and only then the features that hang off those axes.
 */
export const FACE_SEQUENCE: readonly { id: FaceLandmarkId; color: string }[] = [
  { id: 'crownTop', color: FACE_COLOR.cranium },
  { id: 'templeL', color: FACE_COLOR.cranium },
  { id: 'templeR', color: FACE_COLOR.cranium },
  { id: 'brow', color: FACE_COLOR.eyes },
  { id: 'eyeL', color: FACE_COLOR.eyes },
  { id: 'eyeR', color: FACE_COLOR.eyes },
  { id: 'jawL', color: FACE_COLOR.jaw },
  { id: 'jawR', color: FACE_COLOR.jaw },
  { id: 'chin', color: FACE_COLOR.jaw },
  { id: 'noseTip', color: FACE_COLOR.features },
  { id: 'mouth', color: FACE_COLOR.features },
];

export const FACE_IDS: readonly string[] = FACE_SEQUENCE.map((def) => def.id);

export const FACE_COUNT = FACE_SEQUENCE.length;

// The shared canvas speaks plain string ids; this narrows them back without a
// cast, so an unknown id is ignored instead of corrupting the marks.
export const isFaceId = (id: string): id is FaceLandmarkId =>
  FACE_SEQUENCE.some((def) => (def.id as string) === id);
