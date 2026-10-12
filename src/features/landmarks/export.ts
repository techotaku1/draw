import type { Marks } from './types';

/** Export scale, so the traced sheet stays crisp when printed. */
const EXPORT_SCALE = 2;

/** Grace period before releasing the downloaded blob. */
const REVOKE_DELAY_MS = 10_000;

/** Marker radius in the exported sheet, as a fraction of its longest side. */
const MARKER_RADIUS_RATIO = 0.016;

const readPoint = (value: unknown): { x: number; y: number } | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const fields = new Map<string, unknown>(Object.entries(value));
  const x = fields.get('x');
  const y = fields.get('y');

  if (typeof x !== 'number' || typeof y !== 'number') {
    return null;
  }

  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
};

/**
 * Reads the `{ pose }` answer of the detection endpoint.
 * @param payload The parsed JSON body of the response.
 * @param ids The landmark ids to look for.
 * @returns Every landmark that came back usable; junk is dropped silently.
 */
export const readMarks = (payload: unknown, ids: readonly string[]): Marks => {
  const marks: Marks = {};

  if (typeof payload !== 'object' || payload === null) {
    return marks;
  }

  const body = new Map<string, unknown>(Object.entries(payload));
  const raw = body.get('pose');

  if (typeof raw !== 'object' || raw === null) {
    return marks;
  }

  const points = new Map<string, unknown>(Object.entries(raw));

  for (const id of ids) {
    const point = readPoint(points.get(id));

    if (point) {
      marks[id] = point;
    }
  }

  return marks;
};

/** A numbered marker as it should appear in the exported sheet. */
export type ExportMarker = {
  /** Position in normalized image space. */
  x: number;
  y: number;
  color: string;
  label: string;
};

const loadImage = async (src: string): Promise<HTMLImageElement | null> => {
  const image = new window.Image();

  image.src = src;

  try {
    await image.decode();

    return image;
  } catch {
    return null;
  }
};

// Serialises the overlay into a standalone SVG the canvas can rasterise.
const overlayToImage = async (
  host: HTMLElement,
  width: number,
  height: number,
): Promise<{ image: HTMLImageElement | null; url: string } | null> => {
  const clone = host.querySelector('svg')?.cloneNode(true);

  if (!(clone instanceof SVGSVGElement)) {
    return null;
  }

  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('class');

  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], {
      type: 'image/svg+xml;charset=utf-8',
    }),
  );

  return { image: await loadImage(url), url };
};

const drawMarkers = (
  context: CanvasRenderingContext2D,
  markers: readonly ExportMarker[],
  width: number,
  height: number,
): void => {
  const radius = Math.max(width, height) * MARKER_RADIUS_RATIO;

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `bold ${Math.round(radius * 1.1)}px system-ui, sans-serif`;
  context.lineWidth = Math.max(2, radius * 0.16);
  context.strokeStyle = '#ffffff';

  for (const marker of markers) {
    const cx = marker.x * width;
    const cy = marker.y * height;

    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fillStyle = marker.color;
    context.fill();
    context.stroke();

    context.fillStyle = '#ffffff';
    context.fillText(marker.label, cx, cy);
  }
};

const saveCanvas = (canvas: HTMLCanvasElement, name: string): void => {
  // A blob URL rather than a data URL: Chrome refuses to download data URLs
  // past a few megabytes, which a tall reference sheet reaches easily.
  canvas.toBlob((blob) => {
    if (!blob) {
      return;
    }

    const pngUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = pngUrl;
    link.download = `drawskeleton-${name}-${Date.now()}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking in the same tick can cancel the download before the browser has
    // read the blob.
    setTimeout(() => {
      URL.revokeObjectURL(pngUrl);
    }, REVOKE_DELAY_MS);
  }, 'image/png');
};

/**
 * Renders the guide sheet to a PNG and hands it to the browser as a download.
 * It composes the same three layers the on-screen preview shows — reference
 * photo, guide overlay and numbered markers — so what you see is what you get.
 *
 * @param options Everything the sheet is composed from.
 * @param options.overlayHost Element holding exactly one overlay `<svg>`.
 * @param options.width Overlay viewBox width in user units.
 * @param options.height Overlay viewBox height in user units.
 * @param options.name Prefix of the downloaded file name.
 * @param options.photo Reference image and the opacity to draw it at, or
 * `null` to export the guides on plain white.
 * @param options.markers Numbered markers to draw on top, empty to omit them.
 */
export const downloadGuideSheet = async (options: {
  overlayHost: HTMLElement | null;
  width: number;
  height: number;
  name: string;
  photo: { src: string; opacity: number } | null;
  markers: readonly ExportMarker[];
}): Promise<void> => {
  const { overlayHost, width, height } = options;

  if (!overlayHost) {
    return;
  }

  const canvas = document.createElement('canvas');

  canvas.width = width * EXPORT_SCALE;
  canvas.height = height * EXPORT_SCALE;

  const context = canvas.getContext('2d');

  if (!context) {
    return;
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);

  if (options.photo && options.photo.opacity > 0) {
    const photo = await loadImage(options.photo.src);

    if (photo) {
      context.globalAlpha = options.photo.opacity;
      // The canvas carries the image's own aspect ratio, so it fills exactly.
      context.drawImage(photo, 0, 0, canvas.width, canvas.height);
      context.globalAlpha = 1;
    }
  }

  const overlay = await overlayToImage(overlayHost, width, height);

  if (overlay) {
    if (overlay.image) {
      context.drawImage(overlay.image, 0, 0, canvas.width, canvas.height);
    }

    URL.revokeObjectURL(overlay.url);
  }

  if (options.markers.length > 0) {
    drawMarkers(context, options.markers, canvas.width, canvas.height);
  }

  saveCanvas(canvas, options.name);
};
