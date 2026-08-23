import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessRequest, buildNasr, findByCity, findByCode, towerKindOf, type NasrData } from '../../src/lib/nasr';
import { listZip, parseCsv, readZipEntry } from '../../src/lib/zip';

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/nasr.json'), 'utf8')) as NasrData;

describe('zip + csv', () => {
	it('reads stored and deflated entries and parses quoted CSV', () => {
		const buf = fs.readFileSync(path.join(__dirname, '../fixtures/mini.zip'));
		const entries = listZip(buf);
		expect(entries.map((e) => e.name).sort()).toEqual(['APT_BASE.csv', 'ATC_BASE.csv']);
		const apt = readZipEntry(buf, entries.find((e) => e.name === 'APT_BASE.csv')!).toString();
		expect(parseCsv(apt)).toEqual([
			['A', 'B'],
			['x,y', '2']
		]);
		const atc = readZipEntry(buf, entries.find((e) => e.name === 'ATC_BASE.csv')!).toString();
		expect(parseCsv(atc)).toHaveLength(201);
	});
});

describe('buildNasr', () => {
	it('joins airports to their tower record and classifies the tower', () => {
		const apt = [
			'ARPT_ID,ICAO_ID,ARPT_NAME,CITY,STATE_CODE,LAT_DECIMAL,LONG_DECIMAL,ELEV,FAR_139_TYPE_CODE,SITE_TYPE_CODE,ARPT_STATUS',
			'PAE,KPAE,"SEATTLE PAINE FLD INTL",EVERETT,WA,47.9,-122.28,606.5,I A S,A,O',
			'SEA,KSEA,SEATTLE-TACOMA INTL,SEATTLE,WA,47.4,-122.3,433,I A S,A,O',
			'MMH,KMMH,MAMMOTH YOSEMITE,"MAMMOTH LAKES",CA,37.6,-118.8,7135,I D S,A,O',
			'XYZ,,CLOSED FIELD,NOWHERE,CA,0,0,0,,A,CP'
		].join('\n');
		const atc = ['FACILITY_ID,FACILITY_TYPE,TWR_HRS,ICAO_ID', 'PAE,ATCT,0700-2100,KPAE', 'SEA,ATCT,24,KSEA'].join('\n');
		const d = buildNasr('2026-08-06', apt, atc);
		expect(Object.keys(d.airports).sort()).toEqual(['MMH', 'PAE', 'SEA']);
		expect(d.airports.PAE).toMatchObject({ icao: 'KPAE', tower: 'part-time', towerHours: '0700-2100', elevFt: 607, part139: true });
		expect(d.airports.SEA.tower).toBe('full-time');
		expect(d.airports.MMH).toMatchObject({ tower: 'none', towerHours: '' });
		expect(towerKindOf('ATCT-TRACON', '0600-2300')).toBe('part-time');
		expect(towerKindOf('NON-ATCT', '')).toBe('none');
	});
});

describe('lookups', () => {
	it('finds by FAA id or ICAO, and Part 139 airports by city', () => {
		expect(findByCode(fixture, 'pae')?.name).toMatch(/PAINE/);
		expect(findByCode(fixture, 'KPAE')?.id).toBe('PAE');
		expect(findByCode(fixture, 'ZZZ')).toBeNull();
		expect(findByCity(fixture, 'Santa Rosa, CA').map((a) => a.id)).toEqual(['STS']);
		expect(findByCity(fixture, 'Santa Rosa').map((a) => a.id)).toEqual(['STS']);
		expect(findByCity(fixture, 'Atlantis')).toEqual([]);
	});
});

describe('assessRequest', () => {
	it('accepts part-time and no-tower airports, rejects 24-hour towers and unknowns', () => {
		expect(assessRequest(fixture, 'STS')).toMatchObject({ ok: true, kind: 'part-time' });
		expect(assessRequest(fixture, 'STS').message).toMatch(/0700-2000/);
		expect(assessRequest(fixture, 'MMH')).toMatchObject({ ok: true, kind: 'none' });
		expect(assessRequest(fixture, 'KSEA')).toMatchObject({ ok: false, kind: 'full-time' });
		expect(assessRequest(fixture, 'SEA').message).toMatch(/24 hours/);
		expect(assessRequest(fixture, 'ZZZZ')).toMatchObject({ ok: false, kind: 'unknown' });
		expect(assessRequest(fixture, 'Redmond, OR')).toMatchObject({ ok: true, airport: { id: 'RDM' } });
		expect(assessRequest(null, 'STS')).toMatchObject({ ok: true, kind: 'unverified' });
	});
});

describe('cycles', () => {
	it('computes the 28-day cycle in effect and its download URL', async () => {
		const { cycleFor, cycleUrl } = await import('../../src/lib/server/nasr');
		expect(cycleFor(Date.UTC(2026, 7, 6))).toBe('2026-08-06');
		expect(cycleFor(Date.UTC(2026, 7, 22))).toBe('2026-08-06');
		expect(cycleFor(Date.UTC(2026, 8, 3))).toBe('2026-09-03');
		expect(cycleFor(Date.UTC(2026, 6, 20))).toBe('2026-07-09');
		expect(cycleUrl('2026-08-06')).toBe('https://nfdc.faa.gov/webContent/28DaySub/extra/06_Aug_2026_CSV.zip');
	});
});
