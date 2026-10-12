'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import type { LandmarkDef, Marks, Point } from './types';

/** Fraction of the frame an arrow key nudges a selected landmark. */
const NUDGE_STEP = 0.004;
const NUDGE_STEP_LARGE = 0.02;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

// Reference image with a marking surface on top: click to place the active
// landmark, drag or arrow-key a placed one. It knows nothing about what the
// landmarks mean, so both the body and the face studio share it.
export const LandmarkCanvas = (props: {
  imageSrc: string | null;
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  landmarks: readonly LandmarkDef[];
  marks: Marks;
  activeId: string | null;
  /** Already-rendered guide overlay, or `null` to show none. */
  overlay: React.ReactNode;
  /** `0` hides the reference photo so only the structure remains. */
  photoOpacity: number;
  /** Hiding the markers also hides the only handles you can drag. */
  showMarkers: boolean;
  emptyStateLabel: string;
  surfaceLabel: string;
  labelFor: (id: string) => string;
  onPlace: (id: string, point: Point) => void;
  onSelect: (id: string) => void;
  onAspectChange: (aspect: number) => void;
}) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const pointFromEvent = (clientX: number, clientY: number): Point | null => {
    const rect = frameRef.current?.getBoundingClientRect();

    if (!rect || rect.width === 0 || rect.height === 0) {
      return null;
    }

    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  const handleSurfacePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!props.activeId) {
      return;
    }

    const point = pointFromEvent(event.clientX, event.clientY);

    if (point) {
      props.onPlace(props.activeId, point);
    }
  };

  // A keyboard activation has no pointer position, so it drops the landmark in
  // the middle of the frame; the arrow keys then nudge it into place.
  const handleSurfaceActivate = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!props.activeId || event.detail !== 0) {
      return;
    }

    props.onPlace(props.activeId, props.marks[props.activeId] ?? { x: 0.5, y: 0.5 });
  };

  const handleMarkerPointerDown =
    (id: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDraggingId(id);
      props.onSelect(id);
    };

  const handleMarkerPointerMove =
    (id: string) => (event: React.PointerEvent<HTMLButtonElement>) => {
      if (draggingId !== id) {
        return;
      }

      const point = pointFromEvent(event.clientX, event.clientY);

      if (point) {
        props.onPlace(id, point);
      }
    };

  const handleMarkerPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingId(null);
  };

  const handleMarkerKeyDown = (id: string) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = props.marks[id];

    if (!current) {
      return;
    }

    const step = event.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    const deltas: Record<string, Point> = {
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
    };
    const delta = deltas[event.key];

    if (!delta) {
      return;
    }

    event.preventDefault();
    props.onPlace(id, { x: clamp01(current.x + delta.x), y: clamp01(current.y + delta.y) });
  };

  if (!props.imageSrc) {
    return (
      <div className="flex aspect-[3/4] w-full items-center justify-center rounded border border-dashed border-graphite-700 p-8 text-center text-[13px] text-chalk-faint">
        {props.emptyStateLabel}
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className="relative w-full touch-none overflow-hidden rounded bg-sheet"
      style={{ aspectRatio: props.aspect }}
    >
      <Image
        src={props.imageSrc}
        alt=""
        fill
        unoptimized
        sizes="(max-width: 1024px) 100vw, 640px"
        className="object-contain"
        style={{ opacity: props.photoOpacity }}
        onLoad={(event) => {
          const { naturalWidth, naturalHeight } = event.currentTarget;

          if (naturalWidth > 0 && naturalHeight > 0) {
            props.onAspectChange(naturalWidth / naturalHeight);
          }
        }}
      />

      {props.overlay}

      <button
        type="button"
        aria-label={props.surfaceLabel}
        className="absolute inset-0 cursor-crosshair focus-visible:outline-2 focus-visible:outline-chalk"
        onPointerDown={handleSurfacePointerDown}
        onClick={handleSurfaceActivate}
      />

      {props.landmarks.map((def, index) => {
        const point = props.marks[def.id];

        if (!point || !props.showMarkers) {
          return null;
        }

        const isActive = props.activeId === def.id;

        return (
          <button
            key={def.id}
            type="button"
            aria-label={props.labelFor(def.id)}
            title={props.labelFor(def.id)}
            className={`absolute flex size-5 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full text-[10px] font-semibold text-white tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-chalk ${
              isActive ? 'ring-2 ring-graphite-950 ring-offset-1 ring-offset-white' : ''
            }`}
            style={{
              left: `${point.x * 100}%`,
              top: `${point.y * 100}%`,
              backgroundColor: def.color,
            }}
            onPointerDown={handleMarkerPointerDown(def.id)}
            onPointerMove={handleMarkerPointerMove(def.id)}
            onPointerUp={handleMarkerPointerUp}
            onKeyDown={handleMarkerKeyDown(def.id)}
          >
            {index + 1}
          </button>
        );
      })}
    </div>
  );
};
