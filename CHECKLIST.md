# Dark Tower Watch — development checklist

Status key: `[x]` done & verified · `[~]` in progress / partial · `[ ]` to do · `[?]` blocked, see QUESTIONS.md

## 0. Repo & hosting
- [x] Public repo `mckoss/dark-towers`, prototype hosted on GitHub Pages (desktop + mobile chooser)
- [x] SvelteKit 2 / Svelte 5 / TypeScript scaffold, `adapter-node` (Railway-ready), `npm start` runs the built server
- [x] Secrets: `FLIGHTAWARE_API_KEY` env → fallback gitignored `settings.json`
- [ ] Railway service + volume for `DATA_DIR`, deploy on CI pass on `main`
- [ ] GitHub Actions CI: `npm run check`, unit tests, Playwright e2e
- [ ] `CLAUDE.md` with project conventions

## 1. Data pipeline (server-side TypeScript)
- [x] FlightAware AeroAPI client, 10 QPM spacing, 429 back-off
- [x] Permanent raw cache on disk (`data/raw/<ICAO>/<night>/flights.json`, `data/raw/<ICAO>/tracks/<id>.json`) — re-runs cost 0 API calls
- [x] SQLite schema (nights, flights w/ full-resolution positions, incidents, requests, runs) — all writes are upserts → idempotent
- [x] Night window per airport tower hours + time zone (no-tower airports = whole day)
- [x] Normalise flights (event time rule from the notebook, airline vs private, other airport, position-only endpoints)
- [x] Clip tracks to 10 NM ring + closed-tower window, keep every ADS-B point (no thinning)
- [x] Time-parameterised Catmull-Rom → cubic Bézier spline (`src/lib/spline.ts`) for smooth drawing and replay sampling
- [x] Close-approach detection on a shared 1 s clock (<3 NM and <1,000 ft), severity, stable incident ids, same-tail exclusion
- [x] Scheduler: hourly catch-up inside the server for every `tracked` airport (last 9 nights), runs at boot too
- [x] CLI: `npm run ingest -- PAE 2026-08-18 [--nights N] [--offline] [--force] | --catch-up`, `npm run db:rebuild`, `npm run import:colab`
- [~] Sample data: Colab week (Aug 12–18) imported; tracks fetched live where <10 days old (see QUESTIONS — older tracks need the Drive file)
- [ ] Unit tests: time windows/DST, spline continuity, separation detector (synthetic tracks), track clipping, idempotent re-ingest
- [ ] Airport "requested" form persists to `requests` table

## 2. UI — shared
- [x] Design tokens + typography roles in `src/app.css` (Modernist system from README)
- [x] Responsive layout with sticky header, nav, mobile menu
- [ ] US map component (d3-geo albersUsa, vendored `us-atlas` topology, tracked-airport circles)
- [ ] Flight-path map component (Leaflet, CARTO light tiles, 10 NM ring, spline tracks, tile-free fallback)
- [ ] Replay component (shared clock, spline sampling, aircraft silhouettes, alert state, scrubber/speed controls)
- [ ] PWA: manifest, icons, service worker (offline shell), installable on mobile

## 3. UI — routes
- [ ] `/` Home: headline, 30-night stats, US map, legend, CTA — never names an airport
- [ ] `/airports`: coverage stats, table (tracked rows clickable), request block with confirmation
- [ ] `/airport/[code]`: header facts, stat row, 30-night calendar, night panel (map + close approaches + totals), flight log, honest empty state
- [ ] `/close-approach/[id]`: headline figures, animated replay, aircraft cards, "What we know, and don't", related table
- [ ] `/method`: sources, three steps, poster, flagged-event definition & limitations, Who we are + contacts
- [ ] 404 / error page in the design system

## 4. Tests
- [ ] Vitest unit tests (see §1)
- [ ] Playwright e2e: every route renders, nav works, airport row → detail, calendar night switch, incident replay plays, request form confirms, mobile viewport
- [ ] `npm test` + `npm run test:e2e` green locally

## 5. Deployment
- [ ] Railway project, `DATA_DIR=/data` volume, `FLIGHTAWARE_API_KEY`, `SCHEDULER=on`
- [ ] Health endpoint `/api/health`
- [ ] Verify first autonomous nightly run in production
