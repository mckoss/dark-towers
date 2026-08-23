# Questions & clarifications for Mike

Collected overnight while building the app. Decisions I made in the meantime are noted so you can reverse them.

## Data
1. **Historical tracks.** AeroAPI's personal tier refuses `/flights/{id}/track` for flights older than 10 days (the `/history/` endpoints need the Standard tier). Nights Aug 12–13 of the sample week therefore have flight lists but no positions. Your Drive file `FlightData/KPAE-2026-08-12-tracks.json` (6.6 MB) has them, but the Drive connector timed out on a file that size three times. Could you drop it into `data/raw/KPAE/` and run `npm run import:colab -- data/raw/KPAE/colab-week-2026-08-12.json data/raw/KPAE/KPAE-2026-08-12-tracks.json && npm run db:rebuild`? (Import overwrites the cached "too old" misses.)
2. **API spend.** I fetched tracks live for the sample nights that were still within 10 days (~70 calls). The scheduler will fetch ~15–25 track calls per night for PAE going forward. OK? Any monthly cap you want enforced in code?
3. **Which airports to actually track.** The prototype showed six airports as "tracking" with invented counts. I set only **PAE** to `tracked: true`; the others are listed as *queued* (BLI, RDM, SUN, HYA, PIH) or *requested*. Flip `tracked` in `src/lib/airports.ts` to start collecting any of them — each costs roughly (flights + 1) API calls per night.
4. **Tower hours** for the non-PAE airports are copied from the prototype and unverified against the Chart Supplement. Worth checking before any go live.
5. **Commit raw data?** I committed `data/raw/KPAE` (flight lists + the tracks I could fetch, a few MB) so the app works on a fresh clone with no API calls. The SQLite db is gitignored and rebuilt with `npm run db:rebuild`. Happy to move raw data to the Railway volume only / git-lfs instead.
6. **"Complete" nights.** A night is marked complete once every flight has a cached track *or* a cached miss. The scheduler waits 1 h after the tower reopens before collecting. Is 1 h enough settle time for FlightAware to finalise tracks, or should it be longer (e.g. 6 h)?
7. **Position-only flights.** Some FlightAware records have no real origin/destination (e.g. `"L 45.81 -119.07"`). I show "Unknown" for those. OK?

## Product / design
8. **Request form.** Submissions are stored in SQLite (`requests` table); no email is sent. Do you want an email notification (to you and Kevin) — and via what service on Railway?
9. **Home-page figures** are rolling 30 nights ending on the latest complete night, summed across all tracked airports. With only PAE tracked they equal PAE's numbers. Fine?
10. **Mobile.** The prototype had separate desktop and mobile mockups; I built one responsive layout (breakpoint 760 px) following the mobile mockup below that width. The "installable web app" label is honoured via a PWA manifest + service worker.
11. **Contacts on the Method page** are taken from the README (you and Kevin Stoltz). Confirm these should be public on the live site.

## Infrastructure
12. **Railway**: I haven't created the Railway project/service (needs a decision on region and the volume size; also whether you want me to do it via the Railway MCP with your account). The app is ready: `npm run build && npm start`, `PORT` honoured, `DATA_DIR` for the volume.
13. **CI**: I planned a GitHub Actions workflow (check + unit + Playwright) but didn't want to burn Actions minutes on your account without asking. Say the word.
