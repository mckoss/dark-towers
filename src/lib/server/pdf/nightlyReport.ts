/**
 * Server-rendered PDF of one night at one airport, on US Letter portrait: two
 * base-mapped track charts, that night's totals, the airport's standing facts,
 * and every flagged event.
 *
 * Drawn as vectors with pdf-lib rather than by screenshotting the page, so it
 * needs no browser at runtime and stays sharp at any print size. Track geometry
 * comes from the same $lib/spline.ts curve fit the live map uses, projected onto
 * a flat local-NM plane instead of onto tiles — the two agree to well under a
 * point at these scales, so CARTO tiles drop in underneath by their own corners.
 * Type is set several steps smaller than the web page: print carries detail a
 * screen cannot.
 */
import {
	PDFDocument,
	StandardFonts,
	rgb,
	pushGraphicsState,
	popGraphicsState,
	rectangle,
	clip,
	endPath,
	PDFArray,
	PDFName,
	PDFString,
	type Color,
	type PDFFont,
	type PDFImage,
	type PDFPage
} from 'pdf-lib';
import type { AirportConfig, Flight, Incident } from '$lib/types';
import type { AirportDetail } from '$lib/server/queries';
import { Spline } from '$lib/spline';
import { toLocalNm } from '$lib/geo';
import { runwayOutline } from '$lib/runways';
import { aircraftKind } from '$lib/replay';
import {
	AIRSPACE_RADIUS_NM,
	SEPARATION_LATERAL_NM,
	SEPARATION_VERTICAL_FT,
	towerHoursLabel,
	towerHoursOn,
	quietHoursLabel,
	isReference,
	hoursClosed,
	hourLabel
} from '$lib/airports';
import { localTimeZoned, localTime, nightLabelLong } from '$lib/time';
import { MAP_VIEWS, TILE_ATTRIBUTION, type MapView } from '$lib/report-maps';
import type { ViewTile } from '$lib/server/tile-cache';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 36;
/** Height reserved at the foot of every page for the rule and page number. */
const FOOTER_H = 24;
/** The lowest y any block of content may occupy. */
const BOTTOM = MARGIN + FOOTER_H;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const COL_GAP = 24;
/** One module width for both charts and every card column, on every page. */
const COL_W = (CONTENT_W - COL_GAP) / 2;
const CARD_GAP = 8;
/** Runway dimensions are published in feet; charts work in nautical miles. */
const FEET_PER_NM = 6076.12;
/** Runways are drawn half again their true width so they read at chart scale. */
const RUNWAY_EXAGGERATION = 1.5;

/** src/app.css tokens. */
const INK = rgb(0x20 / 255, 0x1e / 255, 0x1d / 255);
const INK45 = rgb(0x7d / 255, 0x79 / 255, 0x79 / 255);
const INK60 = rgb(0x60 / 255, 0x5d / 255, 0x5d / 255);
const HAIRLINE = rgb(0xd7 / 255, 0xd3 / 255, 0xd3 / 255);
const GROUND = rgb(0xf3 / 255, 0xf2 / 255, 0xf2 / 255);
const GROUND_ALT = rgb(0xea / 255, 0xe9 / 255, 0xe9 / 255);
const ACCENT = rgb(0xec / 255, 0x30 / 255, 0x13 / 255);
const ACCENT_TEXT = rgb(0xae / 255, 0x18 / 255, 0x00 / 255);
const ACCENT_TINT = rgb(1, 0xf2 / 255, 0xef / 255);
const MILITARY = rgb(0x1f / 255, 0x5f / 255, 0xbf / 255);
/**
 * The runway blue taken darker for print. leaflet.ts's TOKENS.runway is tuned
 * to sit under an interactive map; on paper it prints too pale to find against
 * the basemap's greys. Same hue, enough contrast to read.
 */
const RUNWAY = rgb(0x35 / 255, 0x68 / 255, 0x8c / 255);

interface Fonts {
	regular: PDFFont;
	bold: PDFFont;
}

/** A cached base-map tile, embedded in the document and ready to place. */
interface PlacedTile {
	image: PDFImage;
	north: number;
	south: number;
	west: number;
	east: number;
}

/** A column that cards flow down. */
interface Column {
	x: number;
	top: number;
}

const fmt = (n: number) => n.toLocaleString('en-US');

/** A fresh page, on white paper whatever the viewer composites onto. */
function addPage(doc: PDFDocument): PDFPage {
	const page = doc.addPage([PAGE_W, PAGE_H]);
	page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) });
	return page;
}

/**
 * The standard PDF fonts encode WinAnsi only, and pdf-lib throws on anything
 * outside it. Aircraft types and operator names come from outside data, so keep
 * the report to glyphs that are certain to draw.
 */
function safe(str: string): string {
	return str
		.replace(/→/g, ' to ')
		.replace(/[‘’]/g, "'")
		.replace(/[“”]/g, '"')
		.replace(/…/g, '...')
		.replace(/[^\x20-\x7e\xa0-\xff–—•]/g, '');
}

interface TextOptions {
	x: number;
	y: number;
	size: number;
	font: PDFFont;
	color: Color;
}

function text(page: PDFPage, str: string, o: TextOptions) {
	page.drawText(safe(str), o);
}

function textRight(page: PDFPage, str: string, o: Omit<TextOptions, 'x'> & { right: number }) {
	const s = safe(str);
	page.drawText(s, { ...o, x: o.right - o.font.widthOfTextAtSize(s, o.size) });
}

function wrap(font: PDFFont, size: number, str: string, maxWidth: number): string[] {
	const words = safe(str).split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const w of words) {
		const candidate = line ? `${line} ${w}` : w;
		if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
			lines.push(line);
			line = w;
		} else {
			line = candidate;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** The design system's small uppercase caption role. Returns the y below it. */
function caption(page: PDFPage, fonts: Fonts, str: string, x: number, y: number, maxWidth: number, color = INK60): number {
	for (const line of wrap(fonts.regular, 6, str.toUpperCase(), maxWidth)) {
		text(page, line, { x, y, size: 6, font: fonts.regular, color });
		y -= 8;
	}
	return y;
}

/** Section heading over a hairline rule, as the page's `.table-header` rows read. */
function sectionLabel(page: PDFPage, fonts: Fonts, str: string, x: number, y: number, width: number): number {
	text(page, str.toUpperCase(), { x, y, size: 8, font: fonts.bold, color: INK45 });
	page.drawLine({ start: { x, y: y - 8 }, end: { x: x + width, y: y - 8 }, thickness: 1, color: HAIRLINE });
	return y - 23;
}

/** Local YYYY-MM-DD for an instant, so the generated-on date reads in the airport's own zone. */
function localDateKey(tz: string, utcMs: number): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(utcMs);
}

/**
 * Right-aligned text that viewers open as a link. pdf-lib has no drawing API
 * for this, so the URI annotation goes on by hand over the text's own box.
 */
function drawLinkRight(doc: PDFDocument, page: PDFPage, label: string, url: string, right: number, y: number, size: number, font: PDFFont) {
	const shown = safe(label);
	const x = right - font.widthOfTextAtSize(shown, size);
	text(page, shown, { x, y, size, font, color: ACCENT });

	const ref = doc.context.register(
		doc.context.obj({
			Type: 'Annot',
			Subtype: 'Link',
			Rect: [x, y - 2, right, y + size],
			// No visible frame: the accent colour already says it is a link.
			Border: [0, 0, 0],
			A: { Type: 'Action', S: 'URI', URI: PDFString.of(url) }
		})
	);
	const key = PDFName.of('Annots');
	const existing = page.node.lookupMaybe(key, PDFArray);
	if (existing) existing.push(ref);
	else page.node.set(key, doc.context.obj([ref]));
}

function drawHeader(doc: PDFDocument, page: PDFPage, fonts: Fonts, airport: AirportConfig, night: string, generatedAt: number, liveUrl: string | null): number {
	let y = PAGE_H - MARGIN;
	text(page, 'DARK TOWERS · NIGHTLY REPORT', { x: MARGIN, y, size: 8, font: fonts.bold, color: INK45 });
	textRight(page, `Report made ${nightLabelLong(localDateKey(airport.tz, generatedAt))}, ${localTimeZoned(airport.tz, generatedAt)}`, {
		right: PAGE_W - MARGIN,
		y,
		size: 8,
		font: fonts.regular,
		color: INK45
	});
	y -= 23;
	text(page, `${airport.code} — ${airport.name}`, { x: MARGIN, y, size: 15, font: fonts.bold, color: INK });
	y -= 14;
	text(page, `${airport.city}, ${airport.state} · ${airport.icao}`, { x: MARGIN, y, size: 9, font: fonts.regular, color: INK60 });
	y -= 20;
	text(page, `Night of ${nightLabelLong(night)}`, { x: MARGIN, y, size: 13, font: fonts.bold, color: INK });
	y -= 12;
	const tower = towerHoursOn(airport, night);
	const window = !tower
		? 'No tower at any hour'
		: isReference(airport)
			? `Quiet hours ${hourLabel(tower.close)} to ${hourLabel(tower.open)}`
			: `Tower closed ${hourLabel(tower.close)} to ${hourLabel(tower.open)}`;
	text(page, window, {
		x: MARGIN,
		y,
		size: 8.5,
		font: fonts.regular,
		color: INK45
	});
	if (liveUrl) {
		// Closes the header block: the address sits on its last baseline, opposite
		// the tower hours, with its label a line above. The scheme is dropped so
		// the address stays short enough to retype; the annotation still carries
		// the whole thing.
		textRight(page, 'REPLAY THIS NIGHT ONLINE', { right: PAGE_W - MARGIN, y: y + 11, size: 6, font: fonts.bold, color: INK45 });
		drawLinkRight(doc, page, liveUrl.replace(/^https?:\/\//, ''), liveUrl, PAGE_W - MARGIN, y, 10, fonts.bold);
	}
	y -= 11;
	page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 2, color: INK });
	return y - 16;
}

/** The airport's standing facts, as one strip across the page. */
function drawFacts(page: PDFPage, fonts: Fonts, airport: AirportConfig, top: number): number {
	const facts: [string, string][] = isReference(airport)
		? [
				['Tower hours', 'Staffed 24 hours'],
				['Quiet hours', quietHoursLabel(airport)],
				['Airlines serving', airport.carriers.join(', ') || 'None observed yet'],
				['Field elevation', `${fmt(airport.elevationFt)} ft`]
			]
		: [
		['Tower hours', towerHoursLabel(airport)],
		['Hours closed', `${hoursClosed(airport)} of 24`],
		['Airlines serving', airport.carriers.join(', ') || 'None observed yet'],
		['Field elevation', `${fmt(airport.elevationFt)} ft`]
	];
	const colW = CONTENT_W / facts.length;
	let lowest = top;
	facts.forEach(([label, value], i) => {
		const x = MARGIN + i * colW;
		let y = caption(page, fonts, label, x, top, colW - 12, INK45) - 2;
		for (const line of wrap(fonts.bold, 9, value, colW - 12)) {
			text(page, line, { x, y, size: 9, font: fonts.bold, color: INK });
			y -= 11;
		}
		lowest = Math.min(lowest, y);
	});
	page.drawLine({ start: { x: MARGIN, y: lowest - 1 }, end: { x: PAGE_W - MARGIN, y: lowest - 1 }, thickness: 1, color: HAIRLINE });
	return lowest - 12;
}

/**
 * Track colours mirror FlightMap.svelte's `style()`. Where a night has flagged
 * events, the aircraft involved are drawn a little heavier and the rest of the
 * traffic steps back — the live map does the same on hover. Most of the
 * separation comes from holding the context back rather than from weight, so
 * the charts stay a map with tracks on them rather than a black scribble.
 */
function trackStyle(f: Flight, flagged: boolean, anyFlagged: boolean): { color: Color; width: number; opacity: number } {
	const base =
		aircraftKind(f) === 'military'
			? { color: MILITARY, width: 1.4, opacity: 0.9 }
			: f.category === 'airline'
				? { color: ACCENT, width: 1.4, opacity: 1 }
				: { color: INK, width: 0.9, opacity: 0.6 };
	if (!anyFlagged) return base;
	return flagged ? { ...base, width: base.width * 1.5, opacity: 0.95 } : { ...base, opacity: base.opacity * 0.45 };
}

/** A numbered disc tying a spot on the chart to its card in the event list. */
function drawEventMarker(page: PDFPage, fonts: Fonts, n: number, x: number, y: number) {
	const label = String(n);
	const size = label.length > 1 ? 6.2 : 5.4;
	// A white rim keeps neighbouring markers apart where events cluster.
	page.drawCircle({ x, y, size: size + 0.7, color: rgb(1, 1, 1), opacity: 0.9 });
	page.drawCircle({ x, y, size, color: ACCENT });
	const fontSize = 6.5;
	text(page, label, {
		x: x - fonts.bold.widthOfTextAtSize(label, fontSize) / 2,
		y: y - fontSize * 0.35,
		size: fontSize,
		font: fonts.bold,
		color: rgb(1, 1, 1)
	});
}

function pathFromPoints(points: [number, number][], close: boolean): string {
	if (!points.length) return '';
	const f = (n: number) => n.toFixed(2);
	let d = `M${f(points[0][0])},${f(points[0][1])}`;
	for (const [x, y] of points.slice(1)) d += `L${f(x)},${f(y)}`;
	return close ? d + 'Z' : d;
}

interface MapOptions {
	airport: AirportConfig;
	flights: Flight[];
	incidents: Incident[];
	/** Cached base-map tiles for this view, already embedded in the document. */
	tiles: PlacedTile[];
	view: MapView;
	x: number;
	yTop: number;
	size: number;
}

function drawMap(page: PDFPage, fonts: Fonts, o: MapOptions) {
	const { airport, flights, incidents, tiles, view, x, yTop, size } = o;
	const bottom = yTop - size;
	const cx = x + size / 2;
	const cy = bottom + size / 2;
	const pxPerNm = size / 2 / view.halfNm;
	const origin = airport.pos;

	const toPage = (latlon: [number, number]): [number, number] => {
		const [e, n] = toLocalNm(origin, latlon);
		return [cx + e * pxPerNm, cy + n * pxPerNm];
	};
	// drawSvgPath flips Y (SVG counts downward, PDF upward), so emit SVG-convention
	// coordinates about the field and let that flip put north back at the top.
	const toSvg = (v: number[]): [number, number] => {
		const [e, n] = toLocalNm(origin, [v[0], v[1]]);
		return [e * pxPerNm, -n * pxPerNm];
	};

	page.drawRectangle({ x, y: bottom, width: size, height: size, color: GROUND });
	page.pushOperators(pushGraphicsState(), rectangle(x, bottom, size, size), clip(), endPath());

	// Tiles are placed by their own corners, so Mercator and this chart's flat
	// local-NM plane reconcile themselves rather than being assumed equal.
	for (const t of tiles) {
		const [left, top] = toPage([t.north, t.west]);
		const [right, low] = toPage([t.south, t.east]);
		// A hair of overlap keeps antialiasing from leaving seams between tiles.
		page.drawImage(t.image, { x: left, y: low, width: right - left + 0.4, height: top - low + 0.4, opacity: 0.9 });
	}

	for (const runway of airport.runways ?? []) {
		// Drawn half again its true width, in the solid runway blue: at these
		// scales the real surface is a sliver, and the job is to locate the field
		// rather than to measure it.
		const widened = { ...runway, widthFt: runway.widthFt * RUNWAY_EXAGGERATION };
		page.drawSvgPath(pathFromPoints(runwayOutline(widened).map(toSvg), true), { x: cx, y: cy, color: RUNWAY, opacity: 0.95 });
		// Below about two points even the widened surface stops reading as a
		// shape, so stand it in with a centreline the way the live map does.
		if ((widened.widthFt / FEET_PER_NM) * pxPerNm < 2) {
			page.drawSvgPath(pathFromPoints(runway.ends.map((end) => toSvg(end.pos)), false), {
				x: cx,
				y: cy,
				borderColor: RUNWAY,
				borderWidth: 2,
				borderOpacity: 0.95
			});
		}
	}

	// Private traffic first, then airline and military, then whoever was in a
	// flagged event — so the tracks the report is about end up on top.
	const flagged = new Set(incidents.flatMap((i) => [i.flightA, i.flightB]));
	const rank = (f: Flight) => (flagged.has(f.id) ? 3 : aircraftKind(f) === 'military' ? 2 : f.category === 'airline' ? 1 : 0);
	for (const f of [...flights].sort((a, b) => rank(a) - rank(b))) {
		if (f.positions.length < 2) continue;
		const style = trackStyle(f, flagged.has(f.id), flagged.size > 0);
		page.drawSvgPath(new Spline(f.positions.map((p) => ({ t: p.t, v: [p.lat, p.lon] }))).svgPath(toSvg), {
			x: cx,
			y: cy,
			borderColor: style.color,
			borderWidth: style.width,
			borderOpacity: style.opacity
		});
	}

	// Numbered to match the event list, so a reader can move between the two.
	incidents.forEach((inc, i) => {
		const [mx, my] = toPage([(inc.posA[0] + inc.posB[0]) / 2, (inc.posA[1] + inc.posB[1]) / 2]);
		drawEventMarker(page, fonts, i + 1, mx, my);
	});

	// The ring goes on last so it stays legible through any traffic beneath it.
	if (view.ring) page.drawCircle({ x: cx, y: cy, size: view.ring * pxPerNm, borderColor: INK, borderWidth: 1, borderOpacity: 0.55 });

	page.pushOperators(popGraphicsState());
	page.drawRectangle({ x, y: bottom, width: size, height: size, borderColor: HAIRLINE, borderWidth: 1 });

	if (!flights.some((f) => f.positions.length > 1)) {
		const msg = 'Flight paths for this night are not available.';
		text(page, msg, { x: cx - fonts.regular.widthOfTextAtSize(msg, 9) / 2, y: cy, size: 9, font: fonts.regular, color: INK60 });
	}
}

function drawLegend(page: PDFPage, fonts: Fonts, airport: AirportConfig, flights: Flight[], top: number, credit: boolean): number {
	const stroke = (color: Color, thickness: number, opacity: number) => (p: PDFPage, sx: number, sy: number) =>
		p.drawLine({ start: { x: sx, y: sy }, end: { x: sx + 14, y: sy }, thickness, color, opacity });

	const items: { label: string; swatch: (p: PDFPage, x: number, y: number) => void }[] = [
		{ label: 'Passenger airline', swatch: stroke(ACCENT, 2, 1) },
		{ label: 'Private and training aircraft', swatch: stroke(INK, 1.5, 0.6) }
	];
	if (flights.some((f) => aircraftKind(f) === 'military')) items.push({ label: 'Military', swatch: stroke(MILITARY, 2, 0.9) });
	if (airport.runways?.length) {
		items.push({
			label: 'FAA runway layout',
			swatch: (p, sx, sy) => p.drawRectangle({ x: sx, y: sy - 2, width: 14, height: 4, color: RUNWAY, opacity: 0.95 })
		});
	}
	items.push({
		label: 'Flagged event, numbered below',
		swatch: (p, sx, sy) => {
			p.drawLine({ start: { x: sx, y: sy }, end: { x: sx + 14, y: sy }, thickness: 1.6, color: INK, opacity: 0.95 });
			p.drawCircle({ x: sx + 7, y: sy, size: 4.2, color: ACCENT });
		}
	});
	items.push({ label: 'Range ring', swatch: (p, sx, sy) => p.drawCircle({ x: sx + 7, y: sy, size: 4, borderColor: INK, borderWidth: 1, borderOpacity: 0.55 }) });

	const perRow = 3;
	const colW = CONTENT_W / perRow;
	items.forEach((item, i) => {
		const y = top - Math.floor(i / perRow) * 11;
		const x = MARGIN + (i % perRow) * colW;
		item.swatch(page, x, y);
		text(page, item.label.toUpperCase(), { x: x + 20, y: y - 2, size: 6, font: fonts.bold, color: INK60 });
	});
	const rows = Math.ceil(items.length / perRow);
	const y = top - (rows - 1) * 11;
	if (credit) textRight(page, TILE_ATTRIBUTION, { right: PAGE_W - MARGIN, y: y - 13, size: 5.5, font: fonts.regular, color: INK45 });
	return y - (credit ? 32 : 24);
}

interface StatCell {
	value: string;
	label: string;
	accent?: boolean;
}

function drawStats(page: PDFPage, fonts: Fonts, cells: StatCell[], top: number): number {
	let y = sectionLabel(page, fonts, 'That night, in total', MARGIN, top, CONTENT_W);
	const colW = CONTENT_W / cells.length;
	let lowest = y;
	cells.forEach((cell, i) => {
		const x = MARGIN + i * colW + (i > 0 ? 8 : 0);
		if (i > 0) page.drawLine({ start: { x: MARGIN + i * colW - 6, y: y + 5 }, end: { x: MARGIN + i * colW - 6, y: y - 21 }, thickness: 1, color: HAIRLINE });
		text(page, cell.value, { x, y, size: 17, font: fonts.bold, color: cell.accent ? ACCENT : INK });
		lowest = Math.min(lowest, caption(page, fonts, cell.label, x, y - 12, colW - 14));
	});
	return lowest - 10;
}

interface CardFigure {
	value: string;
	caption: string;
}

interface CardLayout {
	height: number;
	severity: string;
	time: string;
	pair: string;
	figures: [CardFigure, CardFigure];
	captions: [string[], string[]];
	/** Matches the numbered marker on the charts. */
	number: number;
}

const CARD_PAD_L = 13;
const CARD_PAD_R = 10;
/** Matches the web card's flex gap: the two figures sit together, not spread. */
const CARD_FIG_GAP = 22;
const CAPTION_MAX = (COL_W - CARD_PAD_L - CARD_PAD_R - CARD_FIG_GAP) / 2;

function layoutCard(incident: Incident, number: number, identA: string, identB: string, tz: string, fonts: Fonts): CardLayout {
	const wake = incident.kind === 'wake-turbulence';
	const figures: [CardFigure, CardFigure] = wake
		? [
				{ value: `${incident.lateralNm} NM`, caption: `In trail · required ${incident.requiredNm} NM` },
				{ value: `${incident.trailSeconds}s`, caption: `Behind leader · CWT ${incident.leaderCategory} to ${incident.followerCategory}` }
			]
		: [
				{ value: `${incident.lateralNm} NM`, caption: `Less than ${SEPARATION_LATERAL_NM} NM` },
				{ value: `${incident.verticalFt.toLocaleString('en-US')}'`, caption: `Less than ${fmt(SEPARATION_VERTICAL_FT)}'` }
			];
	const captions: [string[], string[]] = [
		wrap(fonts.regular, 6, figures[0].caption.toUpperCase(), CAPTION_MAX),
		wrap(fonts.regular, 6, figures[1].caption.toUpperCase(), CAPTION_MAX)
	];
	return {
		height: 46 + Math.max(captions[0].length, captions[1].length) * 8,
		severity: wake ? 'Wake turbulence' : incident.severity === 'very-close' ? 'Very close' : 'Close approach',
		time: localTime(tz, incident.t),
		pair: `${identA} × ${identB}`,
		figures,
		captions,
		number
	};
}

function drawCard(page: PDFPage, fonts: Fonts, card: CardLayout, x: number, yTop: number) {
	const bottom = yTop - card.height;
	page.drawRectangle({ x, y: bottom, width: COL_W, height: card.height, color: ACCENT_TINT });
	page.drawRectangle({ x, y: bottom, width: 3, height: card.height, color: ACCENT });

	const cx = x + CARD_PAD_L;
	let y = yTop - 12;
	drawEventMarker(page, fonts, card.number, cx + 5.4, y + 2.2);
	text(page, card.severity.toUpperCase(), { x: cx + 16, y, size: 7, font: fonts.bold, color: ACCENT_TEXT });
	textRight(page, card.time, { right: x + COL_W - CARD_PAD_R, y, size: 7, font: fonts.regular, color: INK45 });
	y -= 14;
	text(page, card.pair, { x: cx, y, size: 11, font: fonts.bold, color: INK });
	y -= 15;
	let fx = cx;
	card.figures.forEach((fig, i) => {
		text(page, fig.value, { x: fx, y, size: 12, font: fonts.bold, color: ACCENT });
		let ly = y - 10;
		for (const line of card.captions[i]) {
			text(page, line, { x: fx, y: ly, size: 6, font: fonts.regular, color: INK60 });
			ly -= 8;
		}
		const block = Math.max(fonts.bold.widthOfTextAtSize(safe(fig.value), 12), ...card.captions[i].map((l) => fonts.regular.widthOfTextAtSize(l, 6)));
		fx += block + CARD_FIG_GAP;
	});
}

export interface NightlyReportInput {
	detail: AirportDetail;
	/** Flight id → display label, from `identsFor(detail.incidents)`. */
	idents: Record<string, string>;
	/** Cached base-map tiles per entry in `MAP_VIEWS`; omit for charts on plain ground. */
	tiles?: ViewTile[][];
	/** Site origin, so the footer can point back at the interactive replay. */
	origin?: string;
	generatedAt?: number;
}

export async function renderNightlyReportPdf({ detail, idents, tiles = [], origin, generatedAt = Date.now() }: NightlyReportInput): Promise<Uint8Array> {
	const { airport, flights, incidents, nightSummary } = detail;
	const night = detail.selectedNight;
	if (!night) throw new Error('nightly report needs a night to report on');

	const doc = await PDFDocument.create();
	doc.setTitle(`${airport.code} — Night of ${nightLabelLong(night)}`);
	doc.setSubject(`Flights and close approaches at ${airport.code} while the tower was closed`);
	doc.setCreator('Dark Towers');
	doc.setProducer('Dark Towers');
	const fonts: Fonts = {
		regular: await doc.embedFont(StandardFonts.Helvetica),
		bold: await doc.embedFont(StandardFonts.HelveticaBold)
	};

	// Embed each view's tiles once; one that will not decode is simply left out,
	// which at worst means a chart on plain ground.
	const placed: PlacedTile[][] = [];
	for (let i = 0; i < MAP_VIEWS.length; i++) {
		const out: PlacedTile[] = [];
		for (const t of tiles[i] ?? []) {
			try {
				out.push({ image: await doc.embedPng(t.png), north: t.north, south: t.south, west: t.west, east: t.east });
			} catch {
				/* skip an undecodable tile */
			}
		}
		placed.push(out);
	}

	const page1 = addPage(doc);
	const liveUrl = origin ? `${origin}/airport/${airport.code}?night=${night}` : null;
	let y = drawHeader(doc, page1, fonts, airport, night, generatedAt, liveUrl);
	y = drawFacts(page1, fonts, airport, y);

	const nightFlights = nightSummary?.flights ?? flights.length;
	const wakeEvents = nightSummary?.wakeIncidents ?? incidents.filter((i) => i.kind === 'wake-turbulence').length;
	// "3 (1)" — the parenthetical counts events with a passenger airline on at least one side.
	const withAirline = (rows: Incident[]) => rows.filter((i) => i.airlineInvolved).length;
	const airlineApproaches = withAirline(incidents.filter((i) => i.kind !== 'wake-turbulence'));
	const airlineWake = withAirline(incidents.filter((i) => i.kind === 'wake-turbulence'));
	const withCount = (total: number, airline: number) => (airline ? `${fmt(total)} (${fmt(airline)})` : fmt(total));
	const stats: StatCell[] = [
		{ value: fmt(nightFlights), label: 'Flights' },
		{ value: fmt(nightSummary?.arrivals ?? flights.filter((f) => f.direction === 'arrival').length), label: 'Arrivals' },
		{ value: fmt(nightSummary?.departures ?? flights.filter((f) => f.direction === 'departure').length), label: 'Departures' },
		{ value: fmt(nightSummary?.airline ?? flights.filter((f) => f.category === 'airline').length), label: 'Passenger airline' },
		{ value: fmt(nightSummary?.private ?? flights.filter((f) => f.category === 'private').length), label: 'Private and training' },
		{ value: withCount(nightSummary?.incidents ?? incidents.filter((i) => i.kind !== 'wake-turbulence').length, airlineApproaches), label: 'Close approaches', accent: true }
	];
	if (wakeEvents) stats.push({ value: withCount(wakeEvents, airlineWake), label: 'Wake turbulence', accent: true });
	y = drawStats(page1, fonts, stats, y);

	for (const line of wrap(
		fonts.regular,
		7.5,
		`Close approach: two aircraft within ${SEPARATION_LATERAL_NM} nautical miles and less than ${fmt(SEPARATION_VERTICAL_FT)} feet apart at the same moment, tower closed. Wake turbulence: an aircraft following a heavier one closer than the in-trail spacing a controller would apply. A count in parentheses is how many of those events had a passenger airline on at least one side.`,
		CONTENT_W
	)) {
		text(page1, line, { x: MARGIN, y, size: 7.5, font: fonts.regular, color: INK60 });
		y -= 10;
	}
	y -= 12;

	// The charts read after the figures they illustrate.
	MAP_VIEWS.forEach((view: MapView, i: number) => {
		const x = MARGIN + i * (COL_W + COL_GAP);
		text(page1, view.caption.toUpperCase(), { x, y, size: 6.5, font: fonts.bold, color: INK45 });
		drawMap(page1, fonts, { airport, flights, incidents, tiles: placed[i], view, x, yTop: y - 8, size: COL_W });
	});
	y = drawLegend(page1, fonts, airport, flights, y - 8 - COL_W - 12, placed.some((list) => list.length > 0));

	// Cards flow down two columns of one width, on this page and any after it.
	let page = page1;
	const cardsTop = sectionLabel(page1, fonts, 'Flagged events this night', MARGIN, y, CONTENT_W);
	let columns: Column[] = [
		{ x: MARGIN, top: cardsTop },
		{ x: MARGIN + COL_W + COL_GAP, top: cardsTop }
	];
	let index = 0;
	y = cardsTop;

	if (!incidents.length) {
		const lines = wrap(fonts.regular, 9, `No separation or wake-turbulence events were detected this night, across all ${fmt(nightFlights)} flights.`, COL_W - 24);
		const height = 22 + lines.length * 12;
		page1.drawRectangle({ x: MARGIN, y: y - height, width: COL_W, height, color: GROUND_ALT });
		let ly = y - 18;
		for (const line of lines) {
			text(page1, line, { x: MARGIN + 12, y: ly, size: 9, font: fonts.regular, color: INK60 });
			ly -= 12;
		}
	}

	// Lay every card out first: knowing the whole list lets a page that can hold
	// what is left balance its columns instead of filling the first one to the
	// floor and leaving the second empty.
	const cards = incidents.map((inc, i) => layoutCard(inc, i + 1, idents[inc.flightA] ?? '?', idents[inc.flightB] ?? '?', airport.tz, fonts));

	/** How many of `cards` from `start` fit a column `height` tall. */
	const fitCount = (start: number, height: number) => {
		let used = 0;
		let n = 0;
		for (let i = start; i < cards.length; i++) {
			const need = cards[i].height + (n ? CARD_GAP : 0);
			if (used + need > height) break;
			used += need;
			n++;
		}
		return n;
	};

	while (index < cards.length) {
		const height = columns[0].top - BOTTOM;
		const capacity = columns.reduce((total, _, i) => total + fitCount(index + total, height), 0);
		const left = cards.length - index;
		// Everything that remains fits here, so spread it evenly across the columns.
		const perColumn = left <= capacity ? Math.ceil(left / columns.length) : 0;

		for (const column of columns) {
			const take = perColumn || fitCount(index, height);
			let cy = column.top;
			for (let n = 0; n < take && index < cards.length; n++) {
				drawCard(page, fonts, cards[index], column.x, cy);
				cy -= cards[index].height + CARD_GAP;
				index++;
			}
		}

		if (index < cards.length) {
			page = addPage(doc);
			text(page, `${airport.code} — Night of ${nightLabelLong(night)} (continued)`, { x: MARGIN, y: PAGE_H - MARGIN, size: 9, font: fonts.bold, color: INK60 });
			page.drawLine({ start: { x: MARGIN, y: PAGE_H - MARGIN - 8 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - 8 }, thickness: 1, color: HAIRLINE });
			const top = PAGE_H - MARGIN - 22;
			columns = [
				{ x: MARGIN, top },
				{ x: MARGIN + COL_W + COL_GAP, top }
			];
		}
	}

	const pages = doc.getPages();
	const source = `${airport.code} · Night of ${nightLabelLong(night)}`;
	pages.forEach((p, i) => {
		p.drawLine({ start: { x: MARGIN, y: MARGIN + 13 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 13 }, thickness: 1, color: HAIRLINE });
		text(p, source, { x: MARGIN, y: MARGIN + 3, size: 7, font: fonts.regular, color: INK45 });
		textRight(p, `Page ${i + 1} of ${pages.length}`, { right: PAGE_W - MARGIN, y: MARGIN + 3, size: 7, font: fonts.regular, color: INK45 });
	});

	return doc.save();
}
