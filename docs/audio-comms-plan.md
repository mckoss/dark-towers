# Plan: radio audio during close-approach replays

Tracking issue: [#45](https://github.com/mckoss/dark-towers/issues/45). That issue and its reference
comment cover why this matters, the legal background, transcription and the editorial guardrails. This
document adds three things:

1. How to **find and prove a source** for every channel the two aircraft could have been on: the airport
   frequency (CTAF), approach control and Seattle Center. PAE comes first.
2. **Timing**: how to get each transmission's start time accurate enough to place the aircraft
   correctly on the map.
3. **Playback**: during a replay, the animation slows to real time (1x) while a transmission plays, so
   the aircraft are where they actually were when each word was spoken.

Research date: 2026-09-14. Anything marked *unverified* still needs a person with a browser or a radio.

---

## 1. Channels to capture at PAE

At night, a pilot near Paine Field is on one of these frequencies. We need all of them to say what the
frequency sounded like. To say *who* was on it, see §6.

| Channel | Frequency | Hours | Why it matters at night | Source |
|---|---|---|---|---|
| CTAF (= Tower, RWY 16R/34L) | 132.95 | CTAF 21:00–07:00 | Where pilots announce their position. The main channel. | [AirNav KPAE](https://www.airnav.com/airport/KPAE), [FAA AIP](https://www.faa.gov/air_traffic/publications/atpubs/aip_html/part3_ad_2.0_washington.html) |
| Tower (RWY 16L/34R) | 120.2 | 07:00–21:00 | Silent after closing. Worth capturing across the handover at 21:00, when a pilot may still call the tower. | same |
| Ground | 121.8 | 07:00–21:00 | Same handover case. | same |
| ATIS | 128.65 | 24 h | Not a pilot channel. Useful as a timing anchor (§3.3). | same |
| UNICOM | 122.95 | — | Pilots sometimes call the wrong frequency. Low priority. | same |
| Seattle Approach (S46) | 128.5 | 24 h (S46 staffed 24/7) | Airliners and IFR traffic arriving at or leaving PAE at night are on this, not CTAF. | [FAA S46](https://www.faa.gov/about/office_org/headquarters_offices/ato/service_units/air_traffic_services/tracon/s46/sa_req) |
| Seattle Center (ZSE) low sector | *unverified*: 125.1 / 134.95 / 120.3 / 127.05 are candidates | 24 h | Takes the approach airspace if S46 or Whidbey combine sectors overnight. | [RadioReference ZSE](https://www.radioreference.com/db/aid/2235) |
| Whidbey Approach | 118.2 / 120.7 | *unverified*: may hand off to ZSE 125.1 overnight | Its airspace borders PAE's to the north. | [AirNav KNUW](https://www.airnav.com/airport/KNUW) |
| Emergency (guard) | 121.5 | 24 h | Monitored by Seattle Approach for PAE. Rarely matters, cheap to add. | FAA AIP |

**The one fact that shapes the rest:** a close approach at a dark tower often pairs an airliner on
approach control with a light aircraft on CTAF. The two pilots are on different frequencies and cannot
hear each other. If we can capture both channels and play them side by side over the replay, that is
the most direct way to show it. So approach control is not an extra. It is half of the evidence.

## 2. Candidate sources, in order of preference

| Source | Channels at PAE | Timing | Can we automate? | Can we publish? |
|---|---|---|---|---|
| **A. Our own receiver** (RTLSDR-Airband, NTP-synced) | Everything in §1 within range; 2 RTL dongles or one Airspy cover 120–135 MHz | One file per transmission, UTC to the second in the filename; sub-second with a small patch | Yes | Yes (our recording). Confirm with LiveATC if we also feed them. |
| **B. LiveATC archives** | `kpae` (Gnd/Twr), `kpae2` (Gnd/Twr/App). Seattle Approach on `ksea2_app_nw`, `ksea3_app_e`. No Puget Sound ZSE feed found. | 30-min MP3 blocks named by UTC start; true offset *unknown* | Personal, non-commercial use only; the site blocks scripts (Cloudflare 403) | No, not without written permission |
| **C. Broadcastify archives** | Feed [30515](https://www.broadcastify.com/listen/feed/30515): 120.2, 132.95, 121.8. Feeds 35890, 40435 and 45506 (approach and center) are offline for good. | 30-min blocks in *local* time | **No.** [Terms §9](https://www.broadcastify.com/terms/) (rev. 2026-07-22) forbid scripted access, bulk download, transcription and "correlation" without a commercial licence from bcfy.io | No |
| **D. OpenSky ATC / ATCO2** | *Unverified* whether any volunteer receiver covers PAE | Per transmission, already aligned with ADS-B | Research access only | Probably not |

**Change from #45:** #45 suggested using third-party archives (Option B) everywhere as internal
evidence. Broadcastify's July 2026 terms now forbid exactly that, including transcription, unless we
buy a licence. LiveATC's terms (read second-hand; the page blocks scripts) allow personal,
non-commercial listening only. So for anything automated, the plan is **our own receiver**. Third-party
archives are used only by hand, to prove the idea (Phase 0) and to measure timing.

## 3. Timing: how close is "accurate"

### 3.1 What accuracy buys

FlightAware reports in our fixture are a median **27 s** apart (p10 16 s, p90 30 s). The replay
interpolates between reports with a spline (`src/lib/spline.ts`). At 100 kt an aircraft covers about
50 m per second. So:

- **±1 s** of audio timing is about ±50 m, which is smaller than the interpolation error between
  reports. This is the target.
- **±5 s** is about ±250 m, the length of a turn from base to final. Still usable, but the map must
  show the uncertainty (§4.4).
- **±30 s** is a whole report interval and is not useful for positions. Show the transmission as a
  band on the timeline, not as a moment.

Each transmission stores its own `uncertaintyMs`, and the replay treats that number as the truth.

### 3.2 Our own receiver

RTLSDR-Airband with `split_on_transmission` names each file `<prefix>_YYYYMMDD_HHMMSS_<freq>.mp3` in
UTC. On a machine running chrony against pool NTP the clock is within a few ms. What remains:

- **Second truncation (0–1 s).** Patch the output name to include milliseconds, or log squelch-open
  times to a sidecar file. It is a small C change that could go upstream.
- **Squelch attack (~100–300 ms).** Constant per channel. Measure once and subtract.
- **Processing latency.** Negligible when writing locally; the timestamp is taken at squelch open.

Expected result: **±0.3 s**. That easily meets the target.

### 3.3 Archive blocks (Phase 0 and measurement only)

A block's filename states its nominal UTC start, but the feeder's scanner, encoder and upload
buffering add an unknown delay, likely several seconds, and it may drift. Split the block into
transmissions with `ffmpeg -af silencedetect`, then calibrate the offset against anchors:

1. **Takeoff calls against the takeoff roll.** "Paine traffic, Cessna 123, departing 34L" is spoken a
   few seconds before the ground-speed rise in ADS-B. It is noisy on its own, but a night with several
   departures gives a usable average.
2. **Cross-correlation with our own receiver.** Once §3.2 is running, record the same frequency on both
   and cross-correlate. This gives the archive's offset to milliseconds and shows how much it drifts,
   which tells us whether older archive nights can be trusted at all.
3. **ATIS repeat boundaries on 128.65.** Only works if a feed carries ATIS.

Store the measured offset and its spread per feed per night. Never assume the offset is zero.

## 4. Playback design

### 4.1 Data model

A new table `transmissions`, keyed by a stable id:

```
id            hash(source|channel|startMs)
airport       ICAO
channel       e.g. "CTAF 132.95", "Seattle Approach 128.5"
freqKhz       integer
source        "own-pae-1" | "liveatc:kpae2" | ...
startMs       UTC ms, after the offset correction
durationMs
uncertaintyMs from §3
file          path under DATA_DIR/audio/<ICAO>/<night>/
offsetMs      correction applied (audit trail)
transcript    nullable; filled in by #45 Phase 3
```

Incidents do **not** own clips. The loader asks for transmissions overlapping the replay window
(`replay.start`–`replay.end`, currently −3 min/+90 s around `incident.t`). Incidents are rebuilt
wholesale on every ingest (`replaceIncidents`), so linking by time survives a rebuild and a changed
detector. It also works for wake events.

Audio files go in `DATA_DIR/audio/…`, served by an endpoint modelled on the tile route
(`src/routes/tiles/[z]/[x]/[y].png/+server.ts`) with HTTP range support. Squelch-gated night audio is
a few MB per airport per night, so the Railway volume is enough for now; move to object storage only if
we keep whole blocks.

### 4.2 The clock during a transmission

Today `Replay.svelte` moves the clock `t` (epoch ms) forward in `tick()` as
`t + dt * speed`, with speeds 8/16/32 and a pause at the closest moment. Changes:

1. **A pure schedule in `src/lib/replay.ts`**, so it can be unit-tested:
   `audioSegments(transmissions, gapMs)` merges transmissions (on any channel) that are less than
   `gapMs` apart (about 3 s) into real-time segments. Without this, a quick exchange would jump between
   1x and 16x from word to word.
2. **Never skip the start of a segment.** At 32x one frame covers about 0.5 s of replay time, so a
   frame can step past a start. Clamp `next` to the segment start, the same way the code already stops
   on `incident.t`.
3. **Inside a segment the audio drives the clock.** Set
   `t = tx.startMs + audio.currentTime * 1000` instead of adding `dt`. The map then cannot drift from
   the sound, whether from frame jitter or buffering. Between transmissions within a merged segment,
   advance at 1x using `dt`.
4. **Overlapping transmissions on different channels** (the airliner on approach and the Cessna on
   CTAF at the same moment) play together, with a small left/right pan per channel. The earliest-started
   element drives the clock. This overlap is the headline case (§1), so it is not an edge case.
5. **Speed is restored** after the segment ends. The user's 8/16/32 choice is never changed, so the
   speed buttons still show it. The effective 1x only shows on a "real time" indicator next to the
   clock.
6. **Easing (optional, after the first version).** Ramp from 16x to 1x over the half-second before the
   start, so the map doesn't lurch. Clamp to the start exactly either way.
7. **The closest-moment pause** always waits for any transmission in progress to finish, so the audio
   is never cut off.

### 4.3 Controls

- **Scrubbing** into a segment seeks each playing element to `(t − startMs)/1000`. Scrubbing out of a
  segment stops the audio. `nudge(±15 s)` does the same.
- **Pause** pauses the audio. **Play** is the user gesture browsers require before audio can play, so
  `autoplay` replays start muted until someone clicks.
- **Radio on/off toggle.** When off, the replay behaves exactly as it does today, with no slow-down.
- **Timeline marks.** Each transmission is a short tick under the scrubber, one lane per channel, next
  to the existing pip for the closest moment (`.replay-marks`). Hovering a mark shows the channel and
  transcript.
- **Caption line** under the map showing the channel and the transcript segment in progress, using
  the #45 confidence display. It also works when the sound is off.

### 4.4 Showing the uncertainty on the map

While a transmission plays, draw a short track segment for each aircraft covering
`startMs ± uncertaintyMs`, so a ±5 s clip shows about 250 m of track, not a point. At ±1 s or less the
segment disappears under the glyph, which is correct. Above a threshold (say ±10 s) the transmission is
not tied to a position at all: no slow-down, and it shows as a band on the timeline with a caption such
as "time uncertain by ±N s".

### 4.5 Who sees it

Admin-only until #45's publishing questions are settled. Add `isAdmin(locals.user?.email)` to the
close-approach loader, following `src/routes/airports/+page.server.ts`, and return transmissions only to
admins. Public release means own-receiver audio only, with the "silence is not evidence" caption from
#45 in place from the first clip.

## 5. Phases

Each phase ends with a decision. Nothing in a later phase starts until the earlier gate is passed.

**Phase 0 — prove the source, by hand (a person with a browser; about 2 hours; $0).**
Pick a recent PAE close approach involving an airliner. From LiveATC, download the `kpae2` blocks and
the `ksea2_app_nw` / `ksea3_app_e` blocks covering the replay window, and listen:
1. Do the feeds stay up after 21:00?
2. Are *aircraft* on 132.95 audible, or only the tower when it was open? (This is #45's go/no-go.)
3. Is the airliner audible on 128.5, and is either controller audible?
4. Using the §3.3 anchors, roughly how far off is the block's filename time?
5. Note what `kpae2`'s "App" actually covers, and any ZSE frequency heard.
Record the answers on #45.
*Gate:* aircraft on CTAF audible → the idea works; continue. Inaudible → only our own receiver with
good siting can work, so Phase 1 is required, not optional.

**Phase 0b — pin down the frequencies (desk work plus one phone call).**
Confirm whether S46 combines sectors overnight onto 128.5 or another frequency, and which ZSE sector
works low altitude over Everett at night. Sources: the current FAA frequency list, a question to
Seattle TRACON's public affairs office, or simply a night of scanning with the Phase 1 receiver.

**Phase 0c — permissions (emails, in parallel with the rest).**
- LiveATC: feeding KPAE, loaner gear, whether we keep rights to our own local recording, and whether
  archive blocks may be used for one-off internal timing calibration.
- Broadcastify: ask bcfy.io for a commercial-licence quote, only if Phase 0 shows archive history is
  worth paying for.
- OpenSky ATC: whether any receiver covers PAE, and how research access works.

**Phase 1 — our own receiver at PAE (hardware; about $200 or LiveATC loaner gear).**
A site within about 10 NM of the field with a clear view of the runways and of the approach path from
the north and south. Raspberry Pi, two RTL-SDR dongles (or an Airspy Mini), an outdoor VHF antenna and
chrony. RTLSDR-Airband records the §1 channels in multichannel mode, one file per transmission
(millisecond patch from §3.2). Optionally feed LiveATC as well. Upload to the app through an
authenticated `POST /api/audio` (per-receiver token in `CONFIG_JSON`), or rsync to the volume.
*Gate:* one week of nights in which pattern traffic we know about from the tracks shows up as
transmissions at the right times.

**Phase 2 — ingest and data model (code).**
The `transmissions` table, a cache-first import step alongside `ingestNight`, and a separate pass in
`catchUp()`, because nights already marked complete are skipped today. Also admin import of hand-cut
archive clips with a manually entered offset, so Phase 0 material can be viewed. Unit tests: segment
merging, offset application, window overlap query. Fixture: a few seconds of synthetic tone clips
against the existing KPAE fixture night.

**Phase 3 — synchronized playback (code, admin-only).**
Everything in §4. Unit tests for `audioSegments` and the clock mapping (pure functions). An e2e test
with a short silent audio fixture checks that `data-t` on `replay-time` advances at about 1x while a
segment plays and fast otherwise.
*Gate:* Mike watches five real incidents and agrees the positions look right at the moment of each
transmission.

**Phase 4 — transcripts and publishing.** As in #45 Phases 3–4.

**Later — other airports.** RNT, BLI and MRY have LiveATC feeds, but the same terms apply. Each needs
its own receiver or partner feeder before anything is automated. BUR, as the reference airport with a
staffed tower, is the audio control once there is a receiver in range.

## 6. Who was on which frequency

ADS-B does not say what frequency an aircraft was tuned to, so a transmission is tied to an aircraft
only by what is said. Until transcripts exist (#45 Phase 3), the replay shows *all* transmissions on
all captured channels in the window and does not guess a speaker. The callsign-matched transcript then
marks segments as spoken by aircraft A, aircraft B, a controller or other traffic. That is also when
"airliner on approach, Cessna on CTAF" becomes a stated finding, not something the viewer infers.

## 7. Open questions for Mike

1. **Receiver siting.** Is there a rooftop within about 10 NM of PAE we can use (yours, Kevin's, a
   friendly hangar)? This matters more than any code decision.
2. **Broadcastify licence.** Would you pay for a commercial licence to reach up to a year of feed 30515
   history (tower, CTAF and ground only; no approach)? Or accept that the audio record starts the night
   our receiver comes online?
3. **Approach audio.** OK to capture controller audio on 128.5 as well as CTAF? It raises no new legal
   issue, but it is a second voice that could be published.
4. **Admin-only first.** Keep playback admin-only through Phase 3 as proposed?
