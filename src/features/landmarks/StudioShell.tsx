'use client';

import { UserButton } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { FaceStudio } from '@/features/face/FaceStudio';
import { FACE_IDS } from '@/features/face/landmarks';
import { JOINT_SEQUENCE } from '@/features/skeleton/joints';
import { SkeletonStudio } from '@/features/skeleton/SkeletonStudio';
import { BUTTON, BUTTON_SOLID, SEGMENT_GROUP, segment } from './controls';
import { readMarks } from './export';
import { toDetectionPng } from './imageData';
import type { Marks } from './types';

/** Reference figures shipped with the app, one per mode. */
const SAMPLES = {
  body: '/assets/images/reference-pose.svg',
  face: '/assets/images/reference-face.svg',
} as const;

const DEFAULT_ASPECT = { body: 0.5, face: 400 / 520 } as const;

/** Faded enough to trace over, strong enough to still read the reference. */
const DEFAULT_PHOTO_OPACITY = 0.55;

const NOT_CONFIGURED_STATUS = 503;
const MODEL_BUSY_STATUS = 429;

const JOINT_IDS: string[] = JOINT_SEQUENCE.map((def) => def.id);

export type StudioMode = 'body' | 'face';

type DetectState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; found: number; switched: boolean; fallback: boolean }
  | { status: 'error'; message: string };

const readField = (payload: unknown, field: string): unknown => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  return new Map<string, unknown>(Object.entries(payload)).get(field);
};

const readReason = (payload: unknown): string | null => {
  const reason = readField(payload, 'reason');

  return typeof reason === 'string' ? reason : null;
};

const readRetryAfter = (payload: unknown): number | null => {
  const seconds = readField(payload, 'retryAfter');

  return typeof seconds === 'number' ? seconds : null;
};

const readTarget = (payload: unknown): StudioMode | null => {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }

  const target = new Map<string, unknown>(Object.entries(payload)).get('target');

  return target === 'body' || target === 'face' ? target : null;
};

// Owns everything the two studios share: the reference image, the active mode,
// the single photo opacity and the AI detection. Keeping the image here is what
// lets the detector move the user between modes without losing the upload.
export const StudioShell = (props: { initialMode: StudioMode }) => {
  const t = useTranslations('StudioShell');
  const objectUrlRef = useRef<string | null>(null);

  const [mode, setMode] = useState<StudioMode>(props.initialMode);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [aspect, setAspect] = useState<number>(DEFAULT_ASPECT[props.initialMode]);
  const [bodyMarks, setBodyMarks] = useState<Marks>({});
  const [faceMarks, setFaceMarks] = useState<Marks>({});
  const [photoOpacity, setPhotoOpacity] = useState(DEFAULT_PHOTO_OPACITY);
  const [showGuides, setShowGuides] = useState(true);
  const [showMarkers, setShowMarkers] = useState(true);
  const [detect, setDetect] = useState<DetectState>({ status: 'idle' });

  const replaceImage = (src: string | null, nextAspect: number) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    setImageSrc(src);
    setAspect(nextAspect);
    setBodyMarks({});
    setFaceMarks({});
    setDetect({ status: 'idle' });
  };

  const aiMessage = (status: number, payload: unknown): string => {
    if (status === NOT_CONFIGURED_STATUS) {
      return t('detect_unavailable');
    }

    if (status !== MODEL_BUSY_STATUS) {
      return t('detect_error');
    }

    // A spent quota and a busy model share the status. Only the reason says
    // whether waiting is worth anything.
    const reason = readReason(payload);

    if (reason === 'quota_daily') {
      return t('quota_daily');
    }

    if (reason === 'quota_rate') {
      return t('quota_rate', { seconds: readRetryAfter(payload) ?? 60 });
    }

    return t('ai_busy');
  };

  const handleDetect = async () => {
    if (!imageSrc) {
      return;
    }

    setDetect({ status: 'loading' });

    const image = await toDetectionPng(imageSrc);

    if (!image) {
      setDetect({ status: 'error', message: t('detect_error') });

      return;
    }

    try {
      const response = await fetch('/api/detect-pose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mimeType: 'image/png', target: 'auto' }),
      });

      const payload: unknown = await response.json();
      const target = readTarget(payload);

      if (!response.ok || !target) {
        setDetect({ status: 'error', message: aiMessage(response.status, payload) });

        return;
      }

      const detected = readMarks(payload, target === 'face' ? FACE_IDS : JOINT_IDS);
      const found = Object.keys(detected).length;

      if (found === 0) {
        setDetect({ status: 'error', message: t('detect_error') });

        return;
      }

      if (target === 'face') {
        setFaceMarks(detected);
      } else {
        setBodyMarks(detected);
      }

      const switched = target !== mode;

      setMode(target);
      setDetect({
        status: 'done',
        found,
        switched,
        fallback: readField(payload, 'fallback') === true,
      });
    } catch {
      setDetect({ status: 'error', message: t('detect_error') });
    }
  };

  const commandBar = (
    <>
      <fieldset className={SEGMENT_GROUP} aria-label={t('mode_label')}>
        {(['body', 'face'] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            aria-pressed={mode === candidate}
            className={segment(mode === candidate)}
            onClick={() => {
              setMode(candidate);
            }}
          >
            {t(`mode_${candidate}`)}
          </button>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <label className={`${BUTTON} cursor-pointer`}>
          {t('upload_label')}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];

              if (file) {
                const url = URL.createObjectURL(file);

                replaceImage(url, aspect);
                objectUrlRef.current = url;
              }
            }}
          />
        </label>

        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            replaceImage(SAMPLES[mode], DEFAULT_ASPECT[mode]);
          }}
        >
          {t('use_sample')}
        </button>

        <button
          type="button"
          disabled={!imageSrc || detect.status === 'loading'}
          className={BUTTON_SOLID}
          onClick={handleDetect}
        >
          {detect.status === 'loading' ? t('detect_loading') : t('detect_button')}
        </button>
      </div>

      {/* The session control sits at the far end of the command bar, where it
          stays reachable without competing with the drawing actions. */}
      <div className="ml-auto flex items-center">
        <UserButton />
      </div>
    </>
  );

  // The single control strip for what the drawing shows. Every one of these
  // drives the canvas, the sheet preview and the downloaded PNG at once, so a
  // setting is never worth hunting for in two places.
  const viewControls = (
    <>
      <label className="flex shrink-0 items-center gap-2 text-chalk-dim">
        {t('photo_opacity')}
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          className="w-24"
          value={photoOpacity}
          onChange={(event) => {
            setPhotoOpacity(Number(event.target.value));
          }}
        />
        <span className="w-9 text-chalk tabular-nums">{Math.round(photoOpacity * 100)}%</span>
      </label>

      <label className="flex shrink-0 items-center gap-2 text-chalk-dim">
        <input
          type="checkbox"
          checked={showGuides}
          onChange={(event) => {
            setShowGuides(event.target.checked);
          }}
        />
        {t('show_guides')}
      </label>

      <label className="flex shrink-0 items-center gap-2 text-chalk-dim">
        <input
          type="checkbox"
          checked={showMarkers}
          onChange={(event) => {
            setShowMarkers(event.target.checked);
          }}
        />
        {t('show_markers')}
      </label>
    </>
  );

  const notice = (() => {
    if (detect.status === 'done') {
      return (
        <p className="mb-4 rounded-md bg-graphite-800 px-3 py-2 text-[12px] leading-relaxed text-chalk">
          {detect.switched
            ? t('detect_switched', { found: detect.found, mode: t(`mode_${mode}`) })
            : t('detect_done', { found: detect.found })}
          {detect.fallback ? ` ${t('detect_fallback')}` : ''}
        </p>
      );
    }

    if (detect.status === 'error') {
      return (
        <p className="mb-4 rounded-md border border-graphite-600 px-3 py-2 text-[12px] leading-relaxed text-chalk">
          {detect.message}
        </p>
      );
    }

    return null;
  })();

  const shared = {
    imageSrc,
    aspect,
    onAspectChange: setAspect,
    photoOpacity,
    showGuides,
    showMarkers,
    commandBar,
    viewControls,
    notice,
  };

  if (mode === 'face') {
    return <FaceStudio {...shared} marks={faceMarks} onMarksChange={setFaceMarks} />;
  }

  return <SkeletonStudio {...shared} marks={bodyMarks} onMarksChange={setBodyMarks} />;
};
