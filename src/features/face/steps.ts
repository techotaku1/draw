/** A drawable layer of the face construction. */
export type FaceLayer =
  | 'headBox'
  | 'cranium'
  | 'jaw'
  | 'axis'
  | 'hairLine'
  | 'browLine'
  | 'eyeLine'
  | 'fifth'
  | 'noseArc'
  | 'noseLine'
  | 'mouthLine'
  | 'chinLine';

type FaceStepId = 'headBox' | 'cranium' | 'jaw' | 'axis' | 'browLine' | 'features';

export type FaceStep = {
  id: FaceStepId;
  layers: FaceLayer[];
};

/**
 * The teaching sequence, in the order the guide builds a head: the cranium
 * circle first, the V of the jaw under it, then the axes that place the eyes,
 * and only last the features that hang off them.
 */
export const FACE_STEPS: FaceStep[] = [
  { id: 'headBox', layers: ['headBox'] },
  { id: 'cranium', layers: ['headBox', 'cranium'] },
  { id: 'jaw', layers: ['headBox', 'cranium', 'jaw'] },
  { id: 'axis', layers: ['headBox', 'cranium', 'jaw', 'axis'] },
  {
    id: 'browLine',
    layers: ['headBox', 'cranium', 'jaw', 'axis', 'hairLine', 'browLine', 'eyeLine', 'fifth'],
  },
  {
    id: 'features',
    layers: [
      'headBox',
      'cranium',
      'jaw',
      'axis',
      'hairLine',
      'browLine',
      'eyeLine',
      'fifth',
      'noseArc',
      'noseLine',
      'mouthLine',
      'chinLine',
    ],
  },
];

export const FACE_STEP_COUNT = FACE_STEPS.length;

/**
 * What the printed or downloaded sheet carries: the construction a manga
 * artist rules before drawing a head — cranium, cheek lines and jaw, the
 * centre line and the horizontal divisions — and nothing else. The head box,
 * the five-eye grid and the nose arc are measuring aids for checking the
 * landmarks on screen; on a page meant to be drawn over they are clutter the
 * artist would have to erase.
 */
export const SHEET_FACE_LAYERS: FaceLayer[] = [
  'cranium',
  'jaw',
  'axis',
  'hairLine',
  'browLine',
  'eyeLine',
  'noseLine',
  'mouthLine',
  'chinLine',
];

export const faceLayersForStep = (index: number): FaceLayer[] =>
  FACE_STEPS[Math.min(Math.max(index, 0), FACE_STEPS.length - 1)]?.layers ?? [];
