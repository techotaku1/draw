import { describe, expect, it } from 'vitest';
import type { Marks } from '@/features/landmarks/types';
import { buildFaceGuides } from './guides';

type Corner = { x: number; y: number };

/**
 * How far the top edge of a head box departs from level.
 *
 * @param box The four corners plus the closing one.
 * @returns The vertical gap between the two top corners.
 */
const tilt = (box: Corner[]) => Math.abs((box.at(0)?.y ?? 0) - (box.at(1)?.y ?? 0));

/**
 * Direction of a sampled guide, end to end.
 *
 * @param points The sampled polyline.
 * @returns Its heading in radians.
 */
const heading = (points: Corner[] | undefined) =>
  Math.atan2(
    (points?.at(-1)?.y ?? 0) - (points?.at(0)?.y ?? 0),
    (points?.at(-1)?.x ?? 0) - (points?.at(0)?.x ?? 0),
  );

/**
 * End-to-end length of a sampled guide.
 *
 * @param points The sampled polyline.
 * @returns The distance between its two ends.
 */
const span = (points: Corner[] | undefined) =>
  Math.hypot(
    (points?.at(-1)?.x ?? 0) - (points?.at(0)?.x ?? 0),
    (points?.at(-1)?.y ?? 0) - (points?.at(0)?.y ?? 0),
  );

/**
 * Straight-line distance between two sampled points.
 *
 * @param from One end.
 * @param to The other end.
 * @returns The distance between them.
 */
const gap = (from: Corner | undefined, to: Corner | undefined) =>
  Math.hypot((from?.x ?? 0) - (to?.x ?? 0), (from?.y ?? 0) - (to?.y ?? 0));

/** Reference head shipped in `public/assets/images/reference-face.svg`. */
const W = 400;
const H = 520;
const ASPECT = W / H;

const at = (x: number, y: number) => ({ x: x / W, y: y / H });

// Cranium circle spans y 60..320 with a radius of 130; the chin hangs at 430
// and the eye line sits at 265, inside the lower part of that circle.
const sampleFace: Marks = {
  crownTop: at(200, 60),
  templeL: at(70, 190),
  templeR: at(330, 190),
  eyeL: at(145, 265),
  eyeR: at(255, 265),
  jawL: at(95, 268),
  jawR: at(305, 268),
  chin: at(200, 430),
  noseTip: at(200, 340),
  mouth: at(200, 385),
};

describe(buildFaceGuides, () => {
  describe('metrics', () => {
    it('reads the head as an adult oval rather than a child circle', () => {
      const { metrics } = buildFaceGuides(sampleFace, ASPECT);

      expect(metrics.headRatio).toBeCloseTo(1.42, 1);
    });

    it('places the eye line just past halfway down the head', () => {
      const { metrics } = buildFaceGuides(sampleFace, ASPECT);

      expect(metrics.eyeLevel).toBeCloseTo(0.554, 2);
    });

    it('keeps the eye line inside the cranium circle', () => {
      const { metrics } = buildFaceGuides(sampleFace, ASPECT);

      // Negative means the eyes sit above the bottom edge, as the guide asks.
      expect(metrics.eyeVsCranium).toBeLessThan(0);
    });

    it('reports no drift when nose and mouth sit on the symmetry axis', () => {
      const { metrics } = buildFaceGuides(sampleFace, ASPECT);

      expect(metrics.featureDrift).toBeCloseTo(0, 2);
    });

    it('catches a nose pushed off the symmetry axis', () => {
      const crooked: Marks = { ...sampleFace, noseTip: at(250, 340) };

      const { metrics } = buildFaceGuides(crooked, ASPECT);

      expect(metrics.featureDrift ?? 0).toBeGreaterThan(0.1);
    });

    it('reports nothing measurable for an empty face', () => {
      const { metrics, cranium } = buildFaceGuides({}, ASPECT);

      expect(metrics.headRatio).toBeNull();
      expect(cranium).toBeNull();
    });
  });

  describe('geometry', () => {
    it('anchors the cranium circle on the crown', () => {
      const { cranium } = buildFaceGuides(sampleFace, ASPECT);

      expect(cranium).not.toBeNull();
      expect((cranium?.center.y ?? 0) - (cranium?.radius ?? 0)).toBeCloseTo(
        (60 / H) * (1000 / ASPECT),
        0,
      );
    });

    it('keeps the cranium on all three skull points when the head tilts', () => {
      // Same skull rolled clockwise: the temples no longer share a height, and
      // a circle built from a width plus a vertical drop leaves the crown.
      const tilted: Marks = {
        ...sampleFace,
        crownTop: at(240, 75),
        templeL: at(80, 150),
        templeR: at(325, 240),
      };

      const { cranium } = buildFaceGuides(tilted, ASPECT);
      const scale = 1000 / W;
      const reach = (x: number, y: number) =>
        Math.hypot(x * scale - (cranium?.center.x ?? 0), y * scale - (cranium?.center.y ?? 0));

      for (const [x, y] of [
        [240, 75],
        [80, 150],
        [325, 240],
      ]) {
        expect(reach(x ?? 0, y ?? 0)).toBeCloseTo(cranium?.radius ?? 0, 0);
      }
    });

    it('keeps the cranium plausible when a temple is dragged across the other', () => {
      // Reproduces a real mis-drag: the left temple pulled past the right one
      // leaves crown and temples near-collinear, and the circle through three
      // such points runs away — it measured a radius of 641 against a sane 199,
      // centred outside the picture.
      const misdragged: Marks = {
        ...sampleFace,
        templeL: at(250, 205),
        templeR: at(330, 190),
      };

      const { cranium } = buildFaceGuides(misdragged, ASPECT);
      const templeSpan = Math.hypot(330 - 250, 190 - 205) * (1000 / W);

      expect(cranium).not.toBeNull();
      expect(cranium?.radius ?? 0).toBeLessThanOrEqual(templeSpan);
      // The crown still anchors it, so the fallback reads as a head.
      expect(
        Math.hypot(
          200 * (1000 / W) - (cranium?.center.x ?? 0),
          60 * (1000 / W) - (cranium?.center.y ?? 0),
        ),
      ).toBeCloseTo(cranium?.radius ?? 0, 0);
    });

    it('boxes the head in a frame that leans with it', () => {
      const upright = buildFaceGuides(sampleFace, ASPECT).headBox;
      const leaning = buildFaceGuides({ ...sampleFace, chin: at(260, 430) }, ASPECT).headBox;

      // Four corners plus the repeated first one that closes the path.
      expect(upright).toHaveLength(5);
      expect(upright.at(0)).toStrictEqual(upright.at(-1));

      // Upright head: the top edge is level. Leaning head: it is not.
      expect(tilt(upright)).toBeCloseTo(0, 1);
      expect(tilt(leaning)).toBeGreaterThan(1);
    });

    it('rules the brow line parallel to the eyes', () => {
      const withBrow: Marks = { ...sampleFace, brow: at(200, 240) };
      const { lines } = buildFaceGuides(withBrow, ASPECT);
      const brow = lines.find((line) => line.kind === 'browLine');
      const eyes = lines.find((line) => line.kind === 'eyeLine');

      expect(brow).toBeDefined();
      expect(heading(brow?.points)).toBeCloseTo(heading(eyes?.points), 2);
    });

    it('rules the nose line parallel to the eyes, narrower than the mouth', () => {
      const { lines } = buildFaceGuides(sampleFace, ASPECT);
      const nose = lines.find((line) => line.kind === 'noseLine');
      const mouth = lines.find((line) => line.kind === 'mouthLine');
      const eyes = lines.find((line) => line.kind === 'eyeLine');

      expect(nose).toBeDefined();
      expect(heading(nose?.points)).toBeCloseTo(heading(eyes?.points), 2);
      expect(span(nose?.points)).toBeLessThan(span(mouth?.points));
    });

    it('rules the five Loomis divisions from the hairline down to the chin', () => {
      const withBrow: Marks = { ...sampleFace, brow: at(200, 225) };
      const { lines } = buildFaceGuides(withBrow, ASPECT);
      const height = (kind: string) => {
        const points = lines.find((line) => line.kind === kind)?.points ?? [];

        return points.reduce((sum, point) => sum + point.y, 0) / (points.length || 1);
      };

      // Hairline, brow, eyes, nose, mouth, chin — strictly top to bottom.
      const order = ['hairLine', 'browLine', 'eyeLine', 'noseLine', 'mouthLine', 'chinLine'];

      for (const kind of order) {
        expect(lines.some((line) => line.kind === kind)).toBeTruthy();
      }

      for (const [index, kind] of order.slice(1).entries()) {
        expect(height(kind)).toBeGreaterThan(height(order[index] ?? ''));
      }
    });

    it('derives the hairline above the brow without a landmark of its own', () => {
      const noBrow = buildFaceGuides(sampleFace, ASPECT);
      const withBrow = buildFaceGuides({ ...sampleFace, brow: at(200, 225) }, ASPECT);

      // It is built from brow and chin, so it cannot exist without the brow.
      expect(noBrow.lines.some((line) => line.kind === 'hairLine')).toBeFalsy();
      expect(withBrow.lines.some((line) => line.kind === 'hairLine')).toBeTruthy();
    });

    it('starts and ends the jaw on the cranium circle', () => {
      const { jaw, cranium } = buildFaceGuides(sampleFace, ASPECT);
      const offCircle = (point: Corner | undefined) =>
        Math.abs(gap(point, cranium?.center) - (cranium?.radius ?? 0));

      expect(offCircle(jaw.at(0))).toBeCloseTo(0, 6);
      expect(offCircle(jaw.at(-1))).toBeCloseTo(0, 6);
    });

    it('runs the jaw through the marked corners, not merely toward them', () => {
      const { jaw } = buildFaceGuides(sampleFace, ASPECT);
      const { jaw: plain } = buildFaceGuides({ ...sampleFace, crownTop: undefined }, ASPECT);
      const closest = (target: Corner | undefined) =>
        Math.min(...jaw.map((point) => gap(point, target)));

      // `plain` has no cranium, so its three vertices are the marked corners
      // and chin in view-box space. A single quadratic only leaned toward
      // them, which drew a jaw narrower than the one the artist marked.
      expect(closest(plain.at(0))).toBeCloseTo(0, 6);
      expect(closest(plain.at(1))).toBeCloseTo(0, 6);
      expect(closest(plain.at(2))).toBeCloseTo(0, 6);
    });

    it('leaves the cranium tangentially so skull and jaw read as one outline', () => {
      const { jaw, cranium } = buildFaceGuides(sampleFace, ASPECT);

      // Angle between the radius at the start point and the direction the
      // curve sets off in. Ninety degrees means the curve continues the
      // circle instead of cutting across it or creasing against it.
      const leaving = (from: Corner | undefined, next: Corner | undefined) => {
        const radius = {
          x: (from?.x ?? 0) - (cranium?.center.x ?? 0),
          y: (from?.y ?? 0) - (cranium?.center.y ?? 0),
        };
        const heads = { x: (next?.x ?? 0) - (from?.x ?? 0), y: (next?.y ?? 0) - (from?.y ?? 0) };
        const cosine =
          (radius.x * heads.x + radius.y * heads.y) /
          (Math.hypot(radius.x, radius.y) * Math.hypot(heads.x, heads.y));

        return (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
      };

      // One degree of slack: the measurement uses the first sampled chord,
      // which leans a fraction off the true tangent at the start point.
      expect(Math.abs(leaving(jaw.at(0), jaw.at(1)) - 90)).toBeLessThan(1);
      expect(Math.abs(leaving(jaw.at(-1), jaw.at(-2)) - 90)).toBeLessThan(1);
    });

    it('falls back to a bare V when there is no cranium to attach to', () => {
      const noCranium: Marks = { jawL: at(140, 300), jawR: at(260, 300), chin: at(200, 420) };
      const { jaw, cranium } = buildFaceGuides(noCranium, ASPECT);

      expect(cranium).toBeNull();
      expect(jaw).toHaveLength(3);
    });

    it('divides the face into five eye-widths with six verticals', () => {
      const { lines } = buildFaceGuides(sampleFace, ASPECT);
      const verticals = lines.filter((line) => line.kind === 'fifth');
      const across = verticals
        .map((line) => line.points.at(0)?.x ?? 0)
        .toSorted((left, right) => left - right);

      // Inner corners, outer corners and the sides of the face, mirrored.
      expect(verticals).toHaveLength(6);

      // Evenly spaced: each gap is one eye-width, which is what makes the
      // grid a ruler rather than six lines that happen to be vertical.
      const gaps = across.slice(1).map((edge, index) => edge - (across[index] ?? 0));

      for (const width of gaps) {
        expect(width).toBeCloseTo(gaps[0] ?? 0, 6);
      }

      // The outermost rules land on the sides of the head, because the grid
      // divides the measured skull rather than multiplying out the eye
      // spacing. Extrapolating from the eyes pushed them past the head
      // whenever a character's eyes were set wide, which this style does
      // constantly.
      const { headBox } = buildFaceGuides(sampleFace, ASPECT);
      const sides = headBox.map((corner) => corner.x);

      expect(across.at(0)).toBeGreaterThanOrEqual(Math.min(...sides));
      expect(across.at(-1)).toBeLessThanOrEqual(Math.max(...sides));
    });

    it('keeps the grid inside the head however wide apart the eyes are', () => {
      for (const eyeX of [140, 158, 175]) {
        const { lines, headBox } = buildFaceGuides(
          { ...sampleFace, eyeL: at(eyeX, 250), eyeR: at(400 - eyeX, 250) },
          ASPECT,
        );
        const verticals = lines.filter((line) => line.kind === 'fifth');
        const reach = verticals.flatMap((line) => line.points.map((point) => point.y));
        const box = headBox.map((corner) => corner.y);

        expect(Math.min(...reach)).toBeGreaterThanOrEqual(Math.min(...box));
        expect(Math.max(...reach)).toBeLessThanOrEqual(Math.max(...box));
      }
    });

    it('only draws guides whose landmarks are marked', () => {
      const { lines, jaw, noseArc } = buildFaceGuides({ crownTop: at(200, 60) }, ASPECT);

      expect(lines).toHaveLength(0);
      expect(jaw).toHaveLength(0);
      expect(noseArc).toHaveLength(0);
    });
  });
});
