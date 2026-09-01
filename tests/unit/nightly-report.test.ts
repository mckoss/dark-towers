import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { renderNightlyReportPdf } from '../../src/lib/server/pdf/nightlyReport';
import { tilesForView, mapBounds, MAP_VIEWS } from '../../src/lib/report-maps';
import type { AirportConfig, Flight, Incident } from '../../src/lib/types';
import type { AirportDetail } from '../../src/lib/server/queries';

const airport: AirportConfig = {
	code: 'PAE',
	icao: 'KPAE',
	name: 'Snohomish County (Paine Field)',
	city: 'Everett',
	state: 'WA',
	tz: 'America/Los_Angeles',
	pos: [47.9063, -122.2815],
	elevationFt: 606,
	towerHours: { open: 7, close: 21 },
	schedules: [{ id: 's1', from: '2020-01-01', to: null, open: 7, close: 21, note: '' }],
	carriers: ['Alaska'],
	status: 'tracking',
	kind: 'dark',
	tracked: true
};

function flight(id: string, over: Partial<Flight> = {}): Flight {
	const t0 = Date.parse('2026-08-18T05:00:00Z');
	return {
		id,
		airport: 'KPAE',
		night: '2026-08-17',
		ident: id,
		tail: id,
		type: 'C172',
		category: 'private',
		operator: null,
		operatorName: null,
		operatorShort: null,
		direction: 'arrival',
		eventTime: t0,
		otherCode: null,
		otherName: null,
		otherCity: null,
		positions: Array.from({ length: 6 }, (_, i) => ({
			t: t0 + i * 30_000,
			lat: 47.9 + i * 0.01,
			lon: -122.28 + i * 0.005,
			alt: 2000,
			gs: 120,
			hdg: 30,
			dist: 2 + i
		})),
		...over
	};
}

function incident(id: string, over: Partial<Incident> = {}): Incident {
	return {
		id,
		airport: 'KPAE',
		night: '2026-08-17',
		t: Date.parse('2026-08-18T05:10:00Z'),
		lateralNm: 1.2,
		verticalFt: 560,
		distNm: 3,
		severity: 'closer-than-allowed',
		flightA: 'A1',
		flightB: 'B1',
		altA: 2000,
		altB: 2500,
		gsA: 120,
		gsB: 130,
		posA: [47.91, -122.28],
		posB: [47.92, -122.27],
		...over
	};
}

function detail(over: Partial<AirportDetail> = {}): AirportDetail {
	return {
		airport,
		period: { from: '2026-08-01', to: '2026-08-30', label: 'Last 30 days', month: null },
		nav: { firstMonth: '2026-08', lastMonth: '2026-08', prev: null, next: null, isDefault: true },
		hasAnyData: true,
		totals: { flights: 2, airline: 1, private: 1, incidents: 1, wakeIncidents: 0, nights: 1 },
		calendar: [],
		selectedNight: '2026-08-17',
		flights: [flight('A1'), flight('B1', { category: 'airline', ident: 'Horizon 2189', direction: 'departure' })],
		incidents: [incident('i1')],
		nightSummary: null,
		...over
	};
}

const idents = { A1: 'N182RH', B1: 'Horizon 2189' };

/** Page count, read back through pdf-lib rather than guessed from the bytes. */
async function pageCount(pdf: Uint8Array): Promise<number> {
	return (await PDFDocument.load(pdf)).getPageCount();
}

describe('nightly report PDF', () => {
	it('renders a one-page report for a quiet night', async () => {
		const pdf = await renderNightlyReportPdf({ detail: detail({ incidents: [] }), idents });
		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
		expect(await pageCount(pdf)).toBe(1);
	});

	it('keeps a handful of events on one page and spills a crowded night', async () => {
		const few = await renderNightlyReportPdf({ detail: detail(), idents });
		expect(await pageCount(few)).toBe(1);

		const many = detail({ incidents: Array.from({ length: 24 }, (_, i) => incident(`i${i}`)) });
		expect(await pageCount(await renderNightlyReportPdf({ detail: many, idents }))).toBeGreaterThan(1);
	});

	it('renders wake-turbulence events, whose CWT arrow is outside WinAnsi', async () => {
		const wake = incident('w1', {
			kind: 'wake-turbulence',
			requiredNm: 4,
			trailSeconds: 71,
			leaderCategory: 'C',
			followerCategory: 'F'
		});
		const pdf = await renderNightlyReportPdf({ detail: detail({ incidents: [wake] }), idents });
		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
	});

	it('survives names carrying characters the standard fonts cannot encode', async () => {
		const odd = { ...airport, name: 'Snohomish 〜 Paine — Field', city: 'Everett™' };
		const pdf = await renderNightlyReportPdf({ detail: detail({ airport: odd }), idents });
		expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
	});

	it('links the header URL back to the live night', async () => {
		const pdf = await renderNightlyReportPdf({ detail: detail(), idents, origin: 'https://darktowers.org' });
		const [first] = (await PDFDocument.load(pdf)).getPages();
		const annots = first.node.lookupMaybe(PDFName.of('Annots'), PDFArray);

		// A viewer that auto-detects URL-shaped text is not enough: the address is
		// shown without its scheme, so the annotation has to carry the real link.
		expect(annots?.size()).toBe(1);
		const action = annots!.lookup(0, PDFDict).get(PDFName.of('A')) as PDFDict;
		expect(String(action.get(PDFName.of('URI')))).toContain('https://darktowers.org/airport/PAE?night=2026-08-17');
	});

	it('needs a night to report on', async () => {
		await expect(renderNightlyReportPdf({ detail: detail({ selectedNight: null }), idents })).rejects.toThrow(/night/);
	});
});

describe('report chart tiles', () => {
	it('covers each view without exceeding the fetch budget', () => {
		for (const view of MAP_VIEWS) {
			const tiles = tilesForView(airport.pos, view.halfNm);
			expect(tiles.length).toBeGreaterThan(0);
			expect(tiles.length).toBeLessThanOrEqual(30);

			// Every corner of the view falls inside the tiles fetched for it.
			const bounds = mapBounds(airport.pos, view.halfNm);
			expect(Math.min(...tiles.map((t) => t.west))).toBeLessThanOrEqual(bounds.west);
			expect(Math.max(...tiles.map((t) => t.east))).toBeGreaterThanOrEqual(bounds.east);
			expect(Math.max(...tiles.map((t) => t.north))).toBeGreaterThanOrEqual(bounds.north);
			expect(Math.min(...tiles.map((t) => t.south))).toBeLessThanOrEqual(bounds.south);
		}
	});

	it('draws the close-up at a finer zoom than the wide chart', () => {
		const [wide, field] = MAP_VIEWS.map((v) => tilesForView(airport.pos, v.halfNm)[0].z);
		expect(field).toBeGreaterThan(wide);
	});
});
