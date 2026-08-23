# Dark Tower Watch — project conventions

Data-driven advocacy site: flights and close approaches at airports where airliners operate with no
tower on duty. Read `README.md` for the full design spec and editorial rules; `CHECKLIST.md` for
status; `QUESTIONS.md` for open decisions.

## Stack
- SvelteKit 2, Svelte 5 **runes mode** (`$props/$state/$derived/$effect`, `onclick` not `on:click`), TypeScript strict.
- `adapter-node` → `npm run build && npm start` (Railway). Config: `config.json` locally / `CONFIG_JSON` env on Railway (same JSON: api_key, admins, google, session_secret, public_origin, data_dir, scheduler, history_days). `PORT` comes from the platform.
- `/admin` is unlinked and Google-sign-in gated; `DTW_NO_AUTH=1` opens it locally.
- Data: raw FlightAware responses cached forever under `data/raw/<ICAO>/…`; SQLite at `data/db/darktowers.sqlite`. All of `data/` is gitignored; `npm run db:seed` loads the fixture in `tests/fixtures/raw`, `npm run db:rebuild` reprocesses whatever is cached.
- Maps: Leaflet via `src/lib/leaflet.ts` (CARTO tiles — never tile.openstreetmap.org); US map is d3-geo SVG.
- Tracks are drawn/replayed through `src/lib/spline.ts` (time-parameterised Catmull-Rom → cubic Bézier).

## Editorial rules (hard)
1. Plain language in all user-facing copy: "close approach" not "loss of separation"; "passenger airline" and "private and training aircraft", never "air carrier"/"general aviation".
2. Never claim what is or is not in an FAA record.
3. The home page never names a specific airport.

## Design system
Tokens and typography roles live in `src/app.css` — use the classes/vars, don't invent colors. Zero border radius, 2px ink section rules, 1px hairline row rules, everything flush left (including button labels). Single accent `#ec3013`.

## Commands
- `npm run dev` / `npm run check` / `npm test` (vitest, `tests/unit`) / `npm run test:e2e` (Playwright, `tests/e2e`, builds + previews on :4173)
- `npm run ingest -- PAE 2026-08-18 [--nights N] [--offline] [--force]`, `npm run ingest -- --catch-up`
- `npm run import:colab -- <flights.json> [tracks.json]`

## Pipeline invariants
Idempotent at every layer: cache hit ⇒ zero API calls; DB writes are upserts keyed by `fa_flight_id` / `(airport, night)` / stable incident id. Personal-tier AeroAPI: 10 queries/min, no tracks older than 10 days (cached as misses).
