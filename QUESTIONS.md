# Questions & clarifications for Mike

Collected overnight while building the app. Decisions I made in the meantime are noted so you can reverse them.

## Data
1. ~~**Historical tracks.**~~ **Resolved 08-23:** you dropped the Drive tracks file in; imported, all 7 nights now have full tracks. (The Drive connector returns files base64-inline and dropped the session on the 6.6 MB file — a tooling limit on my side.)
2. **API spend.** I fetched tracks live for the sample nights that were still within 10 days (~70 calls). The scheduler will fetch ~15–25 track calls per night for PAE going forward. OK? Any monthly cap you want enforced in code?
3. **Which airports to actually track.** The prototype showed six airports as "tracking" with invented counts. I set only **PAE** to `tracked: true`; the others are listed as *queued* (BLI, RDM, SUN, HYA, PIH) or *requested*. Flip `tracked` in `src/lib/airports.ts` to start collecting any of them — each costs roughly (flights + 1) API calls per night.
4. **Tower hours** for the non-PAE airports are copied from the prototype and unverified against the Chart Supplement. Worth checking before any go live.
5. ~~**Commit raw data?**~~ **Resolved 08-23:** `data/` is fully gitignored; a 4-night fixture in `tests/fixtures/raw` seeds dev/CI via `npm run db:seed`. Production data lives on the Railway volume only — a backup job for the volume is a follow-up.
6. **"Complete" nights.** A night is marked complete once every flight has a cached track *or* a cached miss. The scheduler waits 1 h after the tower reopens before collecting. Is 1 h enough settle time for FlightAware to finalise tracks, or should it be longer (e.g. 6 h)?
7. **Position-only flights.** Some FlightAware records have no real origin/destination (e.g. `"L 45.81 -119.07"`). I show "Unknown" for those. OK?

## Product / design
8. **Request form.** Submissions are stored in SQLite (`requests` table); no email is sent. Do you want an email notification (to you and Kevin) — and via what service on Railway?
9. **Home-page figures** are rolling 30 nights ending on the latest complete night, summed across all tracked airports. With only PAE tracked they equal PAE's numbers. Fine?
10. **Mobile.** The prototype had separate desktop and mobile mockups; I built one responsive layout (breakpoint 760 px) following the mobile mockup below that width. The "installable web app" label is honoured via a PWA manifest + service worker.
11. **Contacts on the Method page** are taken from the README (you and Kevin Stoltz). Confirm these should be public on the live site.

## Infrastructure
12. **Railway**: I haven't created the Railway project/service (needs a decision on region and the volume size; also whether you want me to do it via the Railway MCP with your account). The app is ready: `npm run build && npm start`, `PORT` honoured, `DATA_DIR` for the volume.
13. **CI**: You said deploys should trigger on CI passing on `main`, so I went ahead and added `.github/workflows/ci.yml` (check → unit → DB rebuild from committed raw data → Playwright e2e, ~1 min per run). It's green. Fine to keep?

## Findings worth a look
14. **Detector calibration.** With the README's rule (simultaneously < 3 NM and < 1,000 ft, both airborne, inside the ring) the real week produced **10 flags over 7 nights**: 3 on Aug 13, 1 on Aug 14, 7 on Aug 17, 1 on Aug 18 (Aug 16 and 15: none). Almost all are a private/training aircraft in the traffic pattern 1–2 NM from an aircraft on short final — e.g. three flags at 21:00–21:01 on Aug 17 involve the same three Cessnas arriving together right as the tower closed. These are "true" under the rule, but they will read as routine pattern traffic to a pilot. Options: (a) keep the rule and let the severity split ("very close" = < 1 NM and < 500 ft) do the talking; (b) raise the ground threshold so aircraft below ~500 ft AGL on final don't pair; (c) require both aircraft to be > 1 NM from the field. I left (a) in place. Your call — it's one constant in `src/lib/airports.ts` / `separation.ts` and `npm run db:rebuild` reprocesses everything offline.
15. **Same aircraft, two records.** FlightAware gave `LF36` (Life Flight callsign) and `N433LF` (its registration) as two flights on Aug 15 riding on top of each other (0.03 NM). I exclude pairs whose tracks coincide for ≥80% of their overlap, and pairs with the same tail. Air-ambulance and pattern-work aircraft also show `other airport` as "Snohomish County (PAE)" — i.e. local flights — which the flight log shows as-is.
16. **Counts differ slightly from the notebook.** The Colab week lists 104 flights; the app stores 90 — dedupe of flights appearing in both arrivals and departures lists, and cancelled/no-event-time records. Flight-log per-night counts: 19/11/9/13/12/14/12.
17. **Replay windows.** Because tracks end at touchdown, a landing aircraft often has no data after the closest moment. The replay now holds such an aircraft at its last report (faded) and extends the window to −3 min/+90 s regardless, so every replay starts outside the envelope.

## Admin / sign-in
18. **Google OAuth client.** Sign-in needs an OAuth 2.0 Web client from Google Cloud Console (APIs & Services → Credentials → Create credentials → OAuth client ID → Web application). Authorised redirect URIs: `http://localhost:5173/auth/google/callback` (dev) and `https://<your-domain>/auth/google/callback` (prod). Put `client_id`/`client_secret` under `"google"` in `config.json` (see `config.example.json`); the same JSON goes into `CONFIG_JSON` on Railway. Until then, `/admin` returns 503 on sign-in; for local work run `DTW_NO_AUTH=1 npm run dev` (open mode, like mbbb-music's `MBBB_NO_AUTH`).
19. **Admins default** to `mckoss@gmail.com` and `kstoltz@citynetwork.com` (from the README contacts). Confirm Kevin's address.
20. **Compared with mbbb-music**: same architecture (code flow, HMAC session cookie with email only, allow-list resolved per request, single config file ↔ single env var). Differences: I read claims from Google's `id_token` directly (no `google-auth-library`), sessions are 14 days not 30, and there are no roles beyond admin and no users UI — say if you want the mbbb `users.json` + `/admin/users` pattern here too.
