/** A drawable layer of the structural sketch. */
export type Layer = 'actionLine' | 'masses' | 'axes' | 'bones' | 'joints';

type StepId = 'actionLine' | 'masses' | 'axes' | 'bones' | 'joints' | 'volume';

export type Step = {
  id: StepId;
  /** Layers revealed once the student reaches this step. */
  layers: Layer[];
};

/**
 * The teaching sequence. Each step only adds one new idea on top of the
 * previous one, which is the whole point: gesture before structure, structure
 * before anatomy, anatomy before detail.
 */
export const STEPS: Step[] = [
  { id: 'actionLine', layers: ['actionLine'] },
  { id: 'masses', layers: ['actionLine', 'masses'] },
  { id: 'axes', layers: ['actionLine', 'masses', 'axes'] },
  { id: 'bones', layers: ['actionLine', 'masses', 'axes', 'bones'] },
  { id: 'joints', layers: ['actionLine', 'masses', 'axes', 'bones', 'joints'] },
  { id: 'volume', layers: ['actionLine', 'masses', 'axes', 'bones', 'joints'] },
];

export const STEP_COUNT = STEPS.length;

/** Every layer at once, for the PNG export and nothing else. */
export const ALL_LAYERS: Layer[] = ['actionLine', 'masses', 'axes', 'bones', 'joints'];

export const layersForStep = (index: number): Layer[] =>
  STEPS[Math.min(Math.max(index, 0), STEPS.length - 1)]?.layers ?? [];
