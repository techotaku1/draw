# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project

DrawSkeleton: a drawing-reference tool for anime/manga/comic artists. The user marks landmarks on a reference image (17 body, 10 face) and the app draws the construction sketch (line of action, blocking-in, shoulder/hip axes, wireframe, joints) plus proportion measurements, and prints them or exports them as PNG so the artist can redraw the reference by hand. Built on the ixartz Next.js Boilerplate: Next 16, React 19, next-intl, Clerk, Drizzle + PGlite/Postgres, Arcjet, Sentry, Tailwind 4, Vitest, Playwright, Storybook.

- `origin` still points at `ixartz/Next-js-Boilerplate`; do not push until a real remote is set.
- The studio work (`src/features/`, `(studio)` routes, `src/libs/Gemini.ts`, `DRAWSKELETON.md`) is untracked. Run `git status` before assuming a file is committed.
- Default locale is Spanish, English at `/en` (`localePrefix: 'as-needed'`). All UI copy is in `src/locales/{es,en}.json`.

## Commands

npm (lockfile is `package-lock.json`), not bun.
- `npm run dev:next` is enough for the studio (`/studio`, `/studio/face`). `npm run dev` also starts the PGlite file DB and Sentry Spotlight.
- Check gate: `npm run lint && npm run check:types && npm run test && npm run check:i18n && npm run check:deps`. `lint` is `ultracite check --type-aware --type-check` (oxlint + oxfmt); on a clean checkout run `npx next typegen` first, as CI does.
- Tests: `npm run test` runs Vitest with two projects, `unit` (`src/**/*.test.ts`, node) and `ui` (`*.test.tsx`, browser via Playwright Chromium). One file: `npx vitest run src/features/skeleton/skeleton.test.ts`. E2E: `npm run test:e2e` (`tests/e2e/*.e2e.ts`); integration tests are `tests/integration/*.integ.ts`.
- `npm run build-local` fails on Windows (cmd.exe splits the quoted `--run` argument of `db-server:memory`). Use `npm run build:next` to check a production build. `npm run build` runs `db:migrate` first.
- DB: schema in `src/models/Schema.ts` (only the demo `counter` table), migrations in `migrations/`; `db:generate`, `db:migrate`.
- Hooks (lefthook): pre-commit runs `ultracite fix` and knip; commit-msg runs commitlint.

## Architecture

- **Two studios, one shell.** `src/features/landmarks/StudioShell.tsx` owns the reference image, the active mode (body/face), and AI detection. `features/skeleton/` (body) and `features/face/` (face) own their geometry, panels, and teaching steps. `/studio` and `/studio/face` (`src/app/[locale]/(studio)/`) render the same shell with a different `initialMode`, so the mode toggle never reloads.
- **Geometry is pure and client-side** (`skeleton/skeleton.ts`, `face/guides.ts`, unit-tested). Landmarks are stored normalized (0..1 of the image box); `buildSkeleton` projects them into an SVG space of `1000 x 1000/aspect` (`VIEWBOX_WIDTH`) so radii and strokes stay uniform across aspect ratios. Guide stroke weight derives from an anatomical unit (cranium radius or head unit); the fallback before anything is marked is the view-box width, not its height.
- **Active landmark is derived**, not only stored: `selected ?? first unmarked` (`SkeletonStudio.tsx`). Storing the selection alone left a loaded image with a dead canvas once the last landmark was placed.
- **AI (optional, Gemini via `@google/genai`).** `src/libs/Gemini.ts` holds `GEMINI_MODEL` (`gemini-3.1-pro-preview`, overridable with the `GEMINI_MODEL` env var) and `GEMINI_FALLBACK_MODEL` (`gemini-3.6-flash`). Pro is the default while landmark accuracy is under diagnosis: it is slower and spends a smaller daily allowance, so going back to `gemini-3.6-flash` as the primary is a one-line change once the jaw is right. `gemini-3.1-flash-lite` is no longer wired in — at about 1.5 % vs 0.8 % mean landmark error it is the wrong thing to fall back to when the point of the primary is precision. `callGemini` retries 429/5xx with backoff, never retries a spent quota, and falls back to the second model only on overload. `gemini-2.5-*` is rejected for new API keys.
  - `POST /api/detect-pose`: image to landmarks. With target `auto` it first classifies body vs face, so one press costs two calls. The free tier allows 20 requests/day per model, so about ten detections a day. The landmark wording in `BODY_DESCRIPTIONS`/`FACE_DESCRIPTIONS` moves accuracy more than the model choice.
  - `POST /api/skeleton-coach`: sends only the measurements, never the image, and returns short advice.
  - Both answer 503 without `GEMINI_API_KEY`. A 429 carries a `reason` (`quota_daily`, `quota_rate`, `busy`) because waiting fixes only the last; keep that distinction in the UI.
- **Request pipeline** (`src/proxy.ts`, Next 16 proxy): Arcjet bot detection when `ARCJET_KEY` is set, then `clerkMiddleware` wrapping next-intl routing — the composition Clerk documents. The matcher skips `/api` and adds `/__clerk/(.*)`.
- **Auth is per resource, not per route matcher.** `createRouteMatcher` is deprecated in `@clerk/nextjs` 7.9+ and the lint gate treats `no-deprecated` as an error, so the middleware does no auth checks at all. `await auth.protect()` sits in `(studio)/layout.tsx` and `(auth)/dashboard/layout.tsx`; each `ClerkProvider` sets the `signInUrl` those redirect to. Adding a protected area means adding `auth.protect()` to its layout, never a matcher.
- **The root is the studio.** `(marketing)/page.tsx` is a `redirect` to `/studio`; `/` never shows a landing page.
- **Cache Components** are on (`cacheComponents`, `partialPrefetching`); the React Compiler runs only in production builds. `/studio*` is **dynamic** (`ƒ`) because the layout reads the session — that is the price of the login, not a missing boundary, and `(studio)/layout.tsx` carries `export const instant = false` to say so. `(auth)/layout.tsx` opts out for the same reason. That flag does not excuse reading the clock or `headers()` in prerendered code, which is why `COPYRIGHT_YEAR` (`BaseTemplate.tsx`) and `LAST_MODIFIED` (`sitemap.ts`) are module-scope constants.

## Rules and pitfalls

- Env: validate everything in `src/libs/Env.ts` and never read `process.env` elsewhere (existing exceptions: `next.config.ts`, `src/proxy.ts`, `drizzle.config.ts`, `vitest.config.ts`). Names: `DATABASE_URL` (required, even though the studio does not use the DB), `GEMINI_API_KEY`, `CLERK_SECRET_KEY`, `ARCJET_KEY` (all optional), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `NEXT_PUBLIC_LOGGING_LEVEL`, and the Better Stack and PostHog `NEXT_PUBLIC_*` keys.
- All `.env*` files are gitignored. Real keys live only in the local `.env`; `.env.production` from the boilerplate stays on disk but is no longer tracked.
- Held-back dependencies are exact pins on purpose: `next-intl` 4.13.4, `@sentry/nextjs` 10.70.0 (newer versions deprecate APIs we use), Storybook 10.5.8 and Vitest 4.1.10 (npm cannot re-resolve them incrementally), and `overrides.playwright` 1.62.1 (lift after `npx playwright install chromium`). Bumping without the matching migration breaks the lint gate. Exit plans are in `DRAWSKELETON.md`, "Held-back dependencies". **Clerk is no longer among them**: `@clerk/nextjs` is on `^7.9.9` and the `createRouteMatcher` migration that unblocked it is done.
- `DRAWSKELETON.md` (322 lines) is the long-form project doc; its "Layout" tree is out of date (`SkeletonCanvas`/`StepsPanel` no longer exist, the canvas is `features/landmarks/LandmarkCanvas.tsx`). Trust the file system.
- Style (mostly lint-enforced, config in `oxlint.config.ts`): named exports only (Next.js pages/layouts default-export, name ends in `Page`, props alias `PageProps`); `@/` imports unless same directory; `type` over `interface`; options object for 3+ params or optional flags; JSDoc on functions (`jsdoc/require-param`/`require-returns` are errors: description, `@param`, `@returns`, `@throws`).
- React: no `useMemo`/`useCallback` (React Compiler), avoid `useEffect`, single `props` parameter with an inline type and `props.foo` access (no destructuring), `React.ReactNode` not `ReactNode`. Use `import type * as z from 'zod'` when only types are needed.
- Locale pages: `props: { params: Promise<{ locale: string }> }`, then `await props.params`, then `setRequestLocale(locale)`. Never hard-code UI strings: `getTranslations` on the server, `useTranslations` on the client, context-specific keys (`card_title`, `meta_description`), `t.rich(...)` for markup, sentence case. Dashboard pages define metadata once in their layout.
- Tests: co-locate `*.test.ts`; `*.integ.ts` and `*.e2e.ts` live in `tests/`. Top `describe` is the subject; `it` titles are short third-person present, sentence case, no period, without "should/works/handles". Avoid mocking unless necessary.
- Shell: escape glob characters (`[locale]`, `(studio)`, `[[...sign-in]]`) when passing Next.js paths to commands.
