/* Sample dataset for the no-tower operations tracker.
   Operations counts and the flight list come from a FlightAware AeroAPI pull
   for KPAE, nights of Aug 12-18 2026, 21:00-07:00 local (tower closed).
   Track geometry here is reconstructed for the prototype. */
(function () {
  const R = 3440.065; // earth radius, NM
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  function dest(lat, lon, brg, nm) {
    const d = nm / R, b = rad(brg), p1 = rad(lat), l1 = rad(lon);
    const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(b));
    const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return [deg(p2), deg(l2)];
  }
  function nmBetween(a, b) {
    const p1 = rad(a[0]), p2 = rad(b[0]), dp = rad(b[0] - a[0]), dl = rad(b[1] - a[1]);
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function seeded(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
  }

  const FIELD = [47.9079, -122.2816];
  const RWY = 163; // 16R/34L centerline

  // Build a plausible track: arrivals fly an approach to the active runway,
  // departures climb out, GA pattern work loops the field.
  function makeTrack(f) {
    const rnd = seeded(f.ident + f.time);
    const airline = f.cat !== 'GA';
    const pts = [];
    const pattern = f.from === 'PAE' && f.cat === 'GA';
    const finalBrg = RWY - 180; // aircraft inbound from the north on 16R
    if (pattern) {
      const side = rnd() > 0.5 ? 1 : -1;
      const legs = [
        dest(...FIELD, RWY, 0.8), dest(...FIELD, RWY + side * 55, 1.5),
        dest(...FIELD, RWY + side * 100, 1.7), dest(...FIELD, RWY + side * 140, 1.5),
        dest(...FIELD, RWY - 180, 1.6), dest(...FIELD, RWY - 180 - side * 30, 1.2),
        dest(...FIELD, RWY - 180, 0.7), FIELD
      ];
      legs.forEach((p, i) => pts.push([p[0], p[1], 400 + i * 120]));
      return densify(pts, rnd);
    }
    const outBrg = f.dir === 'arrival'
      ? [345, 20, 300, 190, 150][Math.floor(rnd() * 5)]
      : [340, 170, 250, 30, 110][Math.floor(rnd() * 5)];
    const far = airline ? 11 : 9.5;
    if (f.dir === 'arrival') {
      pts.push([...dest(...FIELD, outBrg, far), airline ? 5200 : 3400]);
      pts.push([...dest(...FIELD, outBrg, far * 0.7), airline ? 4200 : 2900]);
      pts.push([...dest(...FIELD, (outBrg + finalBrg) / 2 + (rnd() - 0.5) * 20, far * 0.45), airline ? 3000 : 2200]);
      pts.push([...dest(...FIELD, finalBrg, 5.5), 1900]);
      pts.push([...dest(...FIELD, finalBrg, 3), 1100]);
      pts.push([...dest(...FIELD, finalBrg, 1.2), 500]);
      pts.push([FIELD[0], FIELD[1], 0]);
    } else {
      pts.push([FIELD[0], FIELD[1], 0]);
      pts.push([...dest(...FIELD, RWY, 1.2), 600]);
      pts.push([...dest(...FIELD, RWY + (rnd() - 0.5) * 30, 2.6), 1600]);
      pts.push([...dest(...FIELD, (RWY + outBrg) / 2, 5), 3000]);
      pts.push([...dest(...FIELD, outBrg, 8), airline ? 5000 : 3800]);
      pts.push([...dest(...FIELD, outBrg, far), airline ? 7000 : 4600]);
    }
    return densify(pts, rnd);
  }
  function densify(pts, rnd) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      for (let t = 0; t < 1; t += 0.1) {
        const j = (rnd() - 0.5) * 0.0016;
        out.push([a[0] + (b[0] - a[0]) * t + j, a[1] + (b[1] - a[1]) * t + j, Math.round(a[2] + (b[2] - a[2]) * t)]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  const A = (t, op, ident, tail, type, other, dir) =>
    ({ time: t, cat: op, ident, tail, type, from: other, dir });

  const nights = [
    {
      date: '2026-08-12', label: 'Wednesday, August 12', arrivals: 14, departures: 11, positions: 733,
      flights: [
        A('21:00', 'GA', 'N1968Z', 'N1968Z', 'C150', 'Arlington Muni (AWO)', 'departure'),
        A('21:03', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('21:08', 'GA', 'N433LF', 'N433LF', '—', 'Whidbey General Hospital', 'departure'),
        A('21:08', 'GA', 'LF36', 'LF36', '—', 'Delaurentis (ODW)', 'departure'),
        A('21:22', 'GA', 'N2985J', 'N2985J', 'C150', 'Boeing Field (BFI)', 'arrival'),
        A('21:27', 'GA', 'N2939J', 'N2939J', 'P28A', 'Snohomish County (PAE)', 'departure'),
        A('21:43', 'GA', 'N2939J', 'N2939J', 'P28A', 'Snohomish County (PAE)', 'arrival'),
        A('21:46', 'GA', 'N2791J', 'N2791J', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('22:00', 'Horizon Air', 'QXE2116', 'N623QX', 'E75L', 'John Wayne (SNA)', 'arrival'),
        A('22:02', 'GA', 'N1968Z', 'N1968Z', 'C150', 'Arlington Muni (AWO)', 'arrival'),
        A('22:04', 'GA', 'N2985J', 'N2985J', 'C150', 'Boeing Field (BFI)', 'departure'),
        A('22:06', 'GA', 'N1968Z', 'N1968Z', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('22:11', 'GA', 'N1968Z', 'N1968Z', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('22:19', 'GA', 'N2791J', 'N2791J', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('22:24', 'Horizon Air', 'QXE2189', 'N641QX', 'E75L', 'San Diego Intl (SAN)', 'arrival'),
        A('22:31', 'GA', 'N5298D', 'N5298D', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('22:40', 'Airline', 'ASA1712', 'N530AS', 'B738', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('22:48', 'GA', 'N5298D', 'N5298D', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('22:55', 'Horizon Air', 'QXE2083', 'N632QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('23:04', 'GA', 'N456LF', 'N456LF', 'C182', 'Bremerton Ntl (PWT)', 'arrival'),
        A('23:18', 'GA', 'N9246K', 'N9246K', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('23:26', 'GA', 'N9246K', 'N9246K', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('05:12', 'GA', 'PKW917', 'N917PK', 'BE20', 'Boeing Field (BFI)', 'departure'),
        A('06:02', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:41', 'GA', 'N182RH', 'N182RH', 'C182', 'Arlington Muni (AWO)', 'arrival')
      ]
    },
    {
      date: '2026-08-13', label: 'Thursday, August 13', arrivals: 7, departures: 5, positions: 484,
      flights: [
        A('21:00', 'GA', 'N2939J', 'N2939J', 'P28A', 'Snohomish County (PAE)', 'arrival'),
        A('21:34', 'GA', 'N11571', 'N11571', 'C150', 'Boeing Field (BFI)', 'departure'),
        A('22:03', 'GA', 'RFS734', 'N928ZA', 'C162', 'Snohomish County (PAE)', 'departure'),
        A('22:04', 'Horizon Air', 'QXE2116', 'N622QX', 'E75L', 'John Wayne (SNA)', 'arrival'),
        A('22:21', 'GA', 'RFS734', 'N928ZA', 'C162', 'Snohomish County (PAE)', 'arrival'),
        A('22:38', 'Horizon Air', 'QXE2083', 'N637QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('22:52', 'Airline', 'ASA366', 'N265AK', 'B739', 'Harry Reid Intl (LAS)', 'arrival'),
        A('23:10', 'GA', 'N67JB', 'N67JB', 'C550', 'Tri-Cities (PSC)', 'departure'),
        A('23:44', 'GA', 'N23133', 'N23133', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('05:48', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:12', 'GA', 'N201CB', 'N201CB', 'PA46', 'Bellingham Intl (BLI)', 'departure'),
        A('06:50', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival')
      ]
    },
    {
      date: '2026-08-14', label: 'Friday, August 14', arrivals: 6, departures: 3, positions: 357,
      flights: [
        A('21:18', 'Airline', 'SWA8513', 'N8540V', 'B738', "Oakland Intl (OAK)", 'arrival'),
        A('21:22', 'GA', 'N2791J', 'N2791J', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('21:40', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('22:07', 'Horizon Air', 'QXE2189', 'N644QX', 'E75L', 'San Diego Intl (SAN)', 'arrival'),
        A('22:33', 'Horizon Air', 'QXE2083', 'N632QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('22:58', 'GA', 'N456LF', 'N456LF', 'C182', 'Snohomish County (PAE)', 'departure'),
        A('23:26', 'GA', 'N5298D', 'N5298D', 'C172', 'Boeing Field (BFI)', 'arrival'),
        A('05:55', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:38', 'GA', 'N9246K', 'N9246K', 'C172', 'Arlington Muni (AWO)', 'arrival')
      ]
    },
    {
      date: '2026-08-15', label: 'Saturday, August 15', arrivals: 8, departures: 5, positions: 397,
      flights: [
        A('21:00', 'GA', 'RFS711', 'N369DA', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('21:29', 'GA', 'N23133', 'N23133', 'C150', 'Bremerton Ntl (PWT)', 'arrival'),
        A('21:47', 'Horizon Air', 'QXE2116', 'N645QX', 'E75L', 'John Wayne (SNA)', 'arrival'),
        A('22:04', 'GA', 'RFS711', 'N369DA', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('22:16', 'Airline', 'ASA1712', 'N530AS', 'B738', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('22:31', 'GA', 'N2985J', 'N2985J', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('22:35', 'GA', 'N2985J', 'N2985J', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('22:44', 'Horizon Air', 'QXE2083', 'N636QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('23:02', 'GA', 'N67JB', 'N67JB', 'C550', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('23:19', 'GA', 'N1968Z', 'N1968Z', 'C150', 'Arlington Muni (AWO)', 'departure'),
        A('23:51', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('06:04', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:44', 'GA', 'N182RH', 'N182RH', 'C182', 'Boeing Field (BFI)', 'arrival')
      ]
    },
    {
      date: '2026-08-16', label: 'Sunday, August 16', arrivals: 10, departures: 4, positions: 366,
      flights: [
        A('21:00', 'GA', 'N201CB', 'N201CB', 'PA46', 'Snohomish County (PAE)', 'arrival'),
        A('21:26', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('21:33', 'Horizon Air', 'QXE2189', 'N641QX', 'E75L', 'San Diego Intl (SAN)', 'arrival'),
        A('21:52', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('22:09', 'Airline', 'ASA366', 'N266AK', 'B739', 'Harry Reid Intl (LAS)', 'arrival'),
        A('22:24', 'GA', 'N2939J', 'N2939J', 'P28A', 'Arlington Muni (AWO)', 'departure'),
        A('22:47', 'Horizon Air', 'QXE2083', 'N632QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('22:49', 'GA', 'N201CB', 'N201CB', 'PA46', 'Snohomish County (PAE)', 'departure'),
        A('23:05', 'GA', 'N23133', 'N23133', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('23:22', 'GA', 'N456LF', 'N456LF', 'C182', 'Bremerton Ntl (PWT)', 'arrival'),
        A('23:44', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('00:12', 'GA', 'N67JB', 'N67JB', 'C550', 'Tri-Cities (PSC)', 'arrival'),
        A('05:51', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:36', 'GA', 'N9246K', 'N9246K', 'C172', 'Snohomish County (PAE)', 'arrival')
      ]
    },
    {
      date: '2026-08-17', label: 'Monday, August 17', arrivals: 12, departures: 4, positions: 475,
      flights: [
        A('21:00', 'GA', 'N9246K', 'N9246K', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('21:00', 'GA', 'N182RH', 'N182RH', 'C182', 'Snohomish County (PAE)', 'arrival'),
        A('21:00', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'departure'),
        A('21:04', 'Airline', 'ASA1712', 'N530AS', 'B738', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('21:19', 'GA', 'N11571', 'N11571', 'C150', 'Snohomish County (PAE)', 'arrival'),
        A('21:35', 'Horizon Air', 'QXE2116', 'N623QX', 'E75L', 'John Wayne (SNA)', 'arrival'),
        A('21:48', 'GA', 'N2791J', 'N2791J', 'C150', 'Boeing Field (BFI)', 'departure'),
        A('22:03', 'GA', 'RFS612', 'N52030', 'C162', 'Snohomish County (PAE)', 'arrival'),
        A('22:17', 'Horizon Air', 'QXE2189', 'N644QX', 'E75L', 'San Diego Intl (SAN)', 'arrival'),
        A('22:30', 'GA', 'N5298D', 'N5298D', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('22:41', 'Horizon Air', 'QXE2083', 'N637QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('22:58', 'GA', 'N23133', 'N23133', 'C150', 'Bremerton Ntl (PWT)', 'arrival'),
        A('23:15', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('23:31', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('05:58', 'Alpine Air Express', 'AIP112', 'N112AE', 'C208', 'Yakima Air Terminal (YKM)', 'departure'),
        A('06:40', 'GA', 'N201CB', 'N201CB', 'PA46', 'Bellingham Intl (BLI)', 'arrival')
      ]
    },
    {
      date: '2026-08-18', label: 'Tuesday, August 18', arrivals: 11, departures: 4, positions: 840,
      flights: [
        A('21:34', 'Horizon Air', 'QXE2189', 'N641QX', 'E75L', 'San Diego Intl (SAN)', 'arrival'),
        A('21:41', 'Airline', 'ASA1712', 'N530AS', 'B738', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('21:50', 'Horizon Air', 'QXE2116', 'N645QX', 'E75L', 'John Wayne (SNA)', 'arrival'),
        A('21:56', 'GA', 'N67JB', 'N67JB', 'C550', 'Phoenix Sky Harbor Intl (PHX)', 'arrival'),
        A('21:57', 'GA', 'RFS612', 'N52030', 'C162', 'Snohomish County (PAE)', 'arrival'),
        A('22:02', 'Airline', 'ASA366', 'N266AK', 'B739', 'Harry Reid Intl (LAS)', 'arrival'),
        A('22:25', 'Horizon Air', 'QXE2083', 'N632QX', 'E75L', "San Francisco Int'l (SFO)", 'arrival'),
        A('22:38', 'GA', 'N67JB', 'N67JB', 'C550', 'Tri-Cities (PSC)', 'departure'),
        A('22:51', 'GA', 'N23133', 'N23133', 'C150', 'Bremerton Ntl (PWT)', 'arrival'),
        A('23:27', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('23:32', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('23:33', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('23:38', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival'),
        A('23:40', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'departure'),
        A('23:45', 'GA', 'N738BU', 'N738BU', 'C172', 'Snohomish County (PAE)', 'arrival')
      ]
    }
  ];

  nights.forEach((n) => {
    n.flights.forEach((f) => {
      f.id = f.ident + '-' + n.date + '-' + f.time.replace(':', '');
      f.night = n.date;
      f.track = makeTrack(f);
    });
    n.airlineOps = n.flights.filter((f) => f.cat !== 'GA').length;
    n.gaOps = n.flights.length - n.airlineOps;
    n.total = n.flights.length;
  });

  const findFlight = (night, ident, time) =>
    nights.find((n) => n.date === night).flights.find((f) => f.ident === ident && f.time === time);

  const incidents = [
    {
      id: 'PAE-2026-0814-01', night: '2026-08-14', time: '21:22:47',
      lateral: 1.4, vertical: 600, alt: [2900, 2300], dist: 6.2,
      a: { ident: 'SWA8513', tail: 'N8540V', type: 'B738', cat: 'Airline', time: '21:18' },
      b: { ident: 'N2791J', tail: 'N2791J', type: 'C150', cat: 'GA', time: '21:22' },
      note: 'A Boeing 737-800 lining up to land converged with a small Cessna 150 circling the airport for practice landings. The jet was in radio contact with regional controllers; the Cessna was announcing itself on the shared local channel. Nobody was putting the two in order.'
    },
    {
      id: 'PAE-2026-0816-01', night: '2026-08-16', time: '22:47:12',
      lateral: 2.1, vertical: 400, alt: [2400, 2000], dist: 7.8,
      a: { ident: 'QXE2083', tail: 'N632QX', type: 'E75L', cat: 'Horizon Air', time: '22:47' },
      b: { ident: 'N201CB', tail: 'N201CB', type: 'PA46', cat: 'GA', time: '22:49' },
      note: 'An Embraer 175 on its final approach passed 2.1 nautical miles to the side of, and 400 feet above, a Piper Malibu climbing out to the north.'
    },
    {
      id: 'PAE-2026-0817-01', night: '2026-08-17', time: '21:04:38',
      lateral: 2.6, vertical: 900, alt: [3100, 2200], dist: 8.9,
      a: { ident: 'ASA1712', tail: 'N530AS', type: 'B738', cat: 'Airline', time: '21:04' },
      b: { ident: 'N182RH', tail: 'N182RH', type: 'C182', cat: 'GA', time: '21:00' },
      note: 'Four minutes after the tower closed, an arriving 737-800 and a Cessna 182 flying north of the airport closed to 2.6 nautical miles apart, with 900 feet of vertical separation.'
    },
    {
      id: 'PAE-2026-0818-01', night: '2026-08-18', time: '21:57:51',
      lateral: 0.9, vertical: 300, alt: [1500, 1200], dist: 3.4,
      a: { ident: 'ASA366', tail: 'N266AK', type: 'B739', cat: 'Airline', time: '22:02' },
      b: { ident: 'RFS612', tail: 'N52030', type: 'C162', cat: 'GA', time: '21:57' },
      note: 'The closest event in the sample week. A Boeing 737-900 three and a half miles from the runway overtook a Cessna 162 on the same approach path, closing to 0.9 nautical miles apart with 300 feet of vertical separation.'
    }
  ];

  incidents.forEach((inc) => {
    inc.night_label = nights.find((n) => n.date === inc.night).label;
    inc.trackA = findFlight(inc.night, inc.a.ident, inc.a.time)?.track || [];
    inc.trackB = findFlight(inc.night, inc.b.ident, inc.b.time)?.track || [];
    inc.severity = inc.lateral < 1.5 || inc.vertical < 500 ? 'severe' : 'below minima';
  });

  nights.forEach((n) => { n.incidents = incidents.filter((i) => i.night === n.date).length; });

  const airports = [
    { code: 'PAE', icao: 'KPAE', name: 'Snohomish County (Paine Field)', city: 'Everett, WA', pos: [47.9079, -122.2816], status: 'tracking', towerHours: '07:00–21:00', carriers: 'Alaska, Horizon', stats: { ops: 104, airline: 31, incidents: 4 }, dy: 12 },
    { code: 'BLI', icao: 'KBLI', name: 'Bellingham International', city: 'Bellingham, WA', pos: [48.7929, -122.5375], status: 'tracking', towerHours: '06:00–22:00', carriers: 'Allegiant, Alaska', stats: { ops: 61, airline: 14, incidents: 2 }, dy: -12 },
    { code: 'RDM', icao: 'KRDM', name: 'Roberts Field', city: 'Redmond, OR', pos: [44.2541, -121.1500], status: 'tracking', towerHours: '06:00–22:00', carriers: 'Alaska, United, Delta', stats: { ops: 143, airline: 38, incidents: 6 } },
    { code: 'SUN', icao: 'KSUN', name: 'Friedman Memorial', city: 'Hailey, ID', pos: [43.5044, -114.2961], status: 'tracking', towerHours: '07:00–21:00', carriers: 'Alaska, Delta, United', stats: { ops: 88, airline: 22, incidents: 3 } },
    { code: 'MMH', icao: 'KMMH', name: 'Mammoth Yosemite', city: 'Mammoth Lakes, CA', pos: [37.6241, -118.8377], status: 'requested', towerHours: 'seasonal', carriers: 'Alaska, United' },
    { code: 'HYA', icao: 'KHYA', name: 'Barnstable Municipal', city: 'Hyannis, MA', pos: [41.6693, -70.2804], status: 'tracking', towerHours: '06:00–22:00', carriers: 'Cape Air, JetBlue', stats: { ops: 96, airline: 27, incidents: 1 } },
    { code: 'EKO', icao: 'KEKO', name: 'Elko Regional', city: 'Elko, NV', pos: [40.8249, -115.7917], status: 'requested', towerHours: '06:00–20:00', carriers: 'SkyWest' },
    { code: 'HIB', icao: 'KHIB', name: 'Range Regional', city: 'Hibbing, MN', pos: [47.3866, -92.8390], status: 'requested', towerHours: 'no tower', carriers: 'Delta Connection' },
    { code: 'PIH', icao: 'KPIH', name: 'Pocatello Regional', city: 'Pocatello, ID', pos: [42.9098, -112.5958], status: 'tracking', towerHours: '06:00–20:00', carriers: 'SkyWest', stats: { ops: 47, airline: 12, incidents: 0 } },
    { code: 'OTH', icao: 'KOTH', name: 'Southwest Oregon Regional', city: 'North Bend, OR', pos: [43.4171, -124.2460], status: 'requested', towerHours: 'no tower', carriers: 'Advanced Air' },
    { code: 'CKB', icao: 'KCKB', name: 'North Central West Virginia', city: 'Clarksburg, WV', pos: [39.2966, -80.2281], status: 'requested', towerHours: '07:00–19:00', carriers: 'SkyWest' },
    { code: 'DDC', icao: 'KDDC', name: 'Dodge City Regional', city: 'Dodge City, KS', pos: [37.7634, -99.9656], status: 'requested', towerHours: 'no tower', carriers: 'SkyWest' }
  ];

  window.PAE = {
    field: FIELD, radiusNm: 10, nights, incidents, airports, nmBetween, dest,
    totals: {
      ops: nights.reduce((s, n) => s + n.total, 0),
      airline: nights.reduce((s, n) => s + n.airlineOps, 0),
      ga: nights.reduce((s, n) => s + n.gaOps, 0),
      positions: nights.reduce((s, n) => s + n.positions, 0),
      incidents: incidents.length
    },
    /* Rolling 30-day totals for KPAE. The seven nights above carry full track
       detail; the remaining nights contribute counts only. */
    thirty: { ops: 104, airline: 31, ga: 73, incidents: 4, positions: 4820, days: 30 }
  };
})();
