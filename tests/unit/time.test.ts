import { describe, expect, it } from 'vitest';
import { addDays, localParts, nightLabel, nightOf, nightWindow, tzOffsetMinutes, zonedToUtc } from '$lib/time';

const LA = 'America/Los_Angeles';
const PAE_TOWER = { open: 7, close: 21 };

describe('tzOffsetMinutes', () => {
	it('is -420 for Los Angeles in summer (PDT)', () => {
		expect(tzOffsetMinutes(LA, Date.UTC(2026, 6, 15, 12))).toBe(-420);
	});
	it('is -480 for Los Angeles in winter (PST)', () => {
		expect(tzOffsetMinutes(LA, Date.UTC(2026, 0, 15, 12))).toBe(-480);
	});
	it('is 0 for UTC', () => {
		expect(tzOffsetMinutes('UTC', Date.UTC(2026, 6, 15, 12))).toBe(0);
	});
});

describe('zonedToUtc / localParts', () => {
	it('round-trips a summer wall-clock time', () => {
		const ms = zonedToUtc(LA, 2026, 8, 14, 21, 30);
		expect(ms).toBe(Date.UTC(2026, 7, 15, 4, 30));
		const p = localParts(LA, ms);
		expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 8, 14, 21, 30]);
	});
	it('round-trips a winter wall-clock time', () => {
		const ms = zonedToUtc(LA, 2026, 1, 5, 3, 15);
		const p = localParts(LA, ms);
		expect([p.year, p.month, p.day, p.hour, p.minute]).toEqual([2026, 1, 5, 3, 15]);
		expect(ms).toBe(Date.UTC(2026, 0, 5, 11, 15));
	});
	it('treats hour 24 as midnight ending the day', () => {
		expect(zonedToUtc(LA, 2026, 8, 14, 24)).toBe(zonedToUtc(LA, 2026, 8, 15, 0));
	});
	it('reports the weekday', () => {
		// 2026-08-18 is a Tuesday.
		expect(localParts(LA, zonedToUtc(LA, 2026, 8, 18, 12)).weekday).toBe(2);
	});
});

describe('nightWindow', () => {
	it('PAE 2026-08-14 is 04:00Z → 14:00Z on Aug 15 (matches the Colab notebook)', () => {
		const w = nightWindow(LA, PAE_TOWER, '2026-08-14');
		expect(w.night).toBe('2026-08-14');
		expect(new Date(w.start).toISOString()).toBe('2026-08-15T04:00:00.000Z');
		expect(new Date(w.end).toISOString()).toBe('2026-08-15T14:00:00.000Z');
		expect((w.end - w.start) / 3_600_000).toBe(10);
	});
	it('is 11 hours long across the fall-back DST change (clocks go back 2026-11-01 02:00 local)', () => {
		// The night that contains the change is the one that began on the
		// evening of Oct 31: 21:00 PDT → 07:00 PST.
		const w = nightWindow(LA, PAE_TOWER, '2026-10-31');
		expect(new Date(w.start).toISOString()).toBe('2026-11-01T04:00:00.000Z');
		expect(new Date(w.end).toISOString()).toBe('2026-11-01T15:00:00.000Z');
		expect((w.end - w.start) / 3_600_000).toBe(11);
		// The following night is back to a normal 10 hours, entirely in PST.
		const next = nightWindow(LA, PAE_TOWER, '2026-11-01');
		expect((next.end - next.start) / 3_600_000).toBe(10);
		expect(new Date(next.start).toISOString()).toBe('2026-11-02T05:00:00.000Z');
	});
	it('is 9 hours long across the spring-forward change (2026-03-08)', () => {
		const w = nightWindow(LA, PAE_TOWER, '2026-03-07');
		expect((w.end - w.start) / 3_600_000).toBe(9);
	});
	it('with no tower is the full local day', () => {
		const w = nightWindow(LA, null, '2026-08-14');
		expect(w.start).toBe(zonedToUtc(LA, 2026, 8, 14, 0));
		expect(w.end).toBe(zonedToUtc(LA, 2026, 8, 15, 0));
		expect((w.end - w.start) / 3_600_000).toBe(24);
	});
	it('with no tower spans 25 hours on the fall-back day', () => {
		const w = nightWindow(LA, null, '2026-11-01');
		expect((w.end - w.start) / 3_600_000).toBe(25);
	});
});

describe('nightOf', () => {
	it('maps 22:30 local to that date', () => {
		expect(nightOf(LA, PAE_TOWER, zonedToUtc(LA, 2026, 8, 14, 22, 30))).toBe('2026-08-14');
	});
	it('maps 03:00 local to the previous date', () => {
		expect(nightOf(LA, PAE_TOWER, zonedToUtc(LA, 2026, 8, 15, 3, 0))).toBe('2026-08-14');
	});
	it('maps 12:00 local (tower open) to null', () => {
		expect(nightOf(LA, PAE_TOWER, zonedToUtc(LA, 2026, 8, 14, 12, 0))).toBeNull();
	});
	it('is consistent with nightWindow at the boundaries', () => {
		const w = nightWindow(LA, PAE_TOWER, '2026-08-14');
		expect(nightOf(LA, PAE_TOWER, w.start)).toBe('2026-08-14');
		expect(nightOf(LA, PAE_TOWER, w.start - 1)).toBeNull();
		expect(nightOf(LA, PAE_TOWER, w.end - 1)).toBe('2026-08-14');
		expect(nightOf(LA, PAE_TOWER, w.end)).toBeNull();
	});
	it('maps any hour to the local date when there is no tower', () => {
		expect(nightOf(LA, null, zonedToUtc(LA, 2026, 8, 15, 3, 0))).toBe('2026-08-15');
		expect(nightOf(LA, null, zonedToUtc(LA, 2026, 8, 14, 12, 0))).toBe('2026-08-14');
	});
});

describe('addDays', () => {
	it('crosses month boundaries', () => {
		expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
	});
	it('crosses year boundaries', () => {
		expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
		expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
	});
	it('handles leap years', () => {
		expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
		expect(addDays('2028-02-29', 1)).toBe('2028-03-01');
	});
	it('is unaffected by DST (days are calendar days)', () => {
		expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
		expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
	});
});

describe('nightLabel', () => {
	it('formats as weekday, month day', () => {
		expect(nightLabel('2026-08-18')).toBe('Tuesday, August 18');
		expect(nightLabel('2026-08-17')).toBe('Monday, August 17');
		expect(nightLabel('2026-01-01')).toBe('Thursday, January 1');
	});
});
