import type { JointGroup, JointId, Pose } from './types';

export type JointDef = {
  id: JointId;
  group: JointGroup;
};

/**
 * Capture order. It follows how a figure is actually blocked in: the head sets
 * the measuring unit, the spine sets the action line, then the shoulder and hip
 * axes, and only then the limbs.
 */
export const JOINT_SEQUENCE: JointDef[] = [
  { id: 'headTop', group: 'head' },
  { id: 'chin', group: 'head' },
  { id: 'neck', group: 'head' },
  { id: 'chest', group: 'torso' },
  { id: 'pelvis', group: 'torso' },
  { id: 'shoulderL', group: 'torso' },
  { id: 'shoulderR', group: 'torso' },
  { id: 'hipL', group: 'torso' },
  { id: 'hipR', group: 'torso' },
  { id: 'elbowL', group: 'arms' },
  { id: 'wristL', group: 'arms' },
  { id: 'elbowR', group: 'arms' },
  { id: 'wristR', group: 'arms' },
  { id: 'kneeL', group: 'legs' },
  { id: 'ankleL', group: 'legs' },
  { id: 'kneeR', group: 'legs' },
  { id: 'ankleR', group: 'legs' },
];

export const JOINT_COUNT = JOINT_SEQUENCE.length;

export const GROUP_COLOR: Record<JointGroup, string> = {
  head: '#f97316',
  torso: '#2563eb',
  arms: '#16a34a',
  legs: '#db2777',
};

/**
 * Finds the next landmark still waiting to be marked, wrapping around so the
 * user is sent back to whatever they skipped earlier.
 * @param pose The landmarks marked so far.
 * @param from Index to start searching from, in capture order.
 * @returns Index of the first unset landmark, or `-1` when the pose is complete.
 */
export const nextUnsetJointIndex = (pose: Pose, from = 0): number => {
  for (let i = from; i < JOINT_SEQUENCE.length; i += 1) {
    const def = JOINT_SEQUENCE[i];

    if (def && !pose[def.id]) {
      return i;
    }
  }

  for (let i = 0; i < from; i += 1) {
    const def = JOINT_SEQUENCE[i];

    if (def && !pose[def.id]) {
      return i;
    }
  }

  return -1;
};

export const countMarked = (pose: Pose): number =>
  JOINT_SEQUENCE.filter((def) => Boolean(pose[def.id])).length;
