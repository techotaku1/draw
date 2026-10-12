import type { Marks, Point } from './types';

/**
 * Width of the SVG user-space every overlay is built in. Geometry is emitted
 * in this space (not in normalized units) so that radii, stroke weights and
 * rotations stay uniform whatever the aspect ratio of the reference image.
 */
export const VIEWBOX_WIDTH = 1000;

/**
 * Height of the SVG user-space that pairs with {@link VIEWBOX_WIDTH}.
 * @param aspect Reference image aspect ratio (`width / height`).
 * @returns The matching viewBox height in user units.
 */
export const viewBoxHeight = (aspect: number): number => VIEWBOX_WIDTH / aspect;

/**
 * Projects normalized marks into the SVG user-space defined above.
 * @param marks Landmarks in normalized image space.
 * @param aspect Reference image aspect ratio (`width / height`).
 * @param ids The landmark ids to project, in any order.
 * @returns The same landmarks, in user units.
 */
export const toViewBox = (marks: Marks, aspect: number, ids: readonly string[]): Marks => {
  const scale = viewBoxHeight(aspect);
  const projected: Marks = {};

  for (const id of ids) {
    const point = marks[id];

    if (point) {
      projected[id] = { x: point.x * VIEWBOX_WIDTH, y: point.y * scale };
    }
  }

  return projected;
};

export const distance = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export const midpoint = (a: Point, b: Point): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// Signed angle of `a -> b` against the horizontal, in degrees.
export const angleDeg = (a: Point, b: Point): number =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;

export const round = (value: number, decimals = 1): number => {
  const factor = 10 ** decimals;

  return Math.round(value * factor) / factor;
};
