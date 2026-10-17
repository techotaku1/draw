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

/** What a guide sheet is composed from, whether it is printed or downloaded. */
type SheetOptions = {
  /** Element holding exactly one overlay `<svg>`. */
  overlayHost: HTMLElement | null;
  /** Overlay viewBox width in user units. */
  width: number;
  /** Overlay viewBox height in user units. */
  height: number;
  /** Reference image and the opacity to draw it at, or `null` for plain white. */
  photo: { src: string; opacity: number } | null;
  /** Numbered markers to draw on top, empty to omit them. */
  markers: readonly ExportMarker[];
};

/**
 * Rasterises the guide sheet: white paper, the reference image if asked for,
 * the guide overlay and the numbered markers, in that order. Printing and the
 * PNG download both go through here, so the two can never disagree.
 *
 * @param options Everything the sheet is composed from.
 * @param scale Pixels per overlay user unit.
 * @returns The composed canvas, or `null` when there is nothing to draw on.
 */
const composeSheet = async (
  options: SheetOptions,
  scale: number,
): Promise<HTMLCanvasElement | null> => {
  const { overlayHost, width, height } = options;

  if (!overlayHost) {
    return null;
  }

  const canvas = document.createElement('canvas');

  canvas.width = width * scale;
  canvas.height = height * scale;

  const context = canvas.getContext('2d');

  if (!context) {
    return null;
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

  return canvas;
};

/**
 * Renders the guide sheet to a PNG and hands it to the browser as a download.
 *
 * @param options Everything the sheet is composed from, plus the file name.
 * @param options.name Prefix of the downloaded file name.
 */
export const downloadGuideSheet = async (options: SheetOptions & { name: string }) => {
  const canvas = await composeSheet(options, EXPORT_SCALE);

  if (canvas) {
    saveCanvas(canvas, options.name);
  }
};

/**
 * Print resolution, in pixels per overlay user unit. Denser than the PNG: a
 * sheet a thousand units wide comes out at three thousand pixels, about 400
 * dpi across an A4 page, so the thinnest guide still prints as a clean line.
 */
const PRINT_SCALE = 3;

/**
 * Largest canvas the print path will ask for, in pixels. Safari on iOS
 * refuses any canvas over 16,777,216 pixels and then hands back no image at
 * all, which a portrait sheet at full print scale would exceed — a thousand
 * units wide and two thousand tall is already eighteen million.
 */
const MAX_PRINT_PIXELS = 16_000_000;

/**
 * The print scale, reduced just enough for the sheet to stay under the canvas
 * limit. A tall sheet loses a little density instead of printing nothing.
 *
 * @param width Overlay viewBox width in user units.
 * @param height Overlay viewBox height in user units.
 * @returns Pixels per user unit for the printed sheet.
 */
const printScale = (width: number, height: number): number =>
  Math.min(PRINT_SCALE, Math.sqrt(MAX_PRINT_PIXELS / Math.max(1, width * height)));

/** Paper margin around the printed sheet. */
const PRINT_MARGIN = '10mm';

/**
 * Tallest the printed sheet may be, per orientation: the printable height of
 * the shorter of A4 and US Letter once the margin is taken off, so it fits one
 * page of either.
 *
 * A physical length rather than `100vh` or a percentage, because WebKit —
 * Safari, and every browser on iOS and iPadOS — resolves both against the
 * on-screen size of the frame, not the page, when it prints a frame. That
 * frame is zero by zero, so the sheet printed as a blank page.
 */
const PRINT_MAX_HEIGHT = { landscape: '190mm', portrait: '259mm' } as const;

/** The print frame of the previous request, removed when the next one starts. */
let releasePrintFrame: (() => void) | null = null;

/**
 * Number of the latest print request. A request that is overtaken while its
 * sheet is still being composed drops out, so a double click opens one print
 * dialog rather than a second one straight after the first.
 */
let latestPrint = 0;

const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/**
 * The document the print frame holds: the sheet alone, as large as the page
 * allows without cropping or spilling onto a second page, centred across it
 * and turned to the orientation that fits it best.
 *
 * @param imageUrl The composed sheet.
 * @param title Document title, which browsers offer as the PDF file name.
 * @param landscape Whether the sheet is wider than it is tall.
 * @returns The HTML for the frame's `srcdoc`.
 */
const printDocument = (imageUrl: string, title: string, landscape: boolean): string =>
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>',
    `@page { size: ${landscape ? 'landscape' : 'portrait'}; margin: ${PRINT_MARGIN}; }`,
    'html, body { margin: 0; padding: 0; background: #ffffff; }',
    'img { display: block; margin: 0 auto; max-width: 100%; break-inside: avoid; }',
    `img { max-height: ${PRINT_MAX_HEIGHT[landscape ? 'landscape' : 'portrait']}; }`,
    '</style></head>',
    `<body><img src="${escapeHtml(imageUrl)}" alt=""></body></html>`,
  ].join('');

/**
 * Puts a composed sheet into a hidden frame of its own and prints the frame.
 *
 * A frame rather than print styles on the studio: the studio is a
 * full-viewport app, and hiding every piece of it for print is fragile, where a
 * frame holding one image prints exactly that image. The frame stays until the
 * dialog reports it has closed, because removing it any sooner cancels the
 * print in some browsers; a browser that never reports it has its frame
 * cleared by the next print instead.
 *
 * @param blob The composed sheet as a PNG.
 * @param title Title of the printed document.
 * @param landscape Whether the sheet is wider than it is tall.
 */
const printInFrame = (blob: Blob, title: string, landscape: boolean): void => {
  releasePrintFrame?.();

  const imageUrl = URL.createObjectURL(blob);
  const frame = document.createElement('iframe');
  const release = () => {
    frame.remove();
    URL.revokeObjectURL(imageUrl);

    if (releasePrintFrame === release) {
      releasePrintFrame = null;
    }
  };

  releasePrintFrame = release;
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Zero-sized rather than hidden: some browsers print nothing from a frame
  // that is `display: none` or `visibility: hidden`.
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  frame.addEventListener(
    'load',
    async () => {
      const view = frame.contentWindow;

      if (!view) {
        release();

        return;
      }

      try {
        await frame.contentDocument?.querySelector('img')?.decode();
      } catch {
        // Print whatever loaded; an empty page says more than a dead button.
      }

      // Printing a frame means focusing it, and a frame that is aria-hidden and
      // about to be removed is no place to leave a keyboard user. Focus goes
      // back to the button that asked once the dialog is done with it.
      const opener = document.activeElement;
      const restoreFocus = () => {
        if (opener instanceof HTMLElement && opener.isConnected) {
          opener.focus();
        }
      };

      view.addEventListener(
        'afterprint',
        () => {
          restoreFocus();
          setTimeout(release, REVOKE_DELAY_MS);
        },
        { once: true },
      );
      view.focus();
      view.print();
      restoreFocus();
    },
    { once: true },
  );
  frame.srcdoc = printDocument(imageUrl, title, landscape);
  document.body.append(frame);
};

/**
 * Opens the browser's print dialog on the guide sheet alone, fitted to the
 * page, so the artist can redraw the reference on paper.
 *
 * @param options Everything the sheet is composed from, plus the page title.
 * @param options.title Title of the printed document.
 */
export const printGuideSheet = async (options: SheetOptions & { title: string }) => {
  latestPrint += 1;

  const request = latestPrint;
  const canvas = await composeSheet(options, printScale(options.width, options.height));

  canvas?.toBlob((blob) => {
    if (blob && request === latestPrint) {
      printInFrame(blob, options.title, options.width > options.height);
    }
  }, 'image/png');
};
