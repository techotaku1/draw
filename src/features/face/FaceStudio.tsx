'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { BUTTON } from '@/features/landmarks/controls';
import { ExportPanel } from '@/features/landmarks/ExportPanel';
import { GuideSteps } from '@/features/landmarks/GuideSteps';
import { LandmarkCanvas } from '@/features/landmarks/LandmarkCanvas';
import { StudioLayout } from '@/features/landmarks/StudioLayout';
import type { Marks, Point } from '@/features/landmarks/types';
import { VIEWBOX_WIDTH, viewBoxHeight } from '@/features/landmarks/viewbox';
import type { FaceAge } from './ages';
import { FaceOverlay } from './FaceOverlay';
import { FaceMetricsPanel, FacePoints } from './FacePanel';
import { buildFaceGuides } from './guides';
import { FACE_COUNT, FACE_SEQUENCE, isFaceId } from './landmarks';
import type { FaceLandmarkId } from './landmarks';
import { ALL_FACE_LAYERS, FACE_STEP_COUNT, FACE_STEPS, faceLayersForStep } from './steps';

const nextUnset = (current: Marks): FaceLandmarkId | null =>
  FACE_SEQUENCE.find((def) => !current[def.id])?.id ?? null;

export const FaceStudio = (props: {
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
  const t = useTranslations('FaceStudio');

  const [selectedId, setSelectedId] = useState<FaceLandmarkId | null>(FACE_SEQUENCE[0]?.id ?? null);

  // Nothing is selected once the last landmark lands, and the shell clears the
  // marks from outside this component when a new image arrives. Falling back to
  // the next unmarked landmark is what keeps the canvas from going dead after
  // an upload: without it the marks reset to zero but no click places anything.
  const activeId = selectedId ?? nextUnset(props.marks);
  const [age, setAge] = useState<FaceAge>('young');
  const [stepIndex, setStepIndex] = useState(0);

  const guides = buildFaceGuides(props.marks, props.aspect);
  const marked = FACE_SEQUENCE.filter((def) => Boolean(props.marks[def.id])).length;

  const handlePlace = (id: string, point: Point) => {
    const wasUnset = !props.marks[id];
    const next = { ...props.marks, [id]: point };

    props.onMarksChange(next);

    if (wasUnset) {
      setSelectedId(nextUnset(next));
    }
  };

  const handleClear = (id: FaceLandmarkId) => {
    const next: Marks = {};

    for (const def of FACE_SEQUENCE) {
      const point = props.marks[def.id];

      if (point && def.id !== id) {
        next[def.id] = point;
      }
    }

    props.onMarksChange(next);
    setSelectedId(id);
  };

  const activeLabel = activeId ? t(`point_${activeId}`) : null;

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
            landmarks={FACE_SEQUENCE}
            marks={props.marks}
            activeId={activeId}
            overlay={
              props.showGuides ? (
                /* Only what has been built so far. Each step already carries
                   every earlier layer, so a second pass showing the finished
                   construction underneath added nothing but the layers the
                   artist has not reached yet — fourteen guides competing at
                   once, where the point of the sequence is to show two or
                   three at a time. */
                <FaceOverlay
                  guides={guides}
                  layers={faceLayersForStep(stepIndex)}
                  aspect={props.aspect}
                  className="pointer-events-none absolute inset-0 h-full w-full"
                />
              ) : null
            }
            photoOpacity={props.photoOpacity}
            showMarkers={props.showMarkers}
            emptyStateLabel={t('empty_state')}
            surfaceLabel={t('surface_label')}
            labelFor={(id) => (isFaceId(id) ? t(`point_${id}`) : id)}
            onPlace={handlePlace}
            onSelect={(id) => {
              if (isFaceId(id)) {
                setSelectedId(id);
              }
            }}
            onAspectChange={props.onAspectChange}
          />
        </div>
      }
      statusBar={
        <>
          <p className="text-chalk">
            {activeLabel ? t('next_point', { name: activeLabel }) : t('all_points_done')}
          </p>
          {props.viewControls}
          <button
            type="button"
            className={`${BUTTON} ml-auto`}
            onClick={() => {
              props.onMarksChange({});
              setSelectedId(FACE_SEQUENCE[0]?.id ?? null);
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
          badge: `${marked}/${FACE_COUNT}`,
          content: (
            <FacePoints
              marks={props.marks}
              activeId={activeId}
              onSelect={setSelectedId}
              onClear={handleClear}
            />
          ),
        },
        {
          id: 'metrics',
          label: t('tab_metrics'),
          content: <FaceMetricsPanel metrics={guides.metrics} age={age} onAgeChange={setAge} />,
        },
        {
          id: 'steps',
          label: t('tab_steps'),
          badge: `${stepIndex + 1}/${FACE_STEP_COUNT}`,
          content: (
            <GuideSteps
              counter={t('step_counter', { current: stepIndex + 1, total: FACE_STEP_COUNT })}
              previousLabel={t('step_previous')}
              nextLabel={t('step_next')}
              stepTitle={t(`step_${FACE_STEPS[stepIndex]?.id ?? 'cranium'}_title`)}
              stepBody={t(`step_${FACE_STEPS[stepIndex]?.id ?? 'cranium'}_body`)}
              stepLabels={FACE_STEPS.map((step) => t(`step_${step.id}_title`))}
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
              landmarks={FACE_SEQUENCE}
              marks={props.marks}
              overlay={
                props.showGuides ? (
                  <FaceOverlay
                    guides={guides}
                    layers={ALL_FACE_LAYERS}
                    aspect={props.aspect}
                    className="pointer-events-none absolute inset-0 h-full w-full"
                  />
                ) : null
              }
              fileName="face"
              previewHint={t('export_hint')}
              downloadLabel={t('download_png')}
            />
          ),
        },
      ]}
    />
  );
};
