# Dark Tower Watch — design

Design principles, visual system and screen specifications. This file is the working spec while the
site is being built and will be retired at v1.0 (as will QUESTIONS.md). Product backlog lives in
GitHub issues; conventions for contributors are in CLAUDE.md.

## Product principles
- **The data carries the argument.** Neutral tone; no editorialising beyond the published figures.
- **Plain language only** in user-facing copy: "close approach", not "loss of separation"; "passenger airline" and "private and training aircraft", never "air carrier" / "general aviation".
- **Never claim what is or is not in an FAA record.** The incident page says so explicitly.
- **The home page never names a specific airport.**
- **Honest gaps.** Nights without tracks, airports without data, and unverified tower hours are stated, not hidden.
- **Idempotent data pipeline.** Every raw API response is cached forever; re-running costs nothing; the database is rebuilt from the cache.
- **Nights are keyed by the evening.** "Night of Aug 22" = tower close on Aug 22 to tower open on Aug 23, per airport, per the schedule in effect that date.
- **Airports are data, not code.** `airports.json` seeds; the database is the source of truth once it exists; edits happen online and are exported back to the file.


## Overview
Dark Tower Watch is a data-driven advocacy site arguing for expanded FAA control-tower hours at
airports that have scheduled passenger airline service but part-time or no-time tower coverage.
It publishes, per airport and per night, the flights that operated with no tower on duty and every
pair of aircraft that came closer than controller separation minima ("close approaches").

Paine Field / Snohomish County (KPAE, Everett WA) is the reference airport with full detail data.
Eleven further airports carry 30-day summary counts or sit in a "requested" queue.

Audience: FAA/DOT officials and congressional staff; nearby residents and city councils.
Tone: neutral — the data carries the argument. Two hard editorial rules:
1. **Plain language only.** No pilot/controller jargon in user-facing copy (jargon is fine in
   internal code). "Close approach", not "loss of separation". "Passenger airline" and
   "private and training aircraft", not "air carrier" and "general aviation".
2. **Never claim what is or is not in an FAA record.** We do not know whether an event was
   reported. The incident page says so explicitly.

## About the Design Files
The files in `prototype/` are **design references written in HTML** — working prototypes that show
the intended look, information architecture, and behavior. They are **not production code to copy**.
The task is to recreate these designs in the target codebase's own environment (React/Next, Vue,
Rails views, etc.) using its established patterns, component library, and data layer. If no
codebase exists yet, choose an appropriate stack and implement the designs there.

The prototype is written as "Design Components" (`.dc.html`): an HTML template with inline styles
plus a small logic class. Read them as markup + behavior specs, not as a framework to adopt.

`standalone/Dark Tower Watch (offline).html` is a single self-contained file (no network calls) —
useful for reviewing the design without running anything.

## Fidelity
**High fidelity.** Colors, typography, spacing, rules, and interaction states are final and should be
reproduced exactly. Layout proportions (7fr/5fr splits, 2px section rules, flush-left alignment) are
deliberate and part of the design system.

## Design system
The visual system is "Modernist": flat, architectural, a single red accent on a light ground,
**zero border radius anywhere**, strong 2px rules between major sections, everything flush left
(including labels inside buttons), and a visible modular grid.

### Design tokens
| Token | Value | Use |
| --- | --- | --- |
| Ground | `#f3f2f2` | page background |
| Ground, alt | `#eae9e9` | inset panels, map plate |
| Ink | `#201e1d` | primary text, 2px rules |
| Ink 80 | `#444141` | body copy |
| Ink 60 | `#605d5d` | secondary text, stat labels |
| Ink 45 | `#7d7979` | kickers, footnotes |
| Ink 25 | `#bab6b6` | empty/zero values |
| Hairline | `#d7d3d3` | 1px internal dividers |
| Accent | `#ec3013` | primary action, close-approach figures, poster fields |
| Accent, hover | `#dd2b0f` | button hover |
| Accent, text-safe | `#ae1800` | accent-colored body text and links |
| Accent tint | `#fff2ef` | close-approach card background |
| Selection | `#ffc4b8` | `::selection` |
| Radius | `0` | everywhere, no exceptions |
| Section rule | `2px solid #201e1d` | between major sections |
| Row rule | `1px solid #d7d3d3` | inside sections, table rows |

### Typography
Archivo throughout (weights 400/500/600/700/800/900), loaded from Google Fonts.

| Role | Size / weight / tracking |
| --- | --- |
| Hero headline | 58px / 900 / -0.035em / line-height 0.98 |
| Page headline | 42–46px / 900 / -0.03em / 1.02 |
| Poster statement | 40px / 900 / -0.03em / 1.08 |
| Section heading | 20–24px / 800 / -0.02em |
| Big stat | 40–66px / 900 / -0.03em / 0.9 |
| Body | 16–17px / 400 / line-height 1.55–1.6 |
| Stat label | 11–12px / 600 / 0.12em / uppercase |
| Kicker | 11px / 700 / 0.16em / uppercase / accent |
| Table header | 11px / 700 / 0.12em / uppercase / `#7d7979` |
| Button | 14px / 700 / 0.04em / **text-align left** |

Numeric columns and clocks use `font-variant-numeric: tabular-nums`.

### Interaction states
- Row/link hover: background `#eae9e9`.
- Primary button hover: `#dd2b0f`.
- Focus: `outline: 2px solid #ec3013; outline-offset: 2px` — never the browser default.
- Links: `#ae1800` with a 1px underline at 40% alpha; hover `#ec3013`.

## Screens / Views

### 1. Home
Two layouts exist; **"map-first" is the shipping default**. The "ledger" variant is an alternate the
stakeholder can toggle — implement map-first first, and treat ledger as optional.

**Map-first layout**
- Row 1, `grid-template-columns: 7fr 5fr`, bottom rule 2px, vertical 2px rule between cells.
  - Left cell, padding 56px 24px 48px: the headline
    *"Airliners are landing at airports where nobody is in the tower — or there is no tower at all."*
    (58px/900, max-width 18ch), then a paragraph (17px, max-width 54ch) describing part-time or
    no-time tower service and that pilots are left to see each other to avoid collisions.
  - Right cell: three stat rows (`1fr 1fr 1fr`), each `display:flex; align-items:center; gap:16px`
    with a 52px/900 number (min-width 100px) beside an uppercase 12px label:
    total flights with the tower closed; flown by passenger airlines; pairs that came closer than a
    controller would allow (this number in accent). Below the rows, one 11px footnote:
    **"Data from last 30 days"** — the period is stated once per block, never per label.
- Row 2: full-width US map (see *US map* below), 640px tall, with a legend card pinned bottom-left
  (2px ink border, ground background, 16px 20px padding): accent circle = tracked airport, circle
  grows with the count; ink circle = tracked, none found; plus a line noting that airports still
  under review are listed on the Airports page rather than shown on the map.
- Row 3: a single line of copy — *"Not seeing your airport? Ask us to start tracking it."* — and an
  accent button "Airport list and submissions".

**Data note:** the home page must never name a specific airport in its copy.

### 2. Airports
- Header row `7fr 5fr`: kicker "Coverage", headline "Airports tracked", and a paragraph defining
  the inclusion rule (regular passenger service **and** part-time or no-time tower service).
  Right cell: 2×2 stat grid — airports tracked, close approaches (accent), requested, nights covered.
- Table, `grid-template-columns: 80px 1.5fr 1fr 1fr 100px 120px 128px 36px`:
  Code / Airport / City / Tower hours / Flights / Close approaches / Status / arrow.
  Header row has a 2px top rule; each data row a 1px bottom rule and 14px vertical padding.
  The period is stated once beside the table heading: "Counts from last 30 days".
  - Tracked rows: full opacity, `cursor:pointer`, hover `#eae9e9`, a `→` in accent-text color, and a
    title attribute "Open the &lt;CODE&gt; record". Clicking opens that airport's detail page.
  - Non-tracked rows: opacity 0.6, `cursor:default`, no arrow, inert.
  - Close-approach cell: 20px/800; accent when > 0, `#bab6b6` when 0 or unknown.
  - Status pill: 11px/700 uppercase, 4px 9px padding — accent fill + white text for "Tracking",
    `#d7d3d3` for "Queued", transparent for "Requested".
- Request block: accent field (`#ec3013`, white text) split `7fr 5fr`. Left: 40px/900 headline
  *"If your airport has passenger flights and part-time or no-time tower service, put it on the map."*
  Right: two white inputs (airport code or city+state; email) and an ink button "Send request".
  On submit, show a translucent confirmation panel: "Thanks — &lt;value&gt; has been added to the request list."
  **Make no promise** about review, verification, or turnaround time.

### 3. Airport detail
Driven by an airport code; every string comes from the airport record, nothing hard-coded.
- Header `7fr 5fr`: kicker "Tracked nightly · within 10 nautical miles", then a 66px/900 code beside
  the airport name (22px/700) and "City, State · ICAO". Below, a paragraph generated from the record:
  tower hours restated in plain language, or for a no-tower airport a variant explaining there is no
  tower at any hour. Right cell: 2×2 facts — Tower hours, Hours closed, Airlines serving, Detailed data.
- Stat row, 4 equal cells with a single 11px kicker above it
  ("Over the last 30 days · hours the tower was closed"):
  Flights in and out / Passenger airline / Private and training aircraft / Close approaches (accent).
  **Do not add "positions analysed" or similar process metrics** — the site reports flights, not method.
- 30-day calendar: `repeat(15, 1fr)` grid, 6px gap, each cell a 2px-bordered button ≥78px tall
  showing weekday, day number, and "N flights". Heat by volume through greys; any night with a close
  approach is accent-filled with white text; the selected night has an ink border. Nights with no data
  are pale with an em dash. Legend at right: Fewer flights / More flights / Close approach.
  Footnote states which nights carry full flight-path detail.
- Night panel `7fr 5fr`:
  - Left: "Flight paths within 10 nautical miles, tower closed" + "Night of &lt;date&gt;", then the flight
    map (see below), then a legend: accent line = passenger airline, ink line = private and training,
    circle = 10 nautical mile ring.
  - Right: "Close approaches this night". Each is a card with a 6px accent left border on `#fff2ef`:
    severity label ("Very close" / "Closer than allowed"), time, "IDENT × IDENT", then two figures —
    lateral in NM captioned "Less than 3 NM", vertical in feet captioned "Less than 1,000'" — and a
    link "See what happened →". Empty state: "No two aircraft came within 3 nautical miles and
    1,000 feet of each other this night, across all N flights."
    Below: a 2×2 "That night, in total" grid — Flights / Passenger airline / Private and training.
- Flight log table, `92px 150px 110px 1fr 90px 1.4fr`:
  Time / Kind of flight / Arriving or leaving / Flight / Aircraft / Other airport. The "kind" cell
  carries an 8px square swatch (accent for airline, `#bab6b6` for private) and renders the category in
  plain language.
- Airports without detail data show an honest empty state instead of the calendar/map/log:
  "Nightly detail for &lt;CODE&gt; is not published yet." + the 30-day totals above + a link to Paine Field.

### 4. Close approach (incident) detail
- Back link, then header `7fr 5fr`: severity pill, reference id, a 44px/900 headline
  *"&lt;A&gt; and &lt;B&gt; came within 0.9 NM and 300' of each other."*, the date/time + airport + "tower closed",
  and the narrative note. Right cell: three stacked facts, each a 48px/900 figure with a caption —
  lateral ("a controller would keep them at least 3 NM apart"), vertical ("...at least 1,000' apart"),
  distance from the airport ("inside the 10 NM ring").
- **Animated replay** (the centerpiece — see *Replay* below), full width of the 7fr column.
- Right column: Aircraft A and Aircraft B cards (color swatch, ident, category · type, altitude at the
  closest point), then a `#eae9e9` panel headed "What we know, and don't" stating plainly that we do
  not know whether the event was reported, that with the tower closed there was no controller to file
  a report, and that a pilot cannot report an aircraft they never saw.
- "Other close approaches at &lt;airport&gt;" table: Reference / Aircraft / Lateral / Vertical.

### 5. Method
- Header `7fr 5fr`: "What this site counts, and how." + sources list (FlightAware; FAA Chart
  Supplement; published airline schedules; OpenStreetMap and CARTO basemap tiles).
- Three numbered steps: collect every flight while the tower is closed; keep only the paths within
  10 NM (glossed once as "about 11.5 road miles"); measure how close aircraft came.
- Accent poster field: *"With a controller on duty, aircraft are kept at least 3 nautical miles apart,
  or 1,000 feet apart vertically. When the tower is closed, nothing enforces this safety margin."*
- Two columns: "What a flagged event is, and what it is not" (a flag is not a finding of pilot error
  and not an official ruling; VFR pilots may legally fly closer if they see and avoid) and
  "Known limitations" (aircraft without a position signal never appear, so counts are a floor;
  altitude is uncorrected for local pressure, ±100 ft; some times are estimates; low-altitude
  coverage is uneven).
- **"Who we are"** `7fr 5fr`: a citizen project, not FAA/airport/airline — built entirely on public
  ADS-B data and published tower hours. Contacts, as `mailto:` links:
  Mike Koss &lt;mckoss@gmail.com&gt;, Kevin Stoltz &lt;kstoltz@citynetwork.com&gt;, plus a
  "Send us feedback" accent button addressed to both.

## Maps

### US map (`us-map.js`)
d3-geo `geoAlbersUsa` fitted to a 960×560 viewBox, us-atlas `states-10m` topology.
States `#eae9e9`, internal borders ink at 0.35 opacity, 0.6px.
**Only tracked airports are drawn.** Each is a semi-transparent circle on its true projected
position — accent fill at 0.22 with a 1.5px accent stroke, radius `9 + sqrt(closeApproaches) * 7`;
ink at 0.12 for tracked airports with none. Overlap is allowed and expected (no de-clustering, no
leader lines — an earlier collision-avoidance version was rejected). Labels read "CODE · N", drawn
with a ground-colored halo stroke, flipped to the left of the circle when they would leave the
viewBox. Clicking a circle opens that airport.

### Flight-path map (`flight-map.js`)
Leaflet. Basemap tiles from CARTO `light_all` at 0.9 opacity —
**not `tile.openstreetmap.org`, which 403s non-browser origins** (this cost us a broken basemap once).
A 10 NM ring is always drawn (ink, 2px, 0.6). Tracks: accent 2.5px for airline, ink 1.75px at 0.55
for private; the focused track thickens to 4px, others fade to 0.16. Tooltip = ident · type.
The map fits the 10 NM bounds. There is also a tile-free mode that draws 2/5/10 NM rings, used when
tiles are unavailable, and support for a stored basemap image overlay.

### Replay (`incident-replay.js`)
Animated reconstruction of a close approach. Requirements, all of which were hard-won:
- **One shared clock.** Each aircraft flies its own path at its own constant speed (170 kt airline,
  95 kt light). Never stretch both tracks onto a common frame count — that depicts a collision.
- **Anchor to the record, not to a fudge factor.** Find the point on each path matching the recorded
  distance-from-field and altitude, derive each aircraft's launch offset from those, then rigidly
  shift the second path and both altitude profiles so that at the closest moment the pair is exactly
  the recorded lateral/vertical apart at the recorded distance from the field. Never scale displayed
  distances by a correction multiplier.
- **Window:** ~3 minutes before the closest pass to ~90 seconds after, clipped so neither aircraft has
  landed. It must *start outside* the 3 NM/1,000 ft envelope and show the aircraft diverging again.
- **Controls:** Play/Pause, a 300-step scrubber, speed 4×/8×/16× (8× default), and a live readout of
  local time, lateral distance, and vertical separation. The two figures turn accent when both are
  inside the envelope.
- **Aircraft symbols:** silhouettes rotated to track heading — airliner outline for passenger jets,
  bizjet outline for fast types (Citation/Learjet/Malibu class), light-single outline for slower
  general aviation. Glyph size derives from the pair's on-screen pixel separation at the closest pass
  (14–34px) so they never merge on a short mobile map.
- **Alert state:** inside the envelope both silhouettes flash (`opacity 1 → 0.25`, 0.5s steps) with an
  expanding accent ring.
- **Labels:** each ident chip is offset along the bearing *away from* the other aircraft and sits below
  the silhouettes in stacking order, so a chip never covers an aircraft.
- Context: the night's other traffic in ink at 0.12; each aircraft's full path dashed at 0.5; the
  flown portion as a solid trail; a thin dashed line between the pair showing current separation.

## Interactions & Behavior
- Navigation is client-side across five views: home, airports, airport detail, close approach, method.
  Scroll resets to top on navigation. In production these should be real routes
  (`/`, `/airports`, `/airport/:code`, `/close-approach/:id`, `/method`).
- Calendar cell → selects that night and re-renders the map, close approaches, and flight log.
- Close-approach card → close-approach detail.
- US map circle and airport row → airport detail for that code.
- Request form: controlled inputs, confirmation panel on submit. No client-side validation beyond
  requiring a value.

## State Management
`page`, `airportCode` (default PAE), `nightKey` (selected date), `incidentId`,
request-form fields (`value`, `email`, `submitted`). The replay owns its own frame index,
play/pause timer, and speed.

## Data model
See `prototype/pae-data.js` for the shape the UI expects.
- `airports[]`: `code, icao, name, city, pos [lat,lon], status ('tracking'|'queued'|'requested'),
  towerHours ('07:00–21:00' | 'no tower'), carriers, stats { ops, airline, incidents }`
- `nights[]`: `date, label, arrivals, departures, total, airlineOps, gaOps, positions,
  flights[], incidents (count)`
- `flights[]`: `time (local HH:MM), cat ('Airline'|'GA'|carrier name), ident, tail, type,
  from (other airport), dir ('arrival'|'departure'), track [[lat, lon, altFt], ...]`
- `incidents[]`: `id, night, time (HH:MM:SS), lateral (NM), vertical (ft), alt [a, b],
  dist (NM from field), a/b { ident, tail, type, cat, time }, note, severity, trackA, trackB`
- `thirty`: rolling 30-day totals for the reference airport.

**In production**, tracks must carry per-point timestamps. The prototype's tracks are reconstructed
geometry without time, which is why the replay has to infer timing; with real timestamped ADS-B the
replay becomes a direct playback and the anchoring logic can be deleted.

### Pipeline the production system needs
1. Nightly, per tracked airport: pull arrivals/departures between tower close and tower open from
   FlightAware AeroAPI (or another ADS-B source), in airport-local time, grouped by the evening.
2. Pull each flight's track; clip to 10 NM of the field and to the closed window.
3. Interpolate all tracks to a common clock; for every pair, find the minimum separation.
   Flag any pair simultaneously under 3 NM laterally and 1,000 ft vertically.
4. Classify each operation as passenger airline vs private/training from published schedules.
5. Store nightly aggregates and flagged events; the 30-day figures on every page are rolling windows.

## Assets
- **Fonts:** Archivo (Google Fonts).
- **Libraries:** d3 v7 + topojson-client (US map), us-atlas `states-10m` topology, Leaflet 1.9.4.
- **Basemap tiles:** CARTO `light_all`, attribution "© OpenStreetMap contributors, © CARTO".
  The standalone build embeds a stitched snapshot of the Paine Field area instead.
- No image assets, no icon font. Aircraft silhouettes are inline SVG paths in `incident-replay.js`.

## Screenshots
`screenshots/` shows each view as rendered by the prototype:

| File | View |
| --- | --- |
| 01-home.png | Home — headline, 30-day stats, US map with tracked airports |
| 02-airports.png | Airports — coverage stats, table, request block |
| 03-airport-detail-top.png | Airport detail — header, facts, 30-day stats, calendar |
| 04-airport-detail-night.png | Airport detail — night flight-path map, close approaches, flight log |
| 05-close-approach-top.png | Close approach — headline and the three recorded figures |
| 06-close-approach-replay.png | Close approach — replay at the closest pass (flashing silhouettes) |
| 07-method-top.png | Method — sources and the three steps |
| 08-method-who-we-are.png | Method — poster statement, limitations, Who we are + contacts |
| 09-mobile-screens.png | All four mobile screens in phone frames |

Note: the capture tool re-renders the DOM and does not paint Leaflet's basemap raster, so map
panels appear on a blank ground in these images. Open the standalone HTML file to see the maps with
their basemap. Vector tracks, aircraft silhouettes, rings, and all typography are accurate.

## Hosted prototype
https://mckoss.com/dark-towers/ (GitHub Pages, from `main`) offers the desktop and mobile prototypes.

## Files
```
screenshots/                        rendered views, see the table above
prototype/
  Dark Tower Watch.dc.html          desktop site — all five views, inline styles + logic class
  Dark Tower Watch Mobile.dc.html   four mobile screens in phone frames
  pae-data.js                       sample dataset (KPAE, nights of 12–18 Aug, plus airport summaries)
  us-map.js                         <us-airport-map> — d3 US map with airport circles
  flight-map.js                     <flight-map> — Leaflet track overlay
  incident-replay.js                <incident-replay> — animated close-approach replay
  support.js                        prototype runtime (not needed in production)
  ios-frame.jsx                     <IOSDevice> phone frame used by the mobile mockups (stand-in)
  leaflet.js, leaflet.css           Leaflet 1.9.4, vendored so the prototype runs without a CDN
  us-atlas.js                       us-atlas states-10m topology (window.US_ATLAS)
  pae-basemap.js                    stored basemap snapshot of the Paine Field area
  _ds/modernist-*/                  design-system stylesheet + bundle the .dc.html files load
standalone/
  Dark Tower Watch (offline).html   single self-contained file, no network calls
```

## Out of scope in the prototype
- No real API integration, auth, or persistence; the request form does not submit anywhere.
- Desktop and mobile are separate layouts, not one responsive build. Production should be responsive.
- No PWA manifest or service worker, despite the "installable web app" label on the mobile mockups.
- Only Paine Field has nightly detail; other airports carry summary counts only.
