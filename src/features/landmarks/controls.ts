/**
 * Shared control styling. Selection is a chalk-on-graphite inversion rather
 * than a colour: the only saturated pixels on screen belong to the drawing.
 */

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk';

/** Quiet default action. */
export const BUTTON = `rounded-md border border-graphite-700 px-3 py-1.5 text-[13px] text-chalk-dim transition-colors hover:border-graphite-600 hover:text-chalk disabled:opacity-35 disabled:hover:border-graphite-700 ${FOCUS}`;

/** The single filled action in a given context. */
export const BUTTON_SOLID = `rounded-md bg-chalk px-3 py-1.5 text-[13px] font-medium text-graphite-950 transition-opacity hover:opacity-85 disabled:opacity-35 ${FOCUS}`;

// One option inside a segmented control.
export const segment = (isActive: boolean): string =>
  `px-3 py-1.5 text-[13px] transition-colors ${FOCUS} ${
    isActive ? 'bg-chalk text-graphite-950' : 'text-chalk-dim hover:text-chalk'
  }`;

export const SEGMENT_GROUP =
  'flex overflow-hidden rounded-md border border-graphite-700 divide-x divide-graphite-700';

// A landmark in the capture list: pending, marked, or currently active.
export const chip = (isActive: boolean, isMarked: boolean): string => {
  const base = `rounded px-2 py-1 text-[12px] transition-colors ${FOCUS}`;

  if (isActive) {
    return `${base} bg-chalk text-graphite-950`;
  }

  return isMarked
    ? `${base} bg-graphite-800 text-chalk-dim hover:text-chalk`
    : `${base} text-chalk-faint hover:text-chalk-dim`;
};

/** Section heading inside the side panel. */
export const PANEL_TITLE = 'text-[13px] font-medium text-chalk';

export const PANEL_NOTE = 'text-[12px] leading-relaxed text-chalk-faint';

/** A measurement row: label left, value right, digits aligned. */
export const METRIC_LABEL = 'text-[13px] text-chalk-dim';
export const METRIC_VALUE = 'text-right text-[13px] text-chalk tabular-nums';

/** Advice that reads as guidance rather than an error. */
export const ADVICE =
  'rounded-md bg-graphite-900 px-3 py-2 text-[12px] leading-relaxed text-chalk-dim';
export const ADVICE_WARN =
  'rounded-md bg-graphite-800 px-3 py-2 text-[12px] leading-relaxed text-chalk';
