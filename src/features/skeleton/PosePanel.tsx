'use client';

import { useTranslations } from 'next-intl';
import {
  ADVICE,
  chip,
  METRIC_LABEL,
  METRIC_VALUE,
  PANEL_NOTE,
  PANEL_TITLE,
  segment,
  SEGMENT_GROUP,
} from '@/features/landmarks/controls';
import { GROUP_COLOR, JOINT_SEQUENCE } from './joints';
import { ART_STYLES, judgeProportion, STYLE_PRESETS } from './styles';
import type { ArtStyle } from './styles';
import type { JointGroup, JointId, Metrics, Pose } from './types';

/** Below this opposition between axes the pose reads as a stiff mannequin. */
const FLAT_CONTRAPPOSTO_DEG = 4;

const GROUP_ORDER: JointGroup[] = ['head', 'torso', 'arms', 'legs'];

export const PosePoints = (props: {
  pose: Pose;
  activeJointId: JointId | null;
  onSelectJoint: (id: JointId) => void;
  onClearJoint: (id: JointId) => void;
}) => {
  const t = useTranslations('Studio');

  return (
    <div className="flex flex-col gap-4">
      {GROUP_ORDER.map((group) => (
        <div key={group}>
          <h3 className="text-[12px] text-chalk-faint">
            <span
              className="mr-2 inline-block size-2 rounded-full align-middle"
              style={{ backgroundColor: GROUP_COLOR[group] }}
            />
            {t(`group_${group}`)}
          </h3>
          <ul className="mt-1.5 flex flex-wrap gap-1">
            {JOINT_SEQUENCE.map((def, index) => {
              if (def.group !== group) {
                return null;
              }

              return (
                <li key={def.id}>
                  <button
                    type="button"
                    aria-pressed={props.activeJointId === def.id}
                    className={chip(props.activeJointId === def.id, Boolean(props.pose[def.id]))}
                    onClick={() => {
                      props.onSelectJoint(def.id);
                    }}
                    onDoubleClick={() => {
                      props.onClearJoint(def.id);
                    }}
                  >
                    <span className="tabular-nums">{index + 1}</span> {t(`joint_${def.id}`)}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className={PANEL_NOTE}>{t('points_hint')}</p>
    </div>
  );
};

export const PoseMetrics = (props: {
  metrics: Metrics | null;
  artStyle: ArtStyle;
  onArtStyleChange: (style: ArtStyle) => void;
}) => {
  const t = useTranslations('Studio');
  const preset = STYLE_PRESETS[props.artStyle];
  const verdict = judgeProportion(props.metrics?.headsTall ?? null, props.artStyle);
  const headsTall = props.metrics?.headsTall ?? null;
  const contrapposto = props.metrics?.contrappostoDeg ?? null;

  const degrees = (value: number | null) =>
    value === null ? t('metric_unknown') : t('metric_degrees', { value });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className={PANEL_TITLE}>{t('style_title')}</h3>
        <fieldset className={`${SEGMENT_GROUP} mt-2`} aria-label={t('style_title')}>
          {ART_STYLES.map((style) => (
            <button
              key={style}
              type="button"
              aria-pressed={style === props.artStyle}
              className={`flex-1 ${segment(style === props.artStyle)}`}
              onClick={() => {
                props.onArtStyleChange(style);
              }}
            >
              {t(`style_${style}`)}
            </button>
          ))}
        </fieldset>
        <p className={`${PANEL_NOTE} mt-2`}>
          {t('style_target', { min: preset.headsTall.min, max: preset.headsTall.max })}
        </p>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-graphite-800 pt-3">
        <dt className={METRIC_LABEL}>{t('metric_heads_tall')}</dt>
        <dd className={METRIC_VALUE}>
          {headsTall === null ? t('metric_unknown') : t('metric_heads_value', { value: headsTall })}
        </dd>

        <dt className={METRIC_LABEL}>{t('metric_shoulder_tilt')}</dt>
        <dd className={METRIC_VALUE}>{degrees(props.metrics?.shoulderTiltDeg ?? null)}</dd>

        <dt className={METRIC_LABEL}>{t('metric_hip_tilt')}</dt>
        <dd className={METRIC_VALUE}>{degrees(props.metrics?.hipTiltDeg ?? null)}</dd>

        <dt className={METRIC_LABEL}>{t('metric_contrapposto')}</dt>
        <dd className={METRIC_VALUE}>{degrees(contrapposto)}</dd>
      </dl>

      <p className={ADVICE}>{t(`verdict_${verdict}`)}</p>

      {contrapposto !== null && (
        <p className={ADVICE}>
          {contrapposto < FLAT_CONTRAPPOSTO_DEG ? t('contrapposto_flat') : t('contrapposto_good')}
        </p>
      )}
    </div>
  );
};
