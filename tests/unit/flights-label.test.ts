import { describe, expect, it } from 'vitest';
import { flightKind, flightLabel, flightSubLabel } from '../../src/lib/flights';

describe('flight labels', () => {
	const asa = { ident: 'ASA1712', tail: 'N273AK', operator: 'ASA', operatorShort: 'Alaska', operatorName: 'Alaska Airlines', category: 'airline' as const };
	it('turns callsign into airline + number when the operator is known', () => {
		expect(flightLabel(asa)).toBe('Alaska 1712');
		expect(flightSubLabel(asa)).toBe('ASA1712 · N273AK');
		expect(flightKind(asa)).toBe('Alaska Airlines');
	});
	it('falls back to the callsign when the operator is unknown or the ident does not start with it', () => {
		expect(flightLabel({ ident: 'ASA1712', operator: 'ASA', operatorShort: null })).toBe('ASA1712');
		expect(flightLabel({ ident: 'N11571', operator: null, operatorShort: null })).toBe('N11571');
		expect(flightLabel({ ident: 'SWA8513', operator: 'ASA', operatorShort: 'Alaska' })).toBe('SWA8513');
	});
	it('private aircraft show the registration only, with no sub-label when tail equals ident', () => {
		const ga = { ident: 'N11571', tail: 'N11571', operator: null, operatorShort: null, operatorName: null, category: 'private' as const };
		expect(flightLabel(ga)).toBe('N11571');
		expect(flightSubLabel(ga)).toBeNull();
		expect(flightKind(ga)).toBe('Private or training');
		expect(flightKind({ category: 'airline', operatorName: null })).toBe('Passenger airline');
	});
});
