import { describe, expect, it } from 'vitest';
import { aircraftKind, assignLanes, pairColors, silhouetteFor } from '../../src/lib/replay';

describe('assignLanes', () => {
	it('keeps well-spaced marks on one row and drops colliding ones to the second', () => {
		expect(assignLanes([0, 100, 200], 50)).toEqual([0, 0, 0]);
		expect(assignLanes([0, 30, 200], 50)).toEqual([0, 1, 0]);
		// Three within one label width: the third has no free row and loses its label.
		expect(assignLanes([0, 30, 45], 50)).toEqual([0, 1, -1]);
		// Spread out enough and the third returns to row 0.
		expect(assignLanes([0, 30, 60], 50)).toEqual([0, 1, 0]);
		// Works regardless of input order.
		expect(assignLanes([30, 0], 50)).toEqual([1, 0]);
	});
});

describe('aircraftKind / silhouetteFor', () => {
	it('spots helicopters and military by type designator or callsign', () => {
		expect(aircraftKind({ category: 'private', type: 'H269', ident: 'N123AB' })).toBe('helicopter');
		expect(aircraftKind({ category: 'private', type: 'EC35', ident: 'N50HL' })).toBe('helicopter');
		expect(aircraftKind({ category: 'private', type: 'C17', ident: 'RCH451' })).toBe('military');
		expect(aircraftKind({ category: 'private', type: 'B738', ident: 'NAVY12' })).toBe('military');
		expect(aircraftKind({ category: 'private', type: 'C172', ident: 'N12345' })).toBe('private');
		expect(aircraftKind({ category: 'airline', type: 'E75L', ident: 'QXE2150' })).toBe('airline');
		expect(aircraftKind({ category: 'airline', type: 'E75L', ident: 'SKW3452' })).toBe('airline');
		expect(aircraftKind({ category: 'private', type: 'E75L', ident: 'N1' })).toBe('private');
		expect(aircraftKind({ category: 'airline', type: 'B738', ident: 'SAM204' })).toBe('airline');
		expect(silhouetteFor({ category: 'private', type: 'R44', ident: 'N1RH' })).toBe('helicopter');
		expect(silhouetteFor({ category: 'private', type: 'P8', ident: 'N0' })).toBe('military');
		expect(silhouetteFor({ category: 'airline', type: 'E75L' })).toBe('airliner');
		expect(silhouetteFor({ category: 'private', type: 'C172' })).toBe('light');
		// Registry-described helicopters have no ICAO code, only an airframe.
		expect(silhouetteFor({ category: 'private', type: 'BELL 429', airframe: 'helicopter' })).toBe('helicopter');
	});
});

describe('pairColors', () => {
	it('uses red only for aircraft categorized as passenger airlines', () => {
		expect(pairColors({ category: 'private' }, { category: 'private' })).toEqual(['ink', 'ink']);
		expect(pairColors({ category: 'airline' }, { category: 'private' })).toEqual(['accent', 'ink']);
		expect(pairColors({ category: 'private' }, { category: 'airline' })).toEqual(['ink', 'accent']);
		expect(pairColors({ category: 'airline' }, { category: 'airline' })).toEqual(['accent', 'accent']);
	});
});
