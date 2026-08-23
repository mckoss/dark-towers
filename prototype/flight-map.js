/* <flight-map> — Leaflet track overlay for a 10 NM airspace circle.
   Reads its data from window.PAE. Attributes:
     mode="basemap"|"abstract"   night="2026-08-14"   incident="PAE-2026-0818-01"
     focus="<flight id>"         interactive
   Fires 'trackpick' with {detail:{id}}. */
(function () {
  const INK = '#201e1d';
  const RED = '#ec3013';

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

  class FlightMap extends HTMLElement {
    static get observedAttributes() { return ['mode', 'night', 'incident', 'focus']; }

    connectedCallback() {
      if (this._host) { this.draw(); return; }
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = (this.getAttribute('height') || '560') + 'px';
      this._host = document.createElement('div');
      this._host.style.cssText = 'position:absolute;inset:0;background:#e8e6e5;';
      this.appendChild(this._host);
      loadLeaflet().then(() => this.init()).catch(() => {
        this._host.innerHTML = '<div style="padding:16px;font:400 13px/1.5 Archivo,sans-serif;color:#605d5d">Map unavailable — no network.</div>';
      });
    }
    attributeChangedCallback() { if (this._map) { this.applyMode(); } }

    init() {
      const L = window.L;
      const interactive = this.hasAttribute('interactive');
      this._map = L.map(this._host, {
        zoomControl: interactive, dragging: interactive, scrollWheelZoom: false,
        doubleClickZoom: interactive, boxZoom: false, keyboard: interactive,
        touchZoom: interactive
      });
      this._tiles = L.tileLayer('https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors, © CARTO', opacity: 0.9
      });
      this._layer = L.layerGroup().addTo(this._map);
      this.applyMode();
      new ResizeObserver(() => this._map && this._map.invalidateSize()).observe(this);
    }

    applyMode() {
      if (!this._map) return;
      const abstract = this.getAttribute('mode') === 'abstract';
      if (abstract) {
        if (this._map.hasLayer(this._tiles)) this._map.removeLayer(this._tiles);
        this._host.style.background = '#f3f2f2';
        if (window.PAE_BASEMAP && !this._snap) {
          this._snap = window.L.imageOverlay(window.PAE_BASEMAP.url, window.PAE_BASEMAP.bounds,
            { opacity: 0.95, interactive: false });
        }
        if (this._snap && !this._map.hasLayer(this._snap)) this._snap.addTo(this._map);
      } else {
        if (this._snap && this._map.hasLayer(this._snap)) this._map.removeLayer(this._snap);
        if (!this._map.hasLayer(this._tiles)) this._tiles.addTo(this._map);
        this._host.style.background = '#e8e6e5';
      }
      this.draw();
    }

    data() {
      const D = window.PAE;
      if (!D) return { center: [47.9079, -122.2816], radius: 10, tracks: [] };
      const inc = this.getAttribute('incident');
      const focus = this.getAttribute('focus');
      if (inc) {
        const i = D.incidents.find((x) => x.id === inc);
        if (!i) return { center: D.field, radius: D.radiusNm, tracks: [] };
        const night = D.nights.find((n) => n.date === i.night);
        const keep = [i.a.ident, i.b.ident];
        const context = night.flights
          .filter((f) => keep.indexOf(f.ident) === -1)
          .map((f) => ({ id: f.id, points: f.track, cat: f.cat, faded: true }));
        const pair = night.flights
          .filter((f) => keep.indexOf(f.ident) !== -1)
          .map((f) => ({ id: f.id, points: f.track, cat: f.cat, emphasis: true, label: f.ident }));
        return { center: D.field, radius: D.radiusNm, tracks: context.concat(pair) };
      }
      const nightKey = this.getAttribute('night');
      const night = D.nights.find((n) => n.date === nightKey) || D.nights[D.nights.length - 1];
      return {
        center: D.field, radius: D.radiusNm,
        tracks: night.flights.map((f) => ({
          id: f.id, points: f.track, cat: f.cat, label: f.ident + ' · ' + f.type,
          emphasis: focus === f.id, faded: !!focus && focus !== f.id
        }))
      };
    }

    draw() {
      if (!this._map) return;
      const L = window.L;
      const abstract = this.getAttribute('mode') === 'abstract';
      const { center, radius, tracks } = this.data();
      this._layer.clearLayers();

      const rings = abstract && !window.PAE_BASEMAP ? [2, 5, 10] : [10];
      rings.forEach((nm) => {
        L.circle(center, {
          radius: nm * 1852, fill: false, color: INK, weight: nm === 10 ? 2 : 1,
          opacity: nm === 10 ? 0.6 : 0.25, dashArray: nm === 10 ? null : '3 5', interactive: false
        }).addTo(this._layer);
      });

      tracks.forEach((t) => {
        if (!t.points || t.points.length < 2) return;
        const airline = t.cat && t.cat !== 'GA';
        const line = L.polyline(t.points.map((p) => [p[0], p[1]]), {
          color: airline ? RED : INK,
          weight: t.emphasis ? 4 : airline ? 2.5 : 1.75,
          opacity: t.faded ? 0.16 : airline ? 0.95 : 0.55,
          lineJoin: 'round'
        }).addTo(this._layer);
        if (t.label) line.bindTooltip(t.label, { sticky: true });
        if (t.id) line.on('click', () => this.dispatchEvent(
          new CustomEvent('trackpick', { detail: { id: t.id }, bubbles: true })));
      });

      L.marker(center, {
        interactive: false,
        icon: L.divIcon({
          className: '', iconSize: [10, 10], iconAnchor: [5, 5],
          html: '<div style="width:10px;height:10px;background:' + INK + '"></div>'
        })
      }).addTo(this._layer);

      const dLat = radius / 60;
      const dLon = radius / (60 * Math.cos(center[0] * Math.PI / 180));
      this._map.fitBounds(
        L.latLngBounds([center[0] - dLat, center[1] - dLon], [center[0] + dLat, center[1] + dLon]),
        { padding: [4, 4] }
      );
    }
  }
  if (!customElements.get('flight-map')) customElements.define('flight-map', FlightMap);
})();
