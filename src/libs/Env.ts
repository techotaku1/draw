import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

// Everything here is optional on purpose: DrawSkeleton runs with an empty
// environment. The studio marks landmarks and draws the construction entirely
// in the browser, so a missing key degrades one feature instead of stopping
// the app. A required variable here is a trap — this module is imported by
// `Gemini.ts`, so a failed validation takes the AI routes down at import time,
// before any handler runs, and they answer 500 with no useful message.
export const Env = createEnv({
  server: {
    // Optional: enables Arcjet bot detection in `proxy.ts`.
    ARCJET_KEY: z.string().startsWith('ajkey_').optional(),
    // Optional: the studio is fully usable without authentication. Only the
    // `/studio`, `/dashboard` and `/sign-in` routes need Clerk configured.
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    // Optional: enables AI landmark detection and the drawing coach. Without
    // it the studio still builds the skeleton locally and both AI endpoints
    // answer 503.
    GEMINI_API_KEY: z.string().min(1).optional(),
    // Optional: overrides the model the AI features call. Set it to swap in a
    // stronger model while diagnosing landmark accuracy, then remove it.
    GEMINI_MODEL: z.string().min(1).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_LOGGING_LEVEL: z
      .enum(['error', 'info', 'debug', 'warning', 'trace', 'fatal'])
      .default('info'),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    ARCJET_KEY: process.env.ARCJET_KEY,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LOGGING_LEVEL: process.env.NEXT_PUBLIC_LOGGING_LEVEL,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST,
    NODE_ENV: process.env.NODE_ENV,
  },
});
