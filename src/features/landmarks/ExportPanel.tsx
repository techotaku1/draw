'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { BUTTON, BUTTON_SOLID, PANEL_NOTE } from './controls';
import { downloadGuideSheet, printGuideSheet } from './export';
import type { ExportMarker } from './export';
import type { LandmarkDef, Marks } from './types';

/** What the artist chose to put on the sheet besides the guides. */
export type SheetContent = {
  /** The reference drawing, faint, behind the guides. */
  photo: boolean;
  /** The numbered landmark markers. */
  markers: boolean;
};

/**
 * Opacity of the drawing behind the guides when the artist asks for it: faint
 * enough that the construction stays the thing on the page, as on a light
 * table, and that pencil over a printout still reads.
 */
const SHEET_PHOTO_OPACITY = 0.25;

// The sheet is what the artist draws from — printed, or open beside the paper
// — so it starts as the bare construction: no drawing behind it and no
// numbered markers, both of which belong to marking the reference, not to
// redrawing it. Its two options are its own for that reason. Sharing the
// canvas's would mean fading the reference and hiding the handles in the very
// view the artist uses to correct the landmarks, just to get a clean page.
// They are held by the shell rather than here, because the panel unmounts with
// its tab and the artist's choice should survive a look at another one.
// The preview is exactly what is printed or downloaded.
export const ExportPanel = (props: {
  imageSrc: string | null;
  /** Reference image aspect ratio (`width / height`). */
  aspect: number;
  /** Overlay viewBox size in user units. */
  width: number;
  height: number;
  landmarks: readonly LandmarkDef[];
  marks: Marks;
  content: SheetContent;
  onContentChange: (content: SheetContent) => void;
  /** The guides the sheet carries. */
  overlay: React.ReactNode;
  fileName: string;
  previewHint: string;
  photoLabel: string;
  markersLabel: string;
  printLabel: string;
  /** Title of the printed document, which browsers offer as the PDF name. */
  printTitle: string;
  downloadLabel: string;
}) => {
  const previewRef = useRef<HTMLDivElement>(null);

  const showPhoto = Boolean(props.imageSrc) && props.content.photo;
  const hasGuides = Object.keys(props.marks).length > 0;

  const markers: ExportMarker[] = props.content.markers
    ? props.landmarks.flatMap((def, index) => {
        const point = props.marks[def.id];

        return point
          ? [{ x: point.x, y: point.y, color: def.color, label: String(index + 1) }]
          : [];
      })
    : [];

  // The preview element itself is read only when a button is pressed: refs are
  // not populated during render.
  const sheet = {
    width: props.width,
    height: props.height,
    photo:
      showPhoto && props.imageSrc ? { src: props.imageSrc, opacity: SHEET_PHOTO_OPACITY } : null,
    markers,
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
            style={{ opacity: SHEET_PHOTO_OPACITY }}
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

      <div className="flex flex-col gap-1.5 text-[12px] text-chalk-dim">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.content.photo}
            disabled={!props.imageSrc}
            onChange={(event) => {
              props.onContentChange({ ...props.content, photo: event.target.checked });
            }}
          />
          {props.photoLabel}
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={props.content.markers}
            onChange={(event) => {
              props.onContentChange({ ...props.content, markers: event.target.checked });
            }}
          />
          {props.markersLabel}
        </label>
      </div>

      <button
        type="button"
        disabled={!(props.imageSrc && hasGuides)}
        className={`${BUTTON_SOLID} w-full py-2`}
        onClick={async () => {
          await printGuideSheet({
            ...sheet,
            overlayHost: previewRef.current,
            title: props.printTitle,
          });
        }}
      >
        {props.printLabel}
      </button>

      <button
        type="button"
        disabled={!(props.imageSrc && hasGuides)}
        className={`${BUTTON} w-full py-2`}
        onClick={async () => {
          await downloadGuideSheet({
            ...sheet,
            overlayHost: previewRef.current,
            name: props.fileName,
          });
        }}
      >
        {props.downloadLabel}
      </button>
    </div>
  );
};
