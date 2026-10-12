import { describe, expect, it } from 'vitest';
import { buildSkeleton } from './skeleton';
import type { Pose } from './types';

/** Reference mannequin shipped in `public/assets/images/reference-pose.svg`. */
const SAMPLE_WIDTH = 400;
const SAMPLE_HEIGHT = 800;
const SAMPLE_ASPECT = SAMPLE_WIDTH / SAMPLE_HEIGHT;

const at = (x: number, y: number) => ({ x: x / SAMPLE_WIDTH, y: y / SAMPLE_HEIGHT });

const samplePose: Pose = {
  headTop: at(200, 10),
  chin: at(200, 100),
  neck: at(200, 122),
  chest: at(200, 195),
  pelvis: at(200, 385),
  shoulderL: at(145, 138),
  shoulderR: at(255, 130),
  hipL: at(168, 375),
  hipR: at(238, 392),
  elbowL: at(126, 252),
  wristL: at(118, 352),
  elbowR: at(280, 246),
  wristR: at(296, 342),
  kneeL: at(170, 548),
  ankleL: at(172, 722),
  kneeR: at(233, 552),
  ankleR: at(238, 726),
};

describe(buildSkeleton, () => {
  describe('metrics', () => {
    it('measures the figure height in head units', () => {
      const { metrics } = buildSkeleton(samplePose, SAMPLE_ASPECT);

      expect(metrics.headsTall).toBeCloseTo(8.18, 1);
    });

    it('reads the shoulder and hip axes as opposed', () => {
      const { metrics } = buildSkeleton(samplePose, SAMPLE_ASPECT);

      expect(metrics.shoulderTiltDeg).toBeCloseTo(-4.2, 1);
      expect(metrics.hipTiltDeg).toBeCloseTo(13.7, 1);
      expect(metrics.contrappostoDeg).toBeCloseTo(17.9, 1);
    });

    it('keeps the tilt independent of the image aspect ratio', () => {
      const wide = buildSkeleton(samplePose, 2);
      const tall = buildSkeleton(samplePose, 0.25);

      // The same normalized pose describes a different physical figure on each
      // canvas, so only the sign of the opposition has to survive.
      expect(Math.sign(wide.metrics.shoulderTiltDeg ?? 0)).toBe(
        Math.sign(tall.metrics.shoulderTiltDeg ?? 0),
      );
      expect(Math.sign(wide.metrics.hipTiltDeg ?? 0)).toBe(Math.sign(tall.metrics.hipTiltDeg ?? 0));
    });

    it('measures nothing for an empty pose', () => {
      const { metrics } = buildSkeleton({}, SAMPLE_ASPECT);

      expect(metrics.headsTall).toBeNull();
      expect(metrics.headUnit).toBeNull();
      expect(metrics.contrappostoDeg).toBeNull();
    });

    it('draws nothing for an empty pose', () => {
      const { bones, masses, actionLine } = buildSkeleton({}, SAMPLE_ASPECT);

      expect(bones).toHaveLength(0);
      expect(masses).toHaveLength(0);
      expect(actionLine).toHaveLength(0);
    });
  });

  describe('geometry', () => {
    it('blocks in the head, the ribcage and the pelvis', () => {
      const { masses } = buildSkeleton(samplePose, SAMPLE_ASPECT);

      expect(masses.map((mass) => mass.id)).toStrictEqual(['head', 'ribcage', 'pelvis']);
    });

    it('draws a smooth action line instead of a raw polyline', () => {
      const { actionLine } = buildSkeleton(samplePose, SAMPLE_ASPECT);

      expect(actionLine.length).toBeGreaterThan(4);
    });

    it('only draws bones whose two landmarks are marked', () => {
      const partial: Pose = {
        shoulderL: samplePose.shoulderL,
        elbowL: samplePose.elbowL,
        wristL: samplePose.wristL,
      };

      const { bones } = buildSkeleton(partial, SAMPLE_ASPECT);

      expect(bones.map((bone) => bone.id)).toStrictEqual(['upperArmL', 'forearmL']);
    });

    it('scales the joint circles with the head unit', () => {
      const { joints, metrics } = buildSkeleton(samplePose, SAMPLE_ASPECT);
      const knee = joints.find((joint) => joint.id === 'kneeL');

      expect(metrics.headUnit).toBeGreaterThan(0);
      expect(knee?.radius).toBeCloseTo((metrics.headUnit ?? 0) * 0.13, 5);
    });
  });
});
