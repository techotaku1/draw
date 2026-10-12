'use client';

import { useTranslations } from 'next-intl';
import {
  ADVICE,
  ADVICE_WARN,
  chip,
  METRIC_LABEL,
  METRIC_VALUE,
  PANEL_NOTE,
  PANEL_TITLE,
  segment,
  SEGMENT_GROUP,
} from '@/features/landmarks/controls';
import type { Marks } from '@/features/landmarks/types';
import { AGE_PRESETS, FACE_AGES, judge } from './ages';
import type { FaceAge } from './ages';
import { FACE_SEQUENCE } from './landmarks';
import type { FaceLandmarkId } from './landmarks';
import type { FaceMetrics } from './types';

/** Past this drift off the symmetry axis the features read as crooked. */
const MAX_FEATURE_DRIFT = 0.06;

export const FacePoints = (props: {
  marks: Marks;
  activeId: FaceLandmarkId | null;
  onSelect: (id: FaceLandmarkId) => void;
  onClear: (id: FaceLandmarkId) => void;
}) => {
  const t = useTranslations('FaceStudio');

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-1">
        {FACE_SEQUENCE.map((def, index) => (
          <li key={def.id}>
            <button
              type="button"
              aria-pressed={props.activeId === def.id}
              className={chip(props.activeId === def.id, Boolean(props.marks[def.id]))}
              onClick={() => {
                props.onSelect(def.id);
              }}
              onDoubleClick={() => {
                props.onClear(def.id);
              }}
            >
              <span
                className="mr-1.5 inline-block size-1.5 rounded-full align-middle"
                style={{ backgroundColor: def.color }}
              />
              <span className="tabular-nums">{index + 1}</span> {t(`point_${def.id}`)}
            </button>
          </li>
        ))}
      </ul>

      <p className={PANEL_NOTE}>{t('points_hint')}</p>
    </div>
  );
};

export const FaceMetricsPanel = (props: {
  metrics: FaceMetrics;
  age: FaceAge;
  onAgeChange: (age: FaceAge) => void;
}) => {
  const t = useTranslations('FaceStudio');
  const preset = AGE_PRESETS[props.age];
  const ratioVerdict = judge(props.metrics.headRatio, preset.headRatio);
  const eyeVerdict = judge(props.metrics.eyeLevel, preset.eyeLevel);
  const drift = props.metrics.featureDrift;
  const { eyeVsCranium } = props.metrics;

  const percent = (value: number | null) =>
    value === null ? t('unknown') : t('percent', { value: Math.round(value * 100) });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className={PANEL_TITLE}>{t('age_title')}</h3>
        <fieldset className={`${SEGMENT_GROUP} mt-2`} aria-label={t('age_title')}>
          {FACE_AGES.map((age) => (
            <button
              key={age}
              type="button"
              aria-pressed={age === props.age}
              className={`flex-1 ${segment(age === props.age)}`}
              onClick={() => {
                props.onAgeChange(age);
              }}
            >
              {t(`age_${age}`)}
            </button>
          ))}
        </fieldset>
        <p className={`${PANEL_NOTE} mt-2`}>
          {t('age_target', {
            ratioMin: preset.headRatio.min,
            ratioMax: preset.headRatio.max,
            eyeMin: Math.round(preset.eyeLevel.min * 100),
            eyeMax: Math.round(preset.eyeLevel.max * 100),
          })}
        </p>
      </div>

      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 border-t border-graphite-800 pt-3">
        <dt className={METRIC_LABEL}>{t('metric_ratio')}</dt>
        <dd className={METRIC_VALUE}>{props.metrics.headRatio ?? t('unknown')}</dd>

        <dt className={METRIC_LABEL}>{t('metric_eye_level')}</dt>
        <dd className={METRIC_VALUE}>{percent(props.metrics.eyeLevel)}</dd>

        <dt className={METRIC_LABEL}>{t('metric_eye_tilt')}</dt>
        <dd className={METRIC_VALUE}>
          {props.metrics.eyeTiltDeg === null
            ? t('unknown')
            : t('degrees', { value: props.metrics.eyeTiltDeg })}
        </dd>

        <dt className={METRIC_LABEL}>{t('metric_nose_level')}</dt>
        <dd className={METRIC_VALUE}>{percent(props.metrics.noseLevel)}</dd>

        <dt className={METRIC_LABEL}>{t('metric_mouth_level')}</dt>
        <dd className={METRIC_VALUE}>{percent(props.metrics.mouthLevel)}</dd>
      </dl>

      <p className={ADVICE}>{t(`ratio_${ratioVerdict}`)}</p>
      <p className={ADVICE}>{t(`eyelevel_${eyeVerdict}`)}</p>

      {eyeVsCranium !== null && eyeVsCranium > 0 && (
        <p className={ADVICE_WARN}>{t('eyes_below_cranium')}</p>
      )}

      {drift !== null && (
        <p className={drift > MAX_FEATURE_DRIFT ? ADVICE_WARN : ADVICE}>
          {drift > MAX_FEATURE_DRIFT ? t('drift_off_axis') : t('drift_aligned')}
        </p>
      )}
    </div>
  );
};
