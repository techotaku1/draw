/**
 * Longest side of the picture sent for detection. Anything larger only costs
 * bandwidth and tokens: the model reports positions on a fixed grid anyway.
 */
const MAX_DETECTION_SIZE = 1024;

/**
 * Rasterises any displayable image source into a bounded PNG payload.
 * Going through a canvas normalises the format too, which matters because the
 * bundled reference figure is an SVG and the model only accepts raster images.
 * @param src Object URL or same-origin path of the reference image.
 * @returns Base64 PNG data without the `data:` prefix, or `null` when the
 * image cannot be decoded or the canvas is unavailable.
 */
export const toDetectionPng = async (src: string): Promise<string | null> => {
  const bitmap = new window.Image();

  bitmap.src = src;

  try {
    await bitmap.decode();
  } catch {
    return null;
  }

  const longestSide = Math.max(bitmap.naturalWidth, bitmap.naturalHeight);

  if (longestSide === 0) {
    return null;
  }

  const scale = Math.min(1, MAX_DETECTION_SIZE / longestSide);
  const canvas = document.createElement('canvas');

  canvas.width = Math.round(bitmap.naturalWidth * scale);
  canvas.height = Math.round(bitmap.naturalHeight * scale);

  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  // A white ground keeps transparent PNGs from reaching the model as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const dataUrl = canvas.toDataURL('image/png');

  return dataUrl.slice(dataUrl.indexOf(',') + 1);
};
