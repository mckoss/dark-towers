# Dark Tower Watch — development checklist

_Last updated 2026-08-23 early morning. Summary: pipeline, all five views, PWA, 96 unit + 28 e2e tests, CI — done. Left: Railway deployment, detector calibration decision, older tracks from Drive, email on requests._

Status key: `[x]` done & verified · `[~]` in progress / partial · `[ ]` to do · `[?]` blocked, see QUESTIONS.md

## 0. Repo & hosting
- [x] Public repo `mckoss/dark-towers`, prototype hosted on GitHub Pages (desktop + mobile chooser)
- [x] SvelteKit 2 / Svelte 5 / TypeScript scaffold, `adapter-node` (Railway-ready), `npm start` runs the built server
- [x] Secrets: `FLIGHTAWARE_API_KEY` env → fallback gitignored `config.json`
- [?] Railway service + volume for `DATA_DIR`, deploy on CI pass on `main` (QUESTIONS #12)
- [x] GitHub Actions CI: `npm run check`, unit tests, DB rebuild from raw, Playwright e2e — green on `main` (~1 min)
- [x] `CLAUDE.md` with project conventions

## 1. Data pipeline (server-side TypeScript)
- [x] FlightAware AeroAPI client, 10 QPM spacing, 429 back-off
- [x] Permanent raw cache on disk (`data/raw/<ICAO>/<night>/flights.json`, `data/raw/<ICAO>/tracks/<id>.json`) — re-runs cost 0 API calls
- [x] SQLite schema (nights, flights w/ full-resolution positions, incidents, requests, runs) — all writes are upserts → idempotent
- [x] Night window per airport tower hours + time zone (no-tower airports = whole day)
- [x] Normalise flights (event time rule from the notebook, airline vs private, other airport, position-only endpoints)
- [x] Clip tracks to 10 NM ring + closed-tower window, keep every ADS-B point (no thinning)
- [x] Time-parameterised Catmull-Rom → cubic Bézier spline (`src/lib/spline.ts`) for smooth drawing and replay sampling
- [x] Close-approach detection on a shared 1 s clock (<3 NM and <1,000 ft), severity, stable incident ids; exclusions for same aircraft (same tail or coincident tracks), aircraft on the ground (<75 ft AGL or <40 kt), and closest points outside the ring
- [~] Detector calibration against real data — 10 flags over 7 nights, mostly pattern traffic vs. a landing aircraft; needs your judgement (QUESTIONS #14)
- [x] Scheduler: hourly catch-up inside the server for every `tracked` airport (last 9 nights), runs at boot too
- [x] CLI: `npm run ingest -- PAE 2026-08-18 [--nights N] [--offline] [--force] | --catch-up`, `npm run db:rebuild`, `npm run import:colab`
- [x] Sample data: all Drive weeks (May 2024 → Aug 2026) imported locally; `data/` is gitignored, a 4-night fixture (`tests/fixtures/raw`, `npm run db:seed`) serves dev/CI
- [ ] Backup job for the Railway volume (raw cache + SQLite)
- [x] Unit tests (96): time windows/DST, geo, spline continuity & smoothness, separation detector on synthetic tracks, track clipping incl. ring-crossing interpolation, DB upserts, idempotent re-ingest with `fetch` never called
- [x] Airport "requested" form persists to `requests` table (no email yet — QUESTIONS #8)

## 2. UI — shared
- [x] Design tokens + typography roles in `src/app.css` (Modernist system from README)
- [x] Responsive layout with sticky header, nav, mobile menu
- [x] US map component (d3-geo albersUsa, vendored `us-atlas` topology, tracked-airport circles, SSR)
- [x] Flight-path map component (Leaflet, CARTO light tiles, 10 NM ring, spline-sampled tracks, hover focus ↔ flight log, tile-free fallback)
- [x] Replay component (shared real clock, spline sampling, silhouettes rotated to heading, alert flash + ring, labels offset away from the other aircraft, scrubber, 4×/8×/16×, live readout; parked aircraft held at first/last report)
- [x] PWA: manifest, icons (SVG/192/512/maskable/apple-touch), service worker (shell precache, network-first navigations, offline fallback)

## 3. UI — routes
- [x] `/` Home: headline, 30-night stats, US map, legend, CTA — never names an airport (e2e-enforced)
- [x] `/airports`: coverage stats, table (tracked rows clickable), request block with confirmation, mobile card layout
- [x] `/airport/[code]`: header facts, stat row, 30-night calendar, night panel (map + close approaches + totals), flight log, honest empty states (no data / no tracks)
- [x] `/close-approach/[id]`: headline figures, generated narrative, animated replay, aircraft cards, "What we know, and don't", related table
- [x] `/method`: sources, three steps, poster, flagged-event definition & limitations, Who we are + contacts
- [x] 404 / error page in the design system

## 4. Tests
- [x] Vitest unit tests (see §1) — 96 passing
- [x] Playwright e2e (28 = 14 × desktop + Pixel 7): every route, nav + mobile menu, airport row → detail, calendar night switch, empty states, incident replay plays & scrubs, request form confirms, editorial-rule assertions, 404s, manifest/service worker, health
- [x] `npm test` + `npm run test:e2e` green locally and in CI

## 5. Deployment
- [?] Railway project, `DATA_DIR=/data` volume, `FLIGHTAWARE_API_KEY`, `SCHEDULER=on` — config files ready (`railway.json`, `.env.example`); not created (QUESTIONS #12)
- [x] Health endpoint `/api/health` (used by Railway healthcheck in `railway.json`)
- [ ] Verify first autonomous nightly run in production

## 5b. Admin & accounts
- [x] Single settings source: `config.json` locally / `CONFIG_JSON` env on Railway (same JSON) — api key, admins, Google client, session secret, public origin
- [x] Google sign-in (authorization-code flow, id_token claims checked for audience/issuer, no new dependency); signed stateless session cookie; admins allow-list checked live per request
- [x] `/admin` console: unlinked, `noindex`, robots-disallowed; redirect to sign-in when anonymous, 403 when not an admin; open mode for local dev/e2e via `DTW_NO_AUTH=1`
- [x] Console features: config status, "Catch up now", ingest a night (with force), live job log, data-on-hand per airport, incomplete nights, recent runs, airport requests (delete)
- [?] Google OAuth client id/secret — needs creating in Google Cloud Console (QUESTIONS #18)
- [x] Backfill: `/admin` "Backfill" (airport × N nights, oldest first, skips complete nights, stops on first API error) and `npm run ingest -- BLI --backfill 30`; for newly approved airports and after an API-tier upgrade
- [x] `aeroapi_history` config flag: routes nights/flights older than 10 days to AeroAPI `/history/` endpoints and makes cached "too old" misses retryable; without it, old windows are refused before any network call
- [ ] Admin: manage admins from the UI (currently the list lives in config.json) — follow-up if wanted
- [ ] Admin: edit tracked airports / tower hours from the UI instead of `src/lib/airports.ts`

## 6. Backlog — requested
- [x] **Longer time series.** Airport page defaults to the rolling last 30 days; stepping back moves through calendar-month windows (`?month=YYYY-MM`, e.g. June 2024) with stats, calendar and night panel scoped to that window; `?night=` deep links outside the default window imply their month; 'Last 30 days →' returns. All historical data (May 2024 →) is reachable.
- [ ] **Trend graphs.** Charts of close approaches per week (and flights per week, airline vs. private) per airport and site-wide; weekly rollup query over `nights`, rendered in the design system (flat SVG, accent for close approaches). Candidate placements: airport detail above the calendar, and a site-wide view on Home or Airports.
- [ ] Supporting: weekly aggregate table or view in SQLite; tests for week bucketing across month/year boundaries.

## 7. Nice-to-have / follow-ups noticed while building
- [ ] Replay: draw the trails with the Bézier path itself (currently 2 s spline samples as polylines — visually smooth, but a true SVG `C` path layer would be lighter)
- [ ] Airport detail: keyboard navigation between calendar nights; deep-link `?night=` to the prototype's "ledger" home variant is out of scope
- [ ] Ingest: record API call counts per run in `runs` table and show on `/api/health` (cost visibility)
- [ ] `OPERATORS` map is short — unknown airline operators fall back to "Passenger airline"
- [ ] Tower hours / elevations for non-PAE airports need verification (QUESTIONS #4)
- [ ] Consider git-lfs or volume-only storage once raw data grows past ~50 MB
