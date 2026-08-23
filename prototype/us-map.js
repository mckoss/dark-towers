/* <us-airport-map> — d3 + topojson US states with tracked-airport markers.
   Markers sit on their true projected position: a semi-transparent circle whose
   radius scales with separation losses in the last 30 days. Overlap is allowed.
   Property: airports = window.PAE.airports
   Attribute: selected="PAE"
   Fires 'airportpick' with {detail:{code}}. */
(function () {
  const INK = '#201e1d';
  const RED = '#ec3013';
  const ATLAS = 'https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json';

  class USAirportMap extends HTMLElement {
    static get observedAttributes() { return ['selected']; }
    get _airports() { return (window.PAE && window.PAE.airports) || []; }

    connectedCallback() {
      if (this._svg) return;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.width = '100%';
      this.style.height = (this.getAttribute('height') || '600') + 'px';
      this.style.padding = '24px';
      this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this._svg.setAttribute('viewBox', '0 0 960 560');
      this._svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      this._svg.style.cssText = 'width:100%;height:100%;display:block;overflow:visible';
      this.appendChild(this._svg);
      this.load();
    }
    attributeChangedCallback() { this.render(); }

    load() {
      const use = (topo) => {
        this._states = window.topojson.feature(topo, topo.objects.states);
        this._nation = window.topojson.mesh(topo, topo.objects.states, (a, b) => a !== b);
        this.render();
      };
      const go = () => {
        if (window.US_ATLAS) { use(window.US_ATLAS); return; }
        window.d3.json(ATLAS).then(use);
      };
      if (window.d3 && window.topojson) go();
      else {
        const t = setInterval(() => {
          if (window.d3 && window.topojson) { clearInterval(t); go(); }
        }, 60);
      }
    }

    render() {
      if (!this._svg || !this._states) return;
      const d3 = window.d3;
      const proj = d3.geoAlbersUsa().fitSize([960, 560], this._states);
      const path = d3.geoPath(proj);
      const sel = this.getAttribute('selected');
      const svg = d3.select(this._svg);
      svg.selectAll('*').remove();

      svg.append('g').selectAll('path').data(this._states.features).enter().append('path')
        .attr('d', path).attr('fill', '#eae9e9').attr('stroke', 'none');
      svg.append('path').attr('d', path(this._nation))
        .attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 0.6).attr('opacity', 0.35);

      const nodes = [];
      this._airports.filter((a) => a.status === 'tracking').forEach((a) => {
        const p = proj([a.pos[1], a.pos[0]]);
        if (!p) return;
        const active = true;
        const inc = a.stats ? a.stats.incidents : 0;
        nodes.push({ a, active, inc, x: p[0], y: p[1], r: active ? (inc > 0 ? 9 + Math.sqrt(inc) * 7 : 7) : 4 });
      });
      nodes.sort((m, n) => n.r - m.r); // biggest first, so small counts stay legible on top

      const circles = svg.append('g');
      const labels = svg.append('g');

      nodes.forEach((n) => {
        const a = n.a, inc = n.inc, active = n.active, on = sel === a.code;
        const node = circles.append('g')
          .attr('transform', 'translate(' + n.x + ',' + n.y + ')')
          .style('cursor', 'pointer')
          .on('click', () => this.dispatchEvent(new CustomEvent('airportpick', { detail: { code: a.code }, bubbles: true })));

        if (active && inc > 0) {
          node.append('circle').attr('r', n.r).attr('fill', RED).attr('opacity', 0.22);
          node.append('circle').attr('r', n.r).attr('fill', 'none')
            .attr('stroke', RED).attr('stroke-width', 1.5).attr('opacity', 0.85);
          node.append('circle').attr('r', 2.6).attr('fill', RED);
        } else if (active) {
          node.append('circle').attr('r', n.r).attr('fill', INK).attr('opacity', 0.12);
          node.append('circle').attr('r', n.r).attr('fill', 'none')
            .attr('stroke', INK).attr('stroke-width', 1.5).attr('opacity', 0.6);
          node.append('circle').attr('r', 2.2).attr('fill', INK);
        } else {
          node.append('circle').attr('r', n.r).attr('fill', a.status === 'queued' ? INK : 'none')
            .attr('stroke', INK).attr('stroke-width', 1.5).attr('opacity', 0.7);
        }
        node.append('title').text(a.name + ' — ' + a.city + (a.stats ? ' — ' + inc + ' close approaches in the last 30 days' : ''));
      });

      nodes.forEach((n) => {
        const a = n.a, inc = n.inc, active = n.active, on = sel === a.code;
        const text = active && inc > 0 ? a.code + ' · ' + inc : a.code;
        const size = active ? 14 : 12;
        const wide = n.x + n.r + 6 + text.length * size * 0.62 > 950;
        const lx = wide ? n.x - n.r - 6 : n.x + n.r + 6;
        const anchor = wide ? 'end' : 'start';
        const ly = n.y + (a.dy || 0) + 5;
        const grp = labels.append('g').style('pointer-events', 'none');
        grp.append('text').text(text)
          .attr('x', lx).attr('y', ly).attr('text-anchor', anchor)
          .attr('font-family', 'Archivo, sans-serif')
          .attr('font-size', size)
          .attr('font-weight', active ? 800 : 600)
          .attr('stroke', '#f3f2f2').attr('stroke-width', 3.5).attr('stroke-linejoin', 'round')
          .attr('opacity', 0.9);
        grp.append('text').text(text)
          .attr('x', lx).attr('y', ly).attr('text-anchor', anchor)
          .attr('font-family', 'Archivo, sans-serif')
          .attr('font-size', size)
          .attr('font-weight', active ? 800 : 600)
          .attr('fill', active && inc > 0 ? '#ae1800' : INK)
          .attr('opacity', active ? 1 : on ? 1 : 0.75);
      });
    }
  }
  if (!customElements.get('us-airport-map')) customElements.define('us-airport-map', USAirportMap);
})();
