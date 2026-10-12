import * as z from 'zod';

export const skeletonCoachSchema = z.object({
  artStyle: z.enum(['anime', 'manga', 'comic', 'chibi']),
  metrics: z.object({
    headUnit: z.number().nullable(),
    headsTall: z.number().nullable(),
    shoulderTiltDeg: z.number().nullable(),
    hipTiltDeg: z.number().nullable(),
    contrappostoDeg: z.number().nullable(),
  }),
  locale: z.string().min(2).max(8).default('es'),
});

export type SkeletonCoachInput = z.infer<typeof skeletonCoachSchema>;
