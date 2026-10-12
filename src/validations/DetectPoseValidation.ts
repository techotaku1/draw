import * as z from 'zod';

/** Roughly 8 MB of base64, which a 1024 px PNG never reaches. */
const MAX_BASE64_LENGTH = 8_000_000;

export const detectPoseSchema = z.object({
  /** Raw base64 payload, without the `data:` prefix. */
  image: z.string().min(1).max(MAX_BASE64_LENGTH),
  mimeType: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  /** Which landmark set to locate. `auto` lets the model decide first. */
  target: z.enum(['body', 'face', 'auto']).default('auto'),
});
