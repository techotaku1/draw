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

/**
 * How far a sampled guide strays from the straight line through two points.
 *
 * @param points The sampled polyline.
 * @param from One point of the reference line.
 * @param to Another point of the reference line.
 * @returns The widest perpendicular gap.
 */
const leanOf = (points: Corner[], from: Corner, to: Corner): number => {
  const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;

  return Math.max(
    ...points.map(
      (point) =>
        Math.abs((point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x)) /
        length,
    ),
  );
};

/** Reference head shipped in `public/assets/images/reference-face.svg`. */
const W = 400;
const H = 520;
const ASPECT = W / H;

const at = (x: number, y: number) => ({ x: x / W, y: y / H });

/**
 * An image point of the fixture in view-box space, where both axes scale by
 * 1000 / W.
 *
 * @param x Horizontal position in image units.
 * @param y Vertical position in image units.
 * @returns The same point in view-box units.
 */
const inView = (x: number, y: number): Corner => ({ x: (x * 1000) / W, y: (y * 1000) / W });

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

    it('keeps the cranium off a crown taken from the hair', () => {
      // What the detector does on spiky hair: the crown lands on the hair's
      // highest point instead of the skull, far above the temples. The circle
      // through those three points reaches 1.35 half-spans, and the jaw
      // departs from its sides, so the construction leaves the drawn head.
      const hairy: Marks = {
        ...sampleFace,
        crownTop: at(200, 10),
        templeL: at(120, 190),
        templeR: at(280, 190),
      };

      const { cranium } = buildFaceGuides(hairy, ASPECT);
      const scale = 1000 / W;
      const halfSpan = ((280 - 120) / 2) * scale;

      expect(cranium).not.toBeNull();
      // Sized by the temples instead, and still anchored on the crown.
      expect(cranium?.radius ?? 0).toBeCloseTo(halfSpan, 0);
      expect(
        Math.hypot(200 * scale - (cranium?.center.x ?? 0), 10 * scale - (cranium?.center.y ?? 0)),
      ).toBeCloseTo(cranium?.radius ?? 0, 0);
    });

    it('keeps a cranium the temples can still justify', () => {
      // The same crown, over temples far enough apart that the circle through
      // the three points only reaches 1.18 half-spans. A turn of fifty
      // degrees earns that much, so the fitted circle must be kept rather
      // than clamped back to the temples.
      const turned: Marks = {
        ...sampleFace,
        crownTop: at(200, 10),
        templeL: at(100, 190),
        templeR: at(300, 190),
      };

      const { cranium } = buildFaceGuides(turned, ASPECT);
      const scale = 1000 / W;

      expect(cranium).not.toBeNull();
      expect(cranium?.radius ?? 0).toBeGreaterThan(((300 - 100) / 2) * scale);
      // Still the circle through all three points, not an estimate.
      for (const [x, y] of [
        [200, 10],
        [100, 190],
        [300, 190],
      ]) {
        expect(
          Math.hypot(
            (x ?? 0) * scale - (cranium?.center.x ?? 0),
            (y ?? 0) * scale - (cranium?.center.y ?? 0),
          ),
        ).toBeCloseTo(cranium?.radius ?? 0, 0);
      }
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

    it('rules every division straight across the whole head', () => {
      const { lines, cranium } = buildFaceGuides({ ...sampleFace, brow: at(200, 225) }, ASPECT);
      const eyes = heading(lines.find((line) => line.kind === 'eyeLine')?.points);
      const divisions = lines.filter((line) => line.kind !== 'fifth');
      const spans = divisions.map((line) => span(line.points));
      // Off-centre distance of each rule's middle from the cranium's centre.
      const offCentre = divisions.map((line) =>
        Math.abs(
          ((line.points.at(0)?.x ?? 0) + (line.points.at(-1)?.x ?? 0)) / 2 -
            (cranium?.center.x ?? 0),
        ),
      );

      // One straight stroke each, top to bottom.
      expect(divisions.map((line) => [line.kind, line.points.length])).toStrictEqual([
        ['hairLine', 2],
        ['browLine', 2],
        ['eyeLine', 2],
        ['noseLine', 2],
        ['mouthLine', 2],
        ['chinLine', 2],
      ]);
      // All parallel to the eyes.
      expect(
        Math.max(...divisions.map((line) => Math.abs(heading(line.points) - eyes))),
      ).toBeLessThan(1e-9);
      // All the same length, longer than the skull is wide, and centred on it,
      // so every rule runs out past the circle on both sides.
      expect(Math.max(...spans) - Math.min(...spans)).toBeLessThan(1e-9);
      expect(Math.min(...spans)).toBeGreaterThan(2 * (cranium?.radius ?? 0));
      expect(Math.max(...offCentre)).toBeLessThan(1e-9);
    });

    it('rules the six divisions in order from the hairline down to the chin', () => {
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

    it('places the hairline halfway between the crown and the centre of the cranium', () => {
      const { lines, cranium } = buildFaceGuides(sampleFace, ASPECT);
      const hair = lines.find((line) => line.kind === 'hairLine');
      const bare = buildFaceGuides({ ...sampleFace, templeL: undefined }, ASPECT);

      // Derived from the circle, so it needs no landmark of its own — and
      // without a cranium there is nothing to derive it from.
      for (const point of hair?.points ?? []) {
        expect(point.y).toBeCloseTo((cranium?.center.y ?? 0) - (cranium?.radius ?? 0) / 2, 6);
      }

      expect(hair).toBeDefined();
      expect(bare.lines.some((line) => line.kind === 'hairLine')).toBeFalsy();
    });

    it('starts and ends the jaw on the cranium circle', () => {
      const { jaw, cranium } = buildFaceGuides(sampleFace, ASPECT);
      const offCircle = (point: Corner | undefined) =>
        Math.abs(gap(point, cranium?.center) - (cranium?.radius ?? 0));

      expect(offCircle(jaw.at(0))).toBeCloseTo(0, 6);
      expect(offCircle(jaw.at(-1))).toBeCloseTo(0, 6);
    });

    it('runs the jaw through the marked corners and chin', () => {
      const { jaw } = buildFaceGuides(sampleFace, ASPECT);
      const [, cornerL, chinL, chinR, cornerR] = jaw;

      // The corners are vertices of the jaw, and the chin sits in the middle
      // of the flat stroke that closes it.
      expect(gap(cornerL, inView(95, 268))).toBeCloseTo(0, 6);
      expect(gap(cornerR, inView(305, 268))).toBeCloseTo(0, 6);
      expect(
        gap({ x: ((chinL?.x ?? 0) + (chinR?.x ?? 0)) / 2, y: chinL?.y ?? 0 }, inView(200, 430)),
      ).toBeCloseTo(0, 6);
    });

    it('starts each cheek line at its own temple', () => {
      const { jaw } = buildFaceGuides(sampleFace, ASPECT);

      // The temples lie on the fitted circle, where the drawn outline of the
      // face meets the skull, so that is exactly where the cheeks leave it.
      expect(gap(jaw.at(0), inView(70, 190))).toBeCloseTo(0, 6);
      expect(gap(jaw.at(-1), inView(330, 190))).toBeCloseTo(0, 6);
    });

    it('keeps the cheek lines on a cranium the temples do not lie on', () => {
      // A crown read off the hair throws the fitted circle away for one sized
      // by the temples, which then sit outside it. The cheeks must still start
      // on the circle rather than float beside it.
      const hairy: Marks = {
        ...sampleFace,
        crownTop: at(200, 10),
        templeL: at(120, 190),
        templeR: at(280, 190),
      };
      const { jaw, cranium } = buildFaceGuides(hairy, ASPECT);
      const offCircle = (point: Corner | undefined) =>
        Math.abs(gap(point, cranium?.center) - (cranium?.radius ?? 0));

      expect(gap(jaw.at(0), inView(120, 190))).toBeGreaterThan(1);
      expect(offCircle(jaw.at(0))).toBeCloseTo(0, 6);
      expect(offCircle(jaw.at(-1))).toBeCloseTo(0, 6);
    });

    it('never starts a cheek line above the widest point of the cranium', () => {
      // Temples marked high on the skull would start the cheeks inside the
      // ball and cut a chord across it.
      const high: Marks = { ...sampleFace, templeL: at(70, 150), templeR: at(330, 150) };
      const { jaw, cranium } = buildFaceGuides(high, ASPECT);

      expect(jaw.at(0)?.y).toBeCloseTo(cranium?.center.y ?? 0, 6);
      expect(jaw.at(-1)?.y).toBeCloseTo(cranium?.center.y ?? 0, 6);
      expect(jaw.at(0)?.x).toBeCloseTo((cranium?.center.x ?? 0) - (cranium?.radius ?? 0), 6);
    });

    it('hangs the jaw off the cranium even when the marked corners fall inside it', () => {
      // The cranium of `sampleFace` is centred at (200, 190) with a radius of
      // 130, so these corners sit 108 away — well inside it. That is the
      // ordinary case, not an exotic one: a jaw is narrower than the skull
      // above it on any face seen from the front, and the cheeks must still
      // start on the circle and reach the marked corners.
      const tucked = { ...sampleFace, jawL: at(110, 250), jawR: at(290, 250) };
      const { jaw } = buildFaceGuides(tucked, ASPECT);

      expect(jaw).toHaveLength(6);
      expect(gap(jaw.at(1), inView(110, 250))).toBeCloseTo(0, 6);
      expect(gap(jaw.at(-2), inView(290, 250))).toBeCloseTo(0, 6);
    });

    it('closes the chin on a short flat stroke', () => {
      const { jaw } = buildFaceGuides(sampleFace, ASPECT);
      const [chinL, chinR] = jaw.slice(2, 4);
      const corners = gap(inView(95, 268), inView(305, 268));

      // Level on an upright head, and about a tenth as wide as the jaw.
      expect(chinL?.y).toBeCloseTo(chinR?.y ?? 0, 6);
      expect(gap(chinL, chinR)).toBeCloseTo(corners * 0.12, 6);
    });

    it('falls back to a bare V when there is no cranium to attach to', () => {
      const noCranium: Marks = { jawL: at(140, 300), jawR: at(260, 300), chin: at(200, 420) };
      const { jaw, cranium } = buildFaceGuides(noCranium, ASPECT);

      expect(cranium).toBeNull();
      expect(jaw).toHaveLength(3);
    });

    it('keeps the midline straight when one eye is marked off centre', () => {
      const { axis } = buildFaceGuides({ ...sampleFace, eyeR: at(295, 265) }, ASPECT);

      // That eye is 40 image units off, which is 100 in view-box space, and it
      // drags the pair's midpoint 50 across. Threading the axis through that
      // midpoint — the old construction — leaned the whole face by the full
      // 50. Fitting it against the temples and jaw corners too leaves a bow
      // small against the 650-unit head.
      expect(leanOf(axis, inView(200, 60), inView(200, 430))).toBeLessThan(20);
    });

    it('runs the midline a little past the crown and the chin', () => {
      const { axis } = buildFaceGuides(sampleFace, ASPECT);

      expect(axis.at(0)?.y ?? 0).toBeLessThan(inView(200, 60).y);
      expect(axis.at(-1)?.y ?? 0).toBeGreaterThan(inView(200, 430).y);
    });

    it('bows the midline when every pair says the head is turned', () => {
      const turned: Marks = {
        ...sampleFace,
        templeL: at(120, 190),
        templeR: at(350, 190),
        eyeL: at(180, 265),
        eyeR: at(275, 265),
        jawL: at(140, 268),
        jawR: at(325, 268),
      };
      const { axis } = buildFaceGuides(turned, ASPECT);

      // Three pairs agreeing is evidence of a real three-quarter view, so the
      // axis must still bend toward the side the face is turned to.
      expect(leanOf(axis, inView(200, 60), inView(200, 430))).toBeGreaterThan(40);
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
