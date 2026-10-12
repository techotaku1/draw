/** Age register the face is being constructed for. */
export type FaceAge = 'adult' | 'young' | 'chibi';

export const FACE_AGES: FaceAge[] = ['adult', 'young', 'chibi'];

export type AgePreset = {
  id: FaceAge;
  /** Head height divided by cranium width. Lower reads rounder, so younger. */
  headRatio: { min: number; max: number };
  /** Eye line position from crown (`0`) to chin (`1`). */
  eyeLevel: { min: number; max: number };
};

/**
 * The guides state the rule qualitatively — a rounder head and lower eyes read
 * younger, a longer jaw reads older — so these ranges are that rule written
 * down as numbers, not figures quoted from the source.
 */
export const AGE_PRESETS: Record<FaceAge, AgePreset> = {
  adult: { id: 'adult', headRatio: { min: 1.35, max: 1.6 }, eyeLevel: { min: 0.48, max: 0.58 } },
  young: { id: 'young', headRatio: { min: 1.15, max: 1.4 }, eyeLevel: { min: 0.55, max: 0.66 } },
  chibi: { id: 'chibi', headRatio: { min: 0.95, max: 1.2 }, eyeLevel: { min: 0.62, max: 0.75 } },
};

export type Verdict = 'unknown' | 'low' | 'onModel' | 'high';

/**
 * Places a measurement against the range expected for the chosen age.
 * @param value The measured ratio or level, or `null` when not measurable.
 * @param range The target range for the selected age.
 * @returns Where the measurement falls relative to that range.
 */
export const judge = (value: number | null, range: { min: number; max: number }): Verdict => {
  if (value === null) {
    return 'unknown';
  }

  if (value < range.min) {
    return 'low';
  }

  return value > range.max ? 'high' : 'onModel';
};
