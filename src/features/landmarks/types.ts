/**
 * A point expressed in normalized image space: `0` is the left/top edge of the
 * reference image and `1` is the right/bottom edge. Storing points this way
 * keeps a marked set of landmarks valid at any display size.
 */
export type Point = {
  x: number;
  y: number;
};

/** One landmark the user can place, in the order they are asked for. */
export type LandmarkDef = {
  id: string;
  /** Colour of the marker, grouping related landmarks by eye. */
  color: string;
};

/** The landmarks marked so far, keyed by landmark id. */
export type Marks = Record<string, Point | undefined>;
