/** Drawing style the figure is being blocked in for. */
export type ArtStyle = 'anime' | 'manga' | 'comic' | 'chibi';

export const ART_STYLES: ArtStyle[] = ['anime', 'manga', 'comic', 'chibi'];

export type StylePreset = {
  id: ArtStyle;
  /** Canonical figure height for the style, measured in head units. */
  headsTall: { min: number; max: number };
};

export const STYLE_PRESETS: Record<ArtStyle, StylePreset> = {
  anime: { id: 'anime', headsTall: { min: 6.5, max: 7.5 } },
  manga: { id: 'manga', headsTall: { min: 7.5, max: 8.5 } },
  comic: { id: 'comic', headsTall: { min: 8, max: 9 } },
  chibi: { id: 'chibi', headsTall: { min: 2, max: 3 } },
};

export type ProportionVerdict = 'unknown' | 'short' | 'onModel' | 'tall';

/**
 * Compares the measured figure height against the target style range.
 * @param headsTall Measured figure height in head units, or `null` when the
 * head and ankle landmarks are not marked yet.
 * @param style The drawing style whose canonical range is the target.
 * @returns How the measurement sits against that range.
 */
export const judgeProportion = (headsTall: number | null, style: ArtStyle): ProportionVerdict => {
  if (headsTall === null) {
    return 'unknown';
  }

  const { min, max } = STYLE_PRESETS[style].headsTall;

  if (headsTall < min) {
    return 'short';
  }

  if (headsTall > max) {
    return 'tall';
  }

  return 'onModel';
};
