# Dark Towers — working agreements

Data-driven advocacy site: flights and close approaches at airports where airliners operate with no
tower on duty. Read `DESIGN.md` for the design spec and editorial rules; `QUESTIONS.md` for open decisions;
GitHub issues for the backlog. `README.md` is the public front door (purpose, install, deploy).

This file is the single source of agent instructions for this repo — project conventions first, then
the workflow agreements. `CLAUDE.md` only points here.

## Stack
- SvelteKit 2, Svelte 5 **runes mode** (`$props/$state/$derived/$effect`, `onclick` not `on:click`), TypeScript strict.
- `adapter-node` → `npm run build && npm start` (Railway). Config: `config.json` locally / `CONFIG_JSON` env on Railway (same JSON: api_key, admins, google, session_secret, public_origin, data_dir, scheduler, history_days). `PORT` comes from the platform.
- `/admin` is unlinked and Google-sign-in gated; `DTW_NO_AUTH=1` opens it locally.
- Data: raw FlightAware responses cached forever under `data/raw/<ICAO>/…`; SQLite at `data/db/darktowers.sqlite`. All of `data/` is gitignored; `npm run db:seed` loads the fixture in `tests/fixtures/raw`, `npm run db:rebuild` reprocesses whatever is cached.
- FAA NASR facility data (`src/lib/nasr.ts`, `src/lib/server/nasr.ts`): cached per 28-day cycle at `data/nasr/`; `NASR_JSON` env points tests at `tests/fixtures/nasr.json`. Airport requests are accepted for part-time and no-tower airports; a 24-hour tower is accepted only as a reference airport, and only with quiet hours (see **Airports**).
- Maps: Leaflet via `src/lib/leaflet.ts` (CARTO tiles — never tile.openstreetmap.org); US map is d3-geo SVG.
- Tracks are drawn/replayed through `src/lib/spline.ts` (time-parameterised Catmull-Rom → cubic Bézier).

## Editorial rules (hard)
1. Plain language in all user-facing copy: "close approach" not "loss of separation"; "passenger airline" and "private and training aircraft", never "air carrier"/"general aviation".
2. Never claim what is or is not in an FAA record.
3. The home page never names a specific airport.

## Design system
Tokens and typography roles live in `src/app.css` (spec in `DESIGN.md`) — use the classes/vars, don't invent colors. Zero border radius, 2px ink section rules, 1px hairline row rules, everything flush left (including button labels). Single accent `#ec3013`.

## Commands
- `npm run dev` / `npm run check` / `npm test` (vitest, `tests/unit`) / `npm run test:e2e` (Playwright, `tests/e2e`, builds + previews on :4173)
- `npm run ingest -- PAE 2026-08-18 [--nights N] [--offline] [--force]`, `npm run ingest -- --catch-up`
- `npm run import:colab -- <flights.json> [tracks.json]`

## Pipeline invariants
Idempotent at every layer: cache hit ⇒ zero API calls; DB writes are upserts keyed by `fa_flight_id` / `(airport, night)` / stable incident id. Personal-tier AeroAPI: 10 queries/min, no tracks older than 10 days (cached as misses). Extended-history capability is probed per key and cached at `data/aeroapi-capability.json` (`src/lib/server/capability.ts`); `aeroapi_history` in config only overrides.

## Airports
`airports.json` is the insert-only seed; the `airports` / `tower_schedules` tables are the source of truth once they exist. Edit at `/admin/airports`, then Export JSON and commit it. Tower hours are effective-dated (`towerHoursOn(airport, night)`), so always pass the night's schedule, never a static one.

Airports have a `kind`: `dark` (tower closed or absent) or `reference` (24-hour tower watched over its
published voluntary quiet hours, for comparison — excluded from every headline total). `open`/`close`
always bound the hours we do *not* collect, so a reference airport stores the complement of its quiet
window and the pipeline needs no special case. Quiet hours are hand-entered with the source cited in the
schedule note; there is no national dataset.

## Branching, CI, and merge workflow

- Small, low-risk changes may go directly to `main` in the primary checkout unless `main` is protected. Run the relevant local tests, commit the change, and push it to GitHub without waiting for an additional prompt.
- For non-trivial changes, create a feature branch in a sibling worktree named `dark-towers-<feature-name>`. Never check out the feature branch in the primary checkout.
- Before publishing feature work, run all relevant local tests and checks. Commit the completed change, push the feature branch, and open or update its pull request.
- Wait until all required GitHub CI checks are green, then tell the user the change is ready to merge. Do not merge without the user's explicit confirmation.
- After confirmation, squash-merge the pull request. Remove the local worktree, delete the local branch, and delete the remote branch.
- Monitor post-merge CI and the production deployment for the exact merged commit. Report when production is ready; do not claim a change is live merely because CI passed.

## Versioning

Every merged pull request bumps `version` in **both** `package.json` and `package-lock.json` — minor
for a feature, patch for a fix. Include the bump in the feature branch, not as a follow-up commit: the
version renders in the site header, so a missed bump leaves two different production builds reporting
the same version and there is no way to tell which one is live.

## Worktree data

Runtime data lives in the gitignored `data/` directory. When work in a sibling feature worktree needs the existing local dataset, symlink `data/` from the primary checkout after verifying both paths. Keep the symlink, its target data, `config.json`, and all secrets out of commits.

## Production deployment

GitHub is the deployment control plane. Successful CI on `main` triggers the Railway production deployment configured by `railway.json`; do not deploy with the Railway CLI. After a push or merge to `main`, monitor the GitHub checks, the Railway deployment record for the exact commit, and `https://dark-towers.org/api/health` before reporting that production is ready.
