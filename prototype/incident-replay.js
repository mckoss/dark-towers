/* <incident-replay> — animated replay of a close approach.
   Attributes: incident="PAE-2026-0818-01"  height="520"
   Reads window.PAE. Each aircraft flies its own path at its own constant speed on
   one shared clock; the second aircraft's start time is chosen so the moment of
   minimum separation reproduces the recorded lateral/vertical figures. */
(function () {
  const INK = '#201e1d';
  const RED = '#ec3013';
  const FRAMES = 300;

  const SHAPES = {
    // top-down schematic outlines, nose pointing up, 40x40 box
    light:
      '<path d="M20 3c1.1 0 1.9 1.2 2 3.2l.2 5.3 15.3 3.4c.6.1 1 .6 1 1.2v1.5c0 .4-.4.7-.8.6L22.4 15l.3 9.6 4.6 1.9c.4.2.7.6.7 1v1.2c0 .4-.4.7-.8.6L20.6 27h-1.2l-6.6 2.3c-.4.1-.8-.2-.8-.6v-1.2c0-.4.3-.8.7-1l4.6-1.9.3-9.6L2.3 18.2c-.4.1-.8-.2-.8-.6V16c0-.6.4-1.1 1-1.2l15.3-3.4.2-5.3C18.1 4.2 18.9 3 20 3z"/>',
    bizjet:
      '<path d="M20 2c1.5 0 2.6 1.8 2.8 4.6l.5 8.2 13.4 8.6c.5.3.8.9.8 1.5v2.3c0 .5-.5.8-.9.6l-13.4-5.6.4 6.8 4.3 3c.4.3.6.7.6 1.2v1.4c0 .5-.5.8-.9.6L20 33l-7.6 2.2c-.4.1-.9-.2-.9-.6v-1.4c0-.5.2-.9.6-1.2l4.3-3 .4-6.8L3.4 27.8c-.4.2-.9-.1-.9-.6v-2.3c0-.6.3-1.2.8-1.5l13.4-8.6.5-8.2C17.4 3.8 18.5 2 20 2z"/>',
    airliner:
      '<path d="M20 1.5c1.7 0 3 2.1 3.2 5.4l.5 9.1 14.6 9.4c.5.3.9 1 .9 1.6v2.6c0 .5-.5.9-1 .7l-15-6 .4 7.2 4.7 3.3c.4.3.7.8.7 1.3v1.6c0 .5-.5.9-1 .7L20 36.4l-7.9 2.2c-.5.1-1-.2-1-.7v-1.6c0-.5.3-1 .7-1.3l4.7-3.3.4-7.2-15 6c-.5.2-1-.2-1-.7v-2.6c0-.6.4-1.3.9-1.6l14.6-9.4.5-9.1C17 3.6 18.3 1.5 20 1.5z"/>'
  };

  function silhouette(type, cat) {
    const t = (type || '').toUpperCase();
    if (cat && cat !== 'GA') return 'airliner';
    if (/^(B7|A3|E7|E1|CRJ|DH8|AT7|MD)/.test(t)) return 'airliner';
    if (/^(C5|C6|C7|LJ|CL|GLF|G[1-6]|E5|H25|BE4|PA46|TBM|SF5)/.test(t)) return 'bizjet';
    return 'light';
  }

  function ensureAnim() {
    if (document.querySelector('style[data-replay-anim]')) return;
    const st = document.createElement('style');
    st.setAttribute('data-replay-anim', '');
    st.textContent =
      '@keyframes dtw-alert{0%,100%{opacity:1;filter:none}50%{opacity:0.25;filter:drop-shadow(0 0 6px ' + RED + ')}}' +
      '@keyframes dtw-ring{0%{transform:translate(-50%,-50%) scale(0.6);opacity:0.85}100%{transform:translate(-50%,-50%) scale(2.1);opacity:0}}';
    document.head.appendChild(st);
  }

  let loading = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet]')) {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        l.setAttribute('data-leaflet', '');
        l.integrity = 'sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H';
        l.crossOrigin = 'anonymous';
        document.head.appendChild(l);
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      s.integrity = 'sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH';
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(window.L);
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return loading;
  }

  const nmBetween = (a, b) => window.PAE.nmBetween([a[0], a[1]], [b[0], b[1]]);

  /* A flight path parameterised by along-track distance, flown at constant speed. */
  function makePath(track, knots) {
    const pts = (track || []).filter((p) => p && p.length >= 2);
    if (pts.length < 2) return null;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + nmBetween(pts[i - 1], pts[i]));
    const total = cum[cum.length - 1];
    return {
      pts, cum, total,
      duration: (total / knots) * 3600, // seconds
      at(d) {
        if (d <= 0) return pts[0];
        if (d >= total) return pts[pts.length - 1];
        let i = 1;
        while (i < cum.length - 1 && cum[i] < d) i++;
        const f = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-9);
        const a = pts[i - 1], b = pts[i];
        return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f,
                (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * f];
      },
      // position at a wall-clock second, given a start time; null before it launches
      posAt(t, start) {
        if (t < start) return null;
        return this.at(((t - start) / 3600) * knots);
      },
      lastAt(t, start) { return this.posAt(Math.max(t, start), start); }
    };
  }

  class IncidentReplay extends HTMLElement {
    static get observedAttributes() { return ['incident']; }

    connectedCallback() {
      if (this._built) { this.build(); return; }
      this._built = true;
      ensureAnim();
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.innerHTML = '';

      this._mapHost = document.createElement('div');
      this._mapHost.style.cssText =
        'position:relative;width:100%;height:' + (this.getAttribute('height') || '520') + 'px;background:#e8e6e5;';
      this.appendChild(this._mapHost);

      this._bar = document.createElement('div');
      const narrow = this.clientWidth && this.clientWidth < 480;
      this._bar.style.cssText =
        'display:flex;align-items:center;gap:' + (narrow ? '10px' : '16px') + ';padding:' +
        (narrow ? '10px 12px' : '14px 20px') + ';border-top:2px solid ' + INK +
        ';font-family:Archivo,sans-serif;background:#f3f2f2;flex-wrap:wrap;';
      this.appendChild(this._bar);
      this.buildControls();

      loadLeaflet().then(() => this.build()).catch(() => {
        this._mapHost.innerHTML =
          '<div style="padding:16px;font:400 13px/1.5 Archivo,sans-serif;color:#605d5d">Replay unavailable — no network.</div>';
      });
    }
    attributeChangedCallback() { if (this._map) this.build(); }
    disconnectedCallback() { this.stop(); }

    buildControls() {
      const b = this._bar;
      this._play = document.createElement('button');
      this._play.textContent = 'Play replay';
      this._play.style.cssText =
        'padding:11px 18px;background:' + RED + ';color:#fff;border:none;cursor:pointer;font-family:inherit;' +
        'font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;text-align:left;';
      this._play.addEventListener('click', () => (this._timer ? this.stop() : this.start()));
      b.appendChild(this._play);

      this._scrub = document.createElement('input');
      this._scrub.type = 'range';
      this._scrub.min = '0';
      this._scrub.max = String(FRAMES - 1);
      this._scrub.value = '0';
      this._scrub.style.cssText = 'flex:1;min-width:180px;accent-color:' + RED + ';cursor:pointer;';
      this._scrub.addEventListener('input', () => { this.stop(); this.frame(Number(this._scrub.value)); });
      b.appendChild(this._scrub);

      this._speedWrap = document.createElement('div');
      this._speedWrap.style.cssText = 'display:flex;border:2px solid ' + INK + ';';
      this._speed = 8;
      [4, 8, 16].forEach((mult, i) => {
        const btn = document.createElement('button');
        btn.textContent = mult + '×';
        btn.dataset.mult = String(mult);
        btn.style.cssText =
          'padding:9px 13px;border:none;' + (i ? 'border-left:2px solid ' + INK + ';' : '') +
          'cursor:pointer;font-family:inherit;font-size:12px;font-weight:700;letter-spacing:0.04em;';
        btn.addEventListener('click', () => { this._speed = mult; this.paintSpeed(); });
        this._speedWrap.appendChild(btn);
      });
      b.appendChild(this._speedWrap);
      this.paintSpeed();

      this._readout = document.createElement('div');
      this._readout.style.cssText = 'display:flex;align-items:baseline;gap:18px;margin-left:auto;';
      b.appendChild(this._readout);
    }

    paintSpeed() {
      Array.from(this._speedWrap.children).forEach((btn) => {
        const on = Number(btn.dataset.mult) === this._speed;
        btn.style.background = on ? INK : 'transparent';
        btn.style.color = on ? '#f3f2f2' : INK;
      });
    }

    /* Anchor both aircraft to the record: find where on each path the aircraft was
       at the moment of the close approach (distance from the field and altitude),
       then derive the launch times from those along-track positions. */
    anchor(path, field, wantDist, wantAlt) {
      let best = null;
      for (let d = 0; d <= path.total; d += Math.max(path.total / 400, 0.01)) {
        const p = path.at(d);
        const fromField = nmBetween(p, field);
        const score = Math.abs(fromField - wantDist) + Math.abs((p[2] || 0) - wantAlt) / 700;
        if (!best || score < best.score) best = { d, score, fromField, alt: p[2] || 0 };
      }
      return best || { d: path.total / 2 };
    }

    solveTiming(A, B, inc, field) {
      const aAnchor = this.anchor(A, field, inc.dist, inc.alt[0]);
      const bAnchor = this.anchor(B, field, inc.dist, inc.alt[1]);
      const tA = (aAnchor.d / A.total) * A.duration;
      const tB = (bAnchor.d / B.total) * B.duration;
      return { off: tA - tB, minT: tA };
    }

    /* Rigidly shift aircraft B's path, and both altitude profiles, so that at the
       recorded moment the pair is exactly inc.lateral apart, inc.vertical apart,
       inc.dist from the field, at the recorded altitudes. */
    fitToRecord(A, B, inc, field, knots) {
      const dA = this.anchor(A, field, inc.dist, inc.alt[0]).d;
      const dB = this.anchor(B, field, inc.dist, inc.alt[1]).d;
      const pA = A.at(dA), pB = B.at(dB);
      const kLat = 60, kLon = 60 * Math.cos(pA[0] * Math.PI / 180);

      // A's course at that moment, in a local NM plane
      const ahead = A.at(Math.min(dA + 0.1, A.total));
      let vx = (ahead[1] - pA[1]) * kLon, vy = (ahead[0] - pA[0]) * kLat;
      const vlen = Math.hypot(vx, vy) || 1;
      vx /= vlen; vy /= vlen;
      // put B abeam of A, offset by the recorded lateral distance, on the side it
      // already lies (so the geometry stays close to the reconstructed paths)
      const relX = (pB[1] - pA[1]) * kLon, relY = (pB[0] - pA[0]) * kLat;
      const side = (-vy * relX + vx * relY) >= 0 ? 1 : -1;
      const perp = [-vy * side, vx * side];
      const wantX = perp[0] * inc.lateral, wantY = perp[1] * inc.lateral;
      const dLon = (wantX - relX) / kLon, dLat = (wantY - relY) / kLat;

      const altA = inc.alt[0] - (pA[2] || 0);
      const altB = inc.alt[1] - (pB[2] || 0);
      const shiftedA = A.pts.map((p) => [p[0], p[1], (p[2] || 0) + altA]);
      const shiftedB = B.pts.map((p) => [p[0] + dLat, p[1] + dLon, (p[2] || 0) + altB]);

      const PA = makePath(shiftedA, knots(inc.a.cat));
      const PB = makePath(shiftedB, knots(inc.b.cat));
      const tA = (dA / PA.total) * PA.duration;
      const tB = (dB / PB.total) * PB.duration;
      return { A: PA, B: PB, offB: tA - tB, minT: tA };
    }

    build() {
      const D = window.PAE;
      const L = window.L;
      if (!D || !L) return;
      const inc = D.incidents.find((x) => x.id === this.getAttribute('incident')) || D.incidents[0];
      if (!inc) return;
      this._inc = inc;

      const knots = (cat) => (cat && cat !== 'GA' ? 170 : 95);
      const A = makePath(inc.trackA, knots(inc.a.cat));
      const B = makePath(inc.trackB, knots(inc.b.cat));
      if (!A || !B) return;
      const sol = this.solveTiming(A, B, inc, D.field);
      // The prototype's track geometry is reconstructed, so the two paths can sit
      // on top of each other. Shift the second aircraft's path (rigidly) and both
      // altitude profiles so the replayed pass matches the recorded figures.
      const fitted = this.fitToRecord(A, B, inc, D.field, knots);
      const PA = fitted.A, PB = fitted.B;
      this._pathA = PA;
      this._pathB = PB;
      this._offB = fitted.offB;
      sol.minT = fitted.minT;
      // window: three minutes before the close pass, ninety seconds after
      this._t0 = Math.max(Math.min(0, this._offB), sol.minT - 180);
      this._t1 = Math.min(PA.duration - 1, this._offB + PB.duration - 1, sol.minT + 90);
      if (this._t1 - sol.minT < 30) this._t1 = sol.minT + 30;
      this._tClose = sol.minT;

      if (!this._map) {
        this._map = L.map(this._mapHost, { zoomControl: true, scrollWheelZoom: false, boxZoom: false });
        if (this.getAttribute('tiles') !== 'off') {
          L.tileLayer('https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors, © CARTO', opacity: 0.9
          }).addTo(this._map);
        } else if (window.PAE_BASEMAP) {
          L.imageOverlay(window.PAE_BASEMAP.url, window.PAE_BASEMAP.bounds,
            { opacity: 0.95, interactive: false }).addTo(this._map);
          this._mapHost.style.background = '#f3f2f2';
        } else {
          this._mapHost.style.background = '#f3f2f2';
        }
        this._static = L.layerGroup().addTo(this._map);
        this._live = L.layerGroup().addTo(this._map);
        new ResizeObserver(() => this._map && this._map.invalidateSize()).observe(this);
      }
      this._static.clearLayers();
      this._live.clearLayers();

      const center = D.field;
      const chart = this.getAttribute('tiles') === 'off' && !window.PAE_BASEMAP;
      (chart ? [2, 5, 10] : [10]).forEach((nm) => {
        L.circle(center, {
          radius: nm * 1852, fill: false, color: INK, weight: nm === 10 ? 2 : 1,
          opacity: nm === 10 ? 0.5 : 0.22, dashArray: nm === 10 ? null : '3 5', interactive: false
        }).addTo(this._static);
      });
      if (chart) {
        const rwy = 163, ext = 8;
        const a = D.dest(center[0], center[1], rwy, ext);
        const b = D.dest(center[0], center[1], rwy - 180, ext);
        L.polyline([a, b], { color: INK, weight: 1, opacity: 0.25, dashArray: '10 8', interactive: false })
          .addTo(this._static);
      }

      const night = D.nights.find((n) => n.date === inc.night);
      const keep = [inc.a.ident, inc.b.ident];
      night.flights.filter((f) => keep.indexOf(f.ident) === -1).forEach((f) => {
        if (f.track && f.track.length > 1) {
          L.polyline(f.track.map((p) => [p[0], p[1]]), {
            color: INK, weight: 1, opacity: 0.12, interactive: false
          }).addTo(this._static);
        }
      });
      [[PA, RED], [PB, INK]].forEach(([p, color]) => {
        L.polyline(p.pts.map((q) => [q[0], q[1]]), {
          color, weight: 2.5, opacity: 0.5, dashArray: '5 6', interactive: false
        }).addTo(this._static);
      });
      L.marker(center, {
        interactive: false,
        icon: L.divIcon({ className: '', iconSize: [10, 10], iconAnchor: [5, 5],
          html: '<div style="width:10px;height:10px;background:' + INK + '"></div>' })
      }).addTo(this._static);

      // Frame the two aircraft over the replayed window, not the whole 10 NM ring
      // (the ring stays drawn for context and may extend past the viewport).
      const seen = [];
      for (let t = this._t0; t <= this._t1; t += 4) {
        const pa = PA.posAt(Math.min(t, PA.duration), 0);
        const pb = PB.posAt(Math.min(t, this._offB + PB.duration), this._offB);
        if (pa) seen.push([pa[0], pa[1]]);
        if (pb) seen.push([pb[0], pb[1]]);
      }
      this._map.fitBounds(L.latLngBounds(seen.length ? seen : [center]), { padding: [40, 40] });

      // Size the glyphs so the pair never merges at the closest pass, whatever the
      // map's height (a short mobile map fits the window at a lower zoom).
      const ca = PA.lastAt(Math.min(this._tClose, PA.duration), 0);
      const cb = PB.lastAt(Math.min(this._tClose, this._offB + PB.duration), this._offB);
      let px = 60;
      if (ca && cb) {
        const p = this._map.latLngToContainerPoint([ca[0], ca[1]]);
        const q = this._map.latLngToContainerPoint([cb[0], cb[1]]);
        px = Math.hypot(p.x - q.x, p.y - q.y);
      }
      this._glyph = Math.max(14, Math.min(34, Math.round(px * 0.52)));

      this.frame(0);
    }

    dot(pos, color, shape, heading, alert) {
      const L = window.L;
      const g = this._glyph || 30;
      const anim = alert ? 'animation:dtw-alert 0.5s steps(1,end) infinite;' : '';
      const ring = alert
        ? '<div style="position:absolute;left:0;top:0;width:' + Math.round(g * 1.3) + 'px;height:' + Math.round(g * 1.3) +
          'px;border:2px solid ' + RED + ';border-radius:50%;animation:dtw-ring 0.9s ease-out infinite"></div>'
        : '';
      return L.marker([pos[0], pos[1]], {
        interactive: false, zIndexOffset: 1000,
        icon: L.divIcon({
          className: '', iconSize: [1, 1], iconAnchor: [0, 0],
          html: ring +
            '<svg viewBox="0 0 40 40" width="' + g + '" height="' + g + '" style="position:absolute;left:0;top:0;' +
            'transform:translate(-50%,-50%) rotate(' + heading.toFixed(0) + 'deg);' + anim +
            'filter:drop-shadow(0 0 2px rgba(243,242,242,0.95))">' +
            '<g fill="' + color + '">' + SHAPES[shape] + '</g></svg>'
        })
      });
    }

    /* Label chip pushed away from the other aircraft, so the two never overlap. */
    label(pos, other, color, text) {
      const L = window.L;
      const p = this._map.latLngToContainerPoint([pos[0], pos[1]]);
      const q = other ? this._map.latLngToContainerPoint([other[0], other[1]]) : { x: p.x - 1, y: p.y };
      let dx = p.x - q.x, dy = p.y - q.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len; dy /= len;
      const reach = Math.max(18, (this._glyph || 30) * 0.8);
      const ox = Math.round(dx * reach), oy = Math.round(dy * reach);
      const align = ox < -6 ? 'translate(calc(-100% + ' + ox + 'px),' + oy + 'px)'
                            : 'translate(' + Math.max(ox, 10) + 'px,' + oy + 'px)';
      return L.marker([pos[0], pos[1]], {
        interactive: false, zIndexOffset: -500,
        icon: L.divIcon({
          className: '', iconSize: [1, 1], iconAnchor: [0, 0],
          html: '<div style="position:absolute;transform:' + align + ';white-space:nowrap;' +
                'font:800 12px/1 Archivo,sans-serif;color:' + color + ';background:#f3f2f2;padding:3px 5px;border:1px solid ' + color + '">' +
                text + '</div>'
        })
      });
    }

    clock(t) {
      const inc = this._inc;
      const [h, m, s] = inc.time.split(':').map(Number);
      const base = h * 3600 + m * 60 + s;
      const now = Math.round(base + (t - this._tClose));
      const hh = ((Math.floor(now / 3600) % 24) + 24) % 24;
      const mm = Math.floor(((now % 3600) + 3600) % 3600 / 60);
      const ss = ((now % 60) + 60) % 60;
      const ap = hh >= 12 ? 'PM' : 'AM';
      const h12 = hh % 12 === 0 ? 12 : hh % 12;
      return String(h12).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':' +
             String(ss).padStart(2, '0') + ' ' + ap;
    }

    trail(path, start, t) {
      const from = Math.max(start, this._t0);
      const pts = [];
      for (let x = from; x <= t; x += 2) {
        const p = path.posAt(Math.min(x, start + path.duration), start);
        if (p) pts.push([p[0], p[1]]);
      }
      const head = path.posAt(Math.min(t, start + path.duration), start);
      if (head) pts.push([head[0], head[1]]);
      return pts;
    }

    heading(path, start, t) {
      const a = path.posAt(Math.max(t - 6, start), start) || path.posAt(t, start);
      const b = path.posAt(Math.min(t + 6, start + path.duration), start) || a;
      if (!a || !b) return 0;
      const kLon = Math.cos(a[0] * Math.PI / 180);
      const dx = (b[1] - a[1]) * kLon, dy = b[0] - a[0];
      if (!dx && !dy) return 0;
      return (Math.atan2(dx, dy) * 180) / Math.PI;
    }

    frame(k) {
      if (!this._pathA) return;
      const L = window.L;
      const idx = Math.max(0, Math.min(FRAMES - 1, k));
      this._k = idx;
      this._scrub.value = String(Math.round(idx));
      const t = this._t0 + (idx / (FRAMES - 1)) * (this._t1 - this._t0);

      const A = this._pathA, B = this._pathB;
      const aFlying = t >= 0 && t <= A.duration;
      const bFlying = t >= this._offB && t <= this._offB + B.duration;
      const a = A.lastAt(Math.min(t, A.duration), 0);
      const b = B.lastAt(Math.min(t, this._offB + B.duration), this._offB);

      this._live.clearLayers();
      const ta = this.trail(A, 0, Math.min(t, A.duration));
      const tb = this.trail(B, this._offB, Math.min(t, this._offB + B.duration));
      if (ta.length > 1) L.polyline(ta, { color: RED, weight: 4, opacity: 0.95, interactive: false }).addTo(this._live);
      if (tb.length > 1) L.polyline(tb, { color: INK, weight: 3, opacity: 0.8, interactive: false }).addTo(this._live);

      const both = a && b && aFlying && bFlying;
      if (a) this.label(a, b, RED, inLabel(this._inc.a.ident, aFlying)).addTo(this._live);
      if (b) this.label(b, a, INK, inLabel(this._inc.b.ident, bFlying)).addTo(this._live);
      const alert = both && lat0(a, b);
      if (a) this.dot(a, RED, silhouette(this._inc.a.type, this._inc.a.cat),
        this.heading(A, 0, Math.min(t, A.duration)), alert).addTo(this._live);
      if (b) this.dot(b, INK, silhouette(this._inc.b.type, this._inc.b.cat),
        this.heading(B, this._offB, Math.min(t, this._offB + B.duration)), alert).addTo(this._live);
      if (both) {
        L.polyline([[a[0], a[1]], [b[0], b[1]]],
          { color: RED, weight: 1.5, opacity: 0.6, dashArray: '3 4', interactive: false }).addTo(this._live);
      }

      const lat = both ? nmBetween(a, b) : null;
      const vert = both ? Math.abs((a[2] || 0) - (b[2] || 0)) : null;
      const tight = lat !== null && lat < 3 && vert < 1000;
      const cell = (label, value, color) =>
        '<div><div style="font:600 10px/1 Archivo,sans-serif;letter-spacing:0.12em;text-transform:uppercase;color:#7d7979">' +
        label + '</div><div style="font:' + (color ? '900 18px/1.2' : '700 16px/1.3') +
        ' Archivo,sans-serif;font-variant-numeric:tabular-nums;color:' + (color || INK) + '">' + value + '</div></div>';
      this._readout.innerHTML =
        cell('Local time', this.clock(t)) +
        cell('Lateral', lat === null ? '—' : lat.toFixed(1) + ' NM', tight ? RED : INK) +
        cell('Vertical', vert === null ? '—' : Math.round(vert / 100) * 100 + "'", tight ? RED : INK);
    }

    start() {
      if (this._timer) return;
      if (this._k >= FRAMES - 1) this.frame(0);
      this._play.textContent = 'Pause';
      const secPerFrame = (this._t1 - this._t0) / (FRAMES - 1);
      this._timer = setInterval(() => {
        const advance = (this._speed * (1 / 30)) / secPerFrame;
        this.frame(this._k + Math.max(advance, 0.25));
        if (this._k >= FRAMES - 1) this.stop();
      }, 1000 / 30);
    }
    stop() {
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
      if (this._play) this._play.textContent = this._k >= FRAMES - 1 ? 'Replay again' : 'Play replay';
    }
  }

  function lat0(a, b) {
    return nmBetween(a, b) < 3 && Math.abs((a[2] || 0) - (b[2] || 0)) < 1000;
  }

  function inLabel(ident, flying) { return flying ? ident : ident + ' · landed'; }

  if (!customElements.get('incident-replay')) customElements.define('incident-replay', IncidentReplay);
})();
