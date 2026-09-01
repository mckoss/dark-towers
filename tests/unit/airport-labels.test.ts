import { describe, expect, it } from 'vitest';
import { airportHoursLabel, hoursClosed, isReference, quietHoursLabel, towerHoursLabel } from '../../src/lib/airports';
import type { AirportConfig } from '../../src/lib/types';

const base: AirportConfig = {
	code: 'PAE', icao: 'KPAE', name: 'Paine Field', city: 'Everett', state: 'WA', kind: 'dark', tz: 'America/Los_Angeles',
	pos: [47.9, -122.3], elevationFt: 606, towerHours: { open: 7, close: 21 }, schedules: [], carriers: [], status: 'tracking', tracked: true
};
const reference: AirportConfig = {
	...base, code: 'BUR', icao: 'KBUR', name: 'Hollywood Burbank', city: 'Burbank', state: 'CA',
	kind: 'reference', towerHours: { open: 7, close: 22 }
};

describe('airport hours labels', () => {
	it('reads a dark airport by its tower hours', () => {
		expect(isReference(base)).toBe(false);
		expect(towerHoursLabel(base)).toBe('7:00 am – 9:00 pm');
		expect(airportHoursLabel(base)).toBe('7:00 am – 9:00 pm');
		expect(hoursClosed(base)).toBe(10);
	});

	it('reads a reference airport by its quiet hours — the gap between close and the next open', () => {
		expect(isReference(reference)).toBe(true);
		expect(quietHoursLabel(reference)).toBe('10:00 pm – 7:00 am');
		expect(airportHoursLabel(reference)).toBe('24 hours · quiet 10:00 pm – 7:00 am');
	});

	it('falls back to plain language when there is no schedule at all', () => {
		expect(towerHoursLabel({ ...base, towerHours: null })).toBe('No tower');
		expect(quietHoursLabel({ ...reference, towerHours: null })).toBe('All hours');
	});
});
