'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ADVICE, BUTTON } from '@/features/landmarks/controls';
import { ExportPanel } from '@/features/landmarks/ExportPanel';
import { GuideSteps } from '@/features/landmarks/GuideSteps';
import { LandmarkCanvas } from '@/features/landmarks/LandmarkCanvas';
import { StudioLayout } from '@/features/landmarks/StudioLayout';
import type { Marks, Point } from '@/features/landmarks/types';
import { VIEWBOX_WIDTH, viewBoxHeight } from '@/features/landmarks/viewbox';
import {
  countMarked,
  GROUP_COLOR,
  JOINT_COUNT,
  JOINT_SEQUENCE,
  nextUnsetJointIndex,
} from './joints';
import { PoseMetrics, PosePoints } from './PosePanel';
import { buildSkeleton } from './skeleton';
import { SkeletonOverlay } from './SkeletonOverlay';
import { ALL_LAYERS, layersForStep, STEP_COUNT, STEPS } from './steps';
import type { ArtStyle } from './styles';
import type { JointId, Pose } from './types';

/** The coach endpoint answers this when the server has no Gemini API key. */
const NOT_CONFIGURED_STATUS = 503;
const MODEL_BUSY_STATUS = 429;

const LANDMARKS = JOINT_SEQUENCE.map((def) => ({ id: def.id, color: GROUP_COLOR[def.group] }));

// The shared canvas speaks plain string ids; this narrows them back without a
// cast, so an unknown id is ignored instead of corrupting the pose.
const isJointId = (id: string): id is JointId =>
  JOINT_SEQUENCE.some((def) => (def.id as string) === id);

const toPose = (marks: Marks): Pose => {
  const pose: Pose = {};

  for (const def of JOINT_SEQUENCE) {
    const point = marks[def.id];

    if (point) {
      pose[def.id] = point;
    }
  }

  return pose;
};

const readAdvice = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null || !('advice' in payload)) {
    return null;
  }

  return typeof payload.advice === 'string' ? payload.advice : null;
};

type CoachState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; advice: string }
  | { status: 'error'; message: string };

export const SkeletonStudio = (props: {
  imageSrc: string | null;
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  onAspectChange: (aspect: number) => void;
  photoOpacity: number;
  showGuides: boolean;
  showMarkers: boolean;
  marks: Marks;
  onMarksChange: (marks: Marks) => void;
  commandBar: React.ReactNode;
  viewControls: React.ReactNode;
  notice: React.ReactNode;
}) => {
  const t = useTranslations('Studio');

  const [selectedJointId, setSelectedJointId] = useState<JointId | null>(
    JOINT_SEQUENCE[0]?.id ?? null,
  );
  const [artStyle, setArtStyle] = useState<ArtStyle>('anime');
  // Start on the finished construction, not on the first step. The steps are
  // a lesson the artist opts into by walking back through them; landing on
  // step one means a completed detection draws almost nothing.
  const [stepIndex, setStepIndex] = useState(STEP_COUNT - 1);
  const [coach, setCoach] = useState<CoachState>({ status: 'idle' });

  const pose = toPose(props.marks);
  const skeleton = buildSkeleton(pose, props.aspect);

  // Nothing is selected once the last joint lands, and the shell clears the
  // marks from outside this component when a new image arrives. Falling back to
  // the next unmarked joint is what keeps the canvas from going dead after an
  // upload: without it the marks reset to zero but no click places anything.
  const firstUnset = nextUnsetJointIndex(pose, 0);
  const activeJointId =
    selectedJointId ?? (firstUnset === -1 ? null : (JOINT_SEQUENCE[firstUnset]?.id ?? null));

  const handlePlace = (id: string, point: Point) => {
    if (!isJointId(id)) {
      return;
    }

    const wasUnset = !pose[id];
    const next = { ...props.marks, [id]: point };

    props.onMarksChange(next);

    // Only walk forward on a first placement: dragging an existing marker must
    // not steal the active landmark away from the user.
    if (wasUnset) {
      const currentIndex = JOINT_SEQUENCE.findIndex((def) => def.id === id);
      const upcoming = nextUnsetJointIndex(toPose(next), currentIndex + 1);

      setSelectedJointId(upcoming === -1 ? null : (JOINT_SEQUENCE[upcoming]?.id ?? null));
    }
  };

  const handleClearJoint = (id: JointId) => {
    const next: Marks = {};

    for (const def of JOINT_SEQUENCE) {
      const point = props.marks[def.id];

      if (point && def.id !== id) {
        next[def.id] = point;
      }
    }

    props.onMarksChange(next);
    setSelectedJointId(id);
  };

  const handleAskCoach = async () => {
    setCoach({ status: 'loading' });

    try {
      const response = await fetch('/api/skeleton-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: skeleton.metrics, artStyle }),
      });

      const advice = readAdvice(await response.json());

      if (!response.ok || !advice) {
        let message = t('coach_error');

        if (response.status === NOT_CONFIGURED_STATUS) {
          message = t('coach_unavailable');
        } else if (response.status === MODEL_BUSY_STATUS) {
          message = t('ai_busy');
        }

        setCoach({ status: 'error', message });

        return;
      }

      setCoach({ status: 'ready', advice });
    } catch {
      setCoach({ status: 'error', message: t('coach_error') });
    }
  };

  const nextJointLabel = activeJointId ? t(`joint_${activeJointId}`) : null;

  // "Next point" is a lie once that joint already has a position. The active
  // joint starts at the first in the sequence and stays there until the artist
  // picks another, so after a detection fills every joint the bar was still
  // inviting the first one to be placed while the tab beside it read 17/17. A
  // click there moves the joint rather than adding one, so the bar says which
  // one it would move.
  const statusLabel = (() => {
    if (!(activeJointId && nextJointLabel)) {
      return t('all_points_done');
    }

    return props.marks[activeJointId]
      ? t('editing_point', { name: nextJointLabel })
      : t('next_point', { name: nextJointLabel });
  })();

  return (
    <StudioLayout
      brand={t('brand')}
      commandBar={props.commandBar}
      notice={props.notice}
      canvas={
        <div
          className="max-h-full w-full"
          style={{ maxWidth: `calc((100dvh - 8.5rem) * ${props.aspect})` }}
        >
          <LandmarkCanvas
            imageSrc={props.imageSrc}
            aspect={props.aspect}
            landmarks={LANDMARKS}
            marks={props.marks}
            activeId={activeJointId}
            overlay={
              props.showGuides ? (
                /* Only what has been built so far. Each step already carries
                   every earlier layer, so a second pass of the finished
                   construction underneath added nothing but the layers the
                   artist has not reached yet. */
                <SkeletonOverlay
                  skeleton={skeleton}
                  layers={layersForStep(stepIndex)}
                  aspect={props.aspect}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              ) : null
            }
            photoOpacity={props.photoOpacity}
            showMarkers={props.showMarkers}
            emptyStateLabel={t('empty_state')}
            surfaceLabel={t('surface_label')}
            labelFor={(id) => (isJointId(id) ? t(`joint_${id}`) : id)}
            onPlace={handlePlace}
            onSelect={(id) => {
              if (isJointId(id)) {
                setSelectedJointId(id);
              }
            }}
            onAspectChange={props.onAspectChange}
          />
        </div>
      }
      statusBar={
        <>
          <p className="min-w-0 truncate text-chalk">{statusLabel}</p>
          {props.viewControls}
          <button
            type="button"
            className={`${BUTTON} ml-auto shrink-0`}
            onClick={() => {
              props.onMarksChange({});
              setSelectedJointId(JOINT_SEQUENCE[0]?.id ?? null);
            }}
          >
            {t('reset')}
          </button>
        </>
      }
      tabs={[
        {
          id: 'points',
          label: t('tab_points'),
          badge: `${countMarked(pose)}/${JOINT_COUNT}`,
          content: (
            <PosePoints
              pose={pose}
              activeJointId={activeJointId}
              onSelectJoint={setSelectedJointId}
              onClearJoint={handleClearJoint}
            />
          ),
        },
        {
          id: 'metrics',
          label: t('tab_metrics'),
          content: (
            <div className="flex flex-col gap-4">
              <PoseMetrics
                metrics={skeleton.metrics}
                artStyle={artStyle}
                onArtStyleChange={setArtStyle}
              />

              <div className="border-t border-graphite-800 pt-3">
                <button
                  type="button"
                  disabled={coach.status === 'loading'}
                  className={BUTTON}
                  onClick={handleAskCoach}
                >
                  {coach.status === 'loading' ? t('coach_loading') : t('coach_button')}
                </button>

                {coach.status === 'ready' && (
                  <p className={`${ADVICE} mt-2 whitespace-pre-line`}>{coach.advice}</p>
                )}

                {coach.status === 'error' && <p className={`${ADVICE} mt-2`}>{coach.message}</p>}
              </div>
            </div>
          ),
        },
        {
          id: 'steps',
          label: t('tab_steps'),
          badge: `${stepIndex + 1}/${STEP_COUNT}`,
          content: (
            <GuideSteps
              counter={t('step_counter', { current: stepIndex + 1, total: STEP_COUNT })}
              previousLabel={t('step_previous')}
              nextLabel={t('step_next')}
              stepTitle={t(`step_${STEPS[stepIndex]?.id ?? 'actionLine'}_title`)}
              stepBody={t(`step_${STEPS[stepIndex]?.id ?? 'actionLine'}_body`)}
              stepLabels={STEPS.map((step) => t(`step_${step.id}_title`))}
              stepIndex={stepIndex}
              onStepChange={setStepIndex}
            />
          ),
        },
        {
          id: 'export',
          label: t('tab_export'),
          content: (
            <ExportPanel
              imageSrc={props.imageSrc}
              aspect={props.aspect}
              width={VIEWBOX_WIDTH}
              height={viewBoxHeight(props.aspect)}
              photoOpacity={props.photoOpacity}
              showMarkers={props.showMarkers}
              landmarks={LANDMARKS}
              marks={props.marks}
              overlay={
                props.showGuides ? (
                  <SkeletonOverlay
                    skeleton={skeleton}
                    layers={ALL_LAYERS}
                    aspect={props.aspect}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  />
                ) : null
              }
              fileName="body"
              previewHint={t('export_hint')}
              downloadLabel={t('download_png')}
            />
          ),
        },
      ]}
    />
  );
};
