# Dark Towers

A data-driven advocacy site arguing for expanded FAA control-tower hours at airports that have
scheduled passenger airline service but part-time or no-time tower coverage. For each tracked
airport and each night, it publishes the flights that operated with no tower on duty and every pair
of aircraft that came closer than controller separation minima ("close approaches"), with an animated
replay of each one.

Live site: https://dark-towers.org · Paine Field (KPAE, Everett WA) is the reference airport. Prototype (design mockups):
https://mckoss.com/dark-towers/ · Design spec: [DESIGN.md](DESIGN.md) · Open questions:
[QUESTIONS.md](QUESTIONS.md) · Backlog: [GitHub issues](https://github.com/mckoss/dark-towers/issues)

## Install and run

Requires Node 22+.

```bash
npm install
cp config.example.json config.json   # FlightAware AeroAPI key, admin emails, Google OAuth client
npm run db:seed                      # load the test fixture (4 nights of KPAE) and build the database
npm run dev                          # http://localhost:5173
```

- `npm run dev` starts the hourly collector too; it will fetch any recent nights not yet stored
  (API calls). Set `"scheduler": false` in `config.json` to collect only on demand.
- Admin console: `/admin` (Google sign-in, emails listed in `config.json` → `admins`). Without Google
  credentials: `DTW_NO_AUTH=1 npm run dev`.
- Tests: `npm test` (unit, vitest) and `npm run test:e2e` (Playwright, desktop + mobile).
- Collect data by hand: `npm run ingest -- PAE 2026-08-22`, `npm run ingest -- PAE --backfill 30`,
  `npm run ingest -- --catch-up`. Reprocess everything cached: `npm run db:rebuild`.
- Import a week produced by the Colab notebook: `npm run import:colab -- <flights.json> [tracks.json]`.

All runtime data lives under `data/` (gitignored): `data/raw/<ICAO>/…` is the permanent cache of raw
FlightAware responses; `data/db/darktowers.sqlite` is derived from it.

## Dependencies and data sources

- **Runtime:** SvelteKit 2 / Svelte 5 (TypeScript), Node server via `adapter-node`,
  `better-sqlite3`, `node-cron`. **Maps:** Leaflet with CARTO `light_all` tiles
  (© OpenStreetMap contributors, © CARTO); US map from `d3-geo` + `topojson-client` with the
  `us-atlas` states topology. **Font:** Archivo (Google Fonts).
- **Flight data:** [FlightAware AeroAPI](https://www.flightaware.com/aeroapi/portal/documentation) —
  `/airports/{id}/flights` for arrivals and departures in each closed-tower window, and
  `/flights/{id}/track` for ADS-B positions. Personal tier: 10 queries/minute, live data only
  (10 days); set `"aeroapi_history": true` on Standard+ to use the `/history/` endpoints.
- **Tower hours:** FAA Chart Supplement (entered by hand, effective-dated, editable in
  `/admin/airports`; seeded from `airports.json`).
- **Airline classification:** FlightAware's flight type plus published operator codes.

## Deploying to Railway

The app is a single Node service with a persistent volume.

1. Create a Railway project from this repo (`railway.json` sets the build `npm ci && npm run build`,
   start `node build`, and the `/api/health` healthcheck).
2. Add a **volume** mounted at `/data`.
3. Set one environment variable, **`CONFIG_JSON`**, to the full contents of your `config.json` with
   `"data_dir": "/data"` and `"public_origin": "https://<your domain>"`. `PORT` is provided by Railway.
4. In Google Cloud Console, add `https://<your domain>/auth/google/callback` to the OAuth client's
   authorised redirect URIs.
5. Deploy. On first start the airports table is seeded from `airports.json`; the hourly job then
   collects each tracked airport's nights. To load history, use `/admin` → Backfill (or copy an
   existing `data/raw` tree onto the volume and run `npm run db:rebuild`).

Deploys are intended to trigger on CI passing on `main` (`.github/workflows/ci.yml`: check, unit,
seed, e2e).
