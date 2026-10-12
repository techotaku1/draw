'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { BUTTON_SOLID, PANEL_NOTE } from './controls';
import { downloadGuideSheet } from './export';
import type { ExportMarker } from './export';
import type { LandmarkDef, Marks } from './types';

// What you see here is exactly what the PNG contains. It owns no options of its
// own: the photo opacity, the guides and the markers all come from the one
// control strip that also drives the marking canvas.
export const ExportPanel = (props: {
  imageSrc: string | null;
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  /** Overlay viewBox size in user units. */
  width: number;
  height: number;
  /** Shared with the canvas; `0` leaves the photo out of the sheet entirely. */
  photoOpacity: number;
  showMarkers: boolean;
  landmarks: readonly LandmarkDef[];
  marks: Marks;
  /** Guide overlay, or `null` when the guides are switched off. */
  overlay: React.ReactNode;
  fileName: string;
  previewHint: string;
  downloadLabel: string;
}) => {
  const previewRef = useRef<HTMLDivElement>(null);

  const showPhoto = Boolean(props.imageSrc) && props.photoOpacity > 0;

  const markers: ExportMarker[] = props.showMarkers
    ? props.landmarks.flatMap((def, index) => {
        const point = props.marks[def.id];

        return point
          ? [{ x: point.x, y: point.y, color: def.color, label: String(index + 1) }]
          : [];
      })
    : [];

  const handleDownload = async () => {
    await downloadGuideSheet({
      overlayHost: previewRef.current,
      width: props.width,
      height: props.height,
      name: props.fileName,
      photo:
        showPhoto && props.imageSrc ? { src: props.imageSrc, opacity: props.photoOpacity } : null,
      markers,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <p className={PANEL_NOTE}>{props.previewHint}</p>

      <div
        ref={previewRef}
        className="relative mx-auto w-full max-w-[200px] overflow-hidden rounded bg-sheet"
        style={{ aspectRatio: props.aspect }}
      >
        {props.imageSrc && showPhoto && (
          <Image
            src={props.imageSrc}
            alt=""
            fill
            unoptimized
            sizes="200px"
            className="object-contain"
            style={{ opacity: props.photoOpacity }}
          />
        )}

        {props.overlay}

        {markers.map((marker) => (
          <span
            key={marker.label}
            className="absolute flex size-3.5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[7px] font-semibold text-white"
            style={{
              left: `${marker.x * 100}%`,
              top: `${marker.y * 100}%`,
              backgroundColor: marker.color,
            }}
          >
            {marker.label}
          </span>
        ))}
      </div>

      <button
        type="button"
        disabled={!props.imageSrc}
        className={`${BUTTON_SOLID} w-full py-2`}
        onClick={handleDownload}
      >
        {props.downloadLabel}
      </button>
    </div>
  );
};
