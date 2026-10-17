# DrawSkeleton

Mark the key points of a reference image and get back the structural sketch that
anime, manga and comic artists use to start a figure: line of action, geometric
blocking-in (*encaje*), shoulder and hip axes, wireframe bones and articulation
circles — plus the proportion measurements that tell you whether the figure is
on model for the style you are drawing.

Built on the [Next.js Boilerplate](https://github.com/ixartz/Next-js-Boilerplate).

## Run it

```bash
npm run dev
```

Then open <http://localhost:3000/studio>.

`npm run dev` also starts the local PGlite database and the Sentry Spotlight UI.
The studio needs neither, so `npm run dev:next` is enough while working on it.

## Interface

The tool is one screen. `StudioLayout` fills the viewport and nothing scrolls on
desktop: a command bar on top, the canvas, one tabbed panel (points,
measurements, steps, sheet) and a status strip. Below `lg` the page scrolls
normally — a phone does not have the height for canvas and panel at once.

Every control appears exactly once, and they all live in the status strip:
opacity, guides, markers. Each one drives the marking canvas, the sheet preview
and the downloaded PNG at the same time, so nothing is set in two places and the
small preview always shows what the file will contain.

The chrome is strictly neutral graphite and selection is a chalk-on-graphite
inversion rather than a colour, so the guide lines are the only saturated pixels
on screen. `controls.ts` holds the shared class strings, which is where to
change a control's look once for the whole tool.

## Two modes, one studio

| Mode | What you mark | What you get |
| --- | --- | --- |
| Body | 17 landmarks | Line of action, blocking-in, axes, wireframe, joints |
| Face | 10 landmarks | Cranium circle, cheek and jaw lines, symmetry axis, horizontal divisions, alignment verticals |

`StudioShell` owns the reference image, the active mode and the AI detection;
the two studios own their own geometry, panels and teaching steps. Both routes
(`/studio` and `/studio/face`) render the same shell with a different starting
mode, so the mode toggle never reloads the page.

**Detection picks the mode.** The endpoint first asks the model how the image is
framed, then runs the landmark pass that fits, and answers with the target it
chose. Upload a portrait while standing in body mode and the studio switches
itself — which only works because the shell holds the image, not the studios.
The two calls cost roughly 11 to 13 seconds together. When the classification is
unclear it falls back to `body`, whose landmarks still cover the head.

## The face construction

Taken from the anime guide, whose rule contradicts the "draw an oval" advice you
see elsewhere:

- **The cranium is a circle, not an oval.** Everything else hangs off it.
- **The cheek lines hang off the circle.** Each leaves the skull at its temple,
  level with the top of the ear, runs straight down to the jaw corner and turns
  into a short flat chin. Longer and more angular reads adult and masculine;
  shorter and rounder reads young.
- **The eye line sits in the lower part of the cranium circle**, not halfway
  down the face. That is what leaves the big forehead and short chin the style is
  built on. Crossed with the symmetry axis it divides the face in 4.
- **Nose and mouth stay on the axis**, checked against verticals dropped from
  each eye — the most common mistake and the easiest to spot.

`eyeVsCranium` measures that third rule directly: it must stay negative, meaning
the eyes sit inside the circle rather than below it. The age presets in
`ages.ts` encode the qualitative rule ("rounder and lower reads younger") as
numeric ranges; they are not figures quoted from the source.

### The cranium is fitted, not assumed

`circleThrough` takes the circle that passes through the crown and both temples.
A ball in projection lands on its own outline whatever way the head is turned or
tilted, so the fit follows a rolled head; the previous version took its width
from the temples and its height from the crown, and those two anchors part
company as soon as the head is not upright.

### Drawn after a manga construction sheet

The guides follow a front / profile / three-quarter construction sheet of the
kind manga tutorials teach, rather than a Loomis head:

- **The jaw is straight strokes with real corners.** The cheek starts on the
  circle at the temple (pulled onto the circle along its radius when the fit had
  to discard the crown, and never above the circle's widest point), runs to the
  marked jaw corner, then to a flat chin about a tenth as wide as the jaw. The
  Hermite curve it replaced left the circle at its equator and bowed into a U
  outside the drawn cheeks, so it traced neither the skull nor the face.
- **The horizontals are straight and cross the whole head.** Every division is
  one stroke through its landmark, parallel to the eyes, centred on the cranium
  and running a third of a radius past it on each side. They used to be short
  arcs wrapped around the ball; the sheet rules them flat in all three views.
- **The hairline sits halfway from the top of the skull to the circle's
  centre**, which is where all three views of the sheet put it, so it needs the
  cranium rather than the brow.
- **The symmetry axis runs a little past the crown and the chin.**

The body studio blocks in the same head: a circle touching `headTop` with the
cheek lines and flat chin hung off it, in proportions read off the sheet's front
view, instead of an egg from crown to chin.

## How it works

The studio is entirely client-side. You mark 17 landmarks in a guided order, and
every derived shape is computed from those points — no model, no inference.

| Step | What it adds | Why it comes at this point |
| --- | --- | --- |
| 1. Line of action | A Catmull-Rom curve through head → sternum → pelvis → feet | Gesture before structure |
| 2. Blocking-in | Head circle and jaw, ribcage egg, pelvis box | Proportion before anatomy |
| 3. Axes | Shoulder and hip tilt lines | Reveals the contrapposto |
| 4. Wireframe | One straight segment per bone | Limb lengths are cheap to fix here |
| 5. Articulations | A circle on every joint | The hinges that drive the contour |
| 6. Volume | Everything, with the photo faded out | Checks the structure stands alone |

### Measurements

- **Height in head units** — `distance(headTop, chin)` is the module; the figure
  height is the vertical span from the top of the head to the ankle midpoint,
  plus a quarter head for the foot below the ankle.
- **Shoulder / hip axis tilt** — signed angle of each axis against the horizontal.
- **Contrapposto** — the opposition between those two angles. Near zero reads as
  a stiff mannequin.

Each style preset carries its canonical range (anime 6.5–7.5 heads, manga
7.5–8.5, comic 8–9, chibi 2–3) and the panel says which way to correct.

### PNG export

The export panel shows a live preview of the sheet and downloads exactly that:
reference photo at the chosen opacity, the full guide overlay, and the numbered
markers. The panel owns no options of its own — the three status-strip controls
decide what is in it, and the preview is the confirmation that you get what you
expect before spending a download.

The teaching step is the one viewing aid that stays local to the canvas: the
sheet always carries the complete construction, because a half-built sheet is
never what you want on paper.

Switching the markers off hides the only handles you can drag, so turn them back
on to keep editing points.

### The active landmark is derived, not only stored

Each studio keeps the landmark you picked, but the one it actually marks is
`selected ?? first unmarked`. The fallback is what keeps the canvas alive: the
selection empties itself when the last landmark lands, and the shell clears the
marks from outside the studio whenever a new image arrives. Storing it alone
left a loaded image with zero marks and a surface that swallowed every click,
because `LandmarkCanvas` returns early without an active id.

### Guide weight

Both overlays derive their stroke from an anatomical unit — the cranium radius
for a face, one head unit for a figure — so the construction keeps the same
weight relative to the drawing whatever the upload. `HAIRLINE` is that fraction,
and it is deliberately small: these lines sit under the drawing rather than
compete with it.

Before anything is marked there is no anatomical unit to scale from, and the
fallback used to be the view box *height*. That swings with the aspect ratio —
571 user units for a landscape shot against 1750 for a portrait — so the same
face started out three times heavier in one than the other. The fallback is the
view box width, which is fixed at 1000.

The consequence is worth knowing: a portrait is laid out tall, so its canvas is
narrower and its guides land near one screen pixel, while a landscape shot of
the same head draws them at over two. That is proportion working, not a bug —
the same thing happens to a pencil construction when you look at a smaller
drawing.

### Coordinate spaces

Landmarks are stored **normalized** (`0..1` of the image box) so a marked pose
survives any display size. `buildSkeleton` projects them into an SVG user-space
of `1000 × 1000/aspect`, which keeps radii, stroke weights and rotations uniform
whatever the aspect ratio of the reference image.

## Layout

```
src/features/skeleton/
├── types.ts             # Point, JointId, Pose, Skeleton
├── joints.ts            # Capture order, groups, colors
├── skeleton.ts          # All the geometry and the metrics (pure, tested)
├── skeleton.test.ts
├── styles.ts            # Art style presets and the proportion verdict
├── steps.ts             # Teaching sequence and layer visibility
├── SkeletonOverlay.tsx  # Pure SVG rendering (also used by the PNG export)
├── SkeletonCanvas.tsx   # Image + marking surface + draggable markers
├── PosePanel.tsx        # Checklist, style picker, measurements
├── StepsPanel.tsx       # The six drawing steps
└── SkeletonStudio.tsx   # State and layout

src/app/[locale]/(studio)/studio/page.tsx   # Route
src/app/api/skeleton-coach/route.ts         # AI coach endpoint
src/libs/Gemini.ts                          # Gen AI client and model id
public/assets/images/reference-pose.svg     # Built-in sample figure
```

## AI landmark detection (optional)

**Detectar con IA** sends the reference image to Gemini and gets the 17 landmarks
back, so the skeleton builds itself. The points stay fully editable afterwards —
the detection is a first pass, not a measurement.

The image is rasterised to a PNG capped at 1024 px on the long side before it
leaves the browser, which also normalises the bundled SVG reference (the model
only accepts raster images).

Measured against the known coordinates of `reference-pose.svg`, as a percentage
of image height:

| Model | Latency | Mean error | Worst landmark |
| --- | --- | --- | --- |
| `gemini-3.6-flash` (current) | ~15 s | 0.80 % | 2.0 % |
| `gemini-3.1-flash-lite` | ~4 s | 1.46 % | 5.6 % |
| `gemini-3.5-flash` | > 70 s | — | timed out |
| `gemini-3.1-pro-preview` | — | — | rate limited |

`gemini-2.5-*` is rejected for new API keys, which is why the default moved to
the 3.x line.

Landmark descriptions live in `JOINT_DESCRIPTIONS` in the detection route and
matter more than the model choice: sharpening the `chest` wording alone took its
error from 7.6 % down to 2.0 %.

### Two models, because one is not always there

`gemini-3.6-flash` answers `503 UNAVAILABLE` under load — Google's own wording is
that demand spikes are temporary. That is not something a user can wait out
inside a session, so `callGemini` retries the primary and then runs the same
request against `gemini-3.1-flash-lite`.

The fallback is a real trade, not a free win: 1.46 % mean landmark error against
0.80 %, and 5.6 % on its worst landmark against 2.0 %. The response carries
`fallback: true` and the studio says so, because points that look detected but
are looser deserve a closer read. It also has its own daily quota, so the switch
doubles the day's budget as a side effect.

### The quota is the real limit

The free tier allows **20 requests per day** for `gemini-3.6-flash`
(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`). Auto mode spends **two**
per press — one to classify the framing, one to locate the landmarks — so the
button works about **ten times a day** before the key is spent.

Google reports both a busy model and an exhausted quota as `429`, which is why
they used to share one message. They do not share a remedy: waiting fixes the
first and never fixes the second. `isQuotaError` tells them apart, `callGemini`
no longer retries a spent quota, and the UI names the real cause. Failing takes
0.5 s instead of the 5 to 9 s three pointless retries used to cost.

## AI coach (optional)

The studio works fully without it. When a key is present, the **Consejo de la IA**
button sends only the measurements (never the image) to Gemini and returns short
correction notes.

1. Create an API key at <https://aistudio.google.com/apikey>.
2. Add it to `.env.local` in the project root (never committed):

   ```shell
   GEMINI_API_KEY=your_key_here
   ```

3. Restart the dev server.

Without the key the endpoint answers `503` and the UI says the key is missing.

Both AI features share one model constant, `GEMINI_MODEL` in
`src/libs/Gemini.ts` (currently `gemini-3.6-flash`). Change it there and nothing
else moves. `callGemini` in the same file retries 429 and 5xx answers with
backoff, because the API returns those under load.

## Languages

Spanish is the default locale, English is available at `/en`. All UI copy lives
in `src/locales/{es,en}.json`; `npm run check:i18n` enforces parity.

## Quality gate

```bash
npm run lint && npm run check:types && npm run test && npm run check:i18n && npm run check:deps
```

`npm run build-local` does not run on Windows: the `db-server:memory` script passes
`--run 'npm run db:migrate'`, and cmd.exe does not group single quotes, so the
argument arrives split. Use `npm run build:next` to check the production build.

## Cache Components

`cacheComponents` and `partialPrefetching` are both on in `next.config.ts`. The
studio is the reason it was worth doing: `/studio` and `/studio/face` prerender
as fully static HTML, so the shell is on screen before any JavaScript runs.

Two boilerplate routes carry `export const instant = false`, the sanctioned
temporary opt-out:

| Route | Why | What migrating it needs |
| --- | --- | --- |
| `(auth)/layout.tsx` | Clerk reads auth outside a Suspense boundary, for the whole group | Suspense boundaries around the authenticated parts |
| `(marketing)/counter/page.tsx` | `CurrentCount` reads `headers()` to key a per-visitor counter | Suspense around the counter, or cache the lookup |

Both are ixartz demo pages the studio does not use. `instant = false` is a
promise that the route may block, not a licence to leave unstable code in a
prerender: it does **not** excuse reading the clock. That is why the copyright
year in `BaseTemplate` and `lastModified` in `sitemap.ts` are module-scope
constants — read once at load instead of on every render. Both were prerender
blockers, and `sitemap.xml` had already silently become a dynamic route before
that was fixed.

## Held-back dependencies

These are deliberate, and each one has an exit:

| Pin | Why | How to lift it |
| --- | --- | --- |
| `overrides.playwright` / `playwright-core` `1.62.1` | `@vitest/browser-playwright` floats to `1.63.0`, which wants a Chromium revision that is not downloaded, and the browser test project cannot start | `npx playwright install chromium`, then drop both overrides |
| `next-intl` `4.13.4` | `4.14.x` deprecates `setRequestLocale` and `requestLocale` in favour of `next/root-params` — 17 files and a change to how the locale reaches every page | Migrate to `next/root-params` as its own change |
| `@sentry/nextjs` `10.70.0` | `10.75.0` deprecates `withSentryConfig` | Migrate `next.config.ts` to the replacement API |
| ~~`@clerk/nextjs` `7.5.12`~~ | **Lifted.** On `^7.9.9`; the middleware no longer calls `createRouteMatcher` | — |
| Storybook `10.5.8`, Vitest `4.1.10` | npm cannot re-resolve either family incrementally: both pin peers exactly and `ERESOLVE` on an in-place bump | Bump with a clean `node_modules` rebuild |

Lint runs `no-deprecated` as an error, so lifting a pin without doing its
migration turns the gate red. That is the point.
