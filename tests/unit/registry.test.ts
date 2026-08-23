import { describe, expect, it } from 'vitest';
import { airframeOf, buildRegistry, lookupRegistry, registryKey } from '../../src/lib/registry';
import { describeFromRegistry } from '../../src/lib/server/pipeline';
import type { Flight } from '../../src/lib/types';

const ACFTREF = `﻿CODE,MFR,MODEL,TYPE-ACFT,TYPE-ENG,AC-CAT,
1182220,BELL TEXTRON CANADA LTD       ,429                 ,6,3 ,1,
2072739,CESSNA                        ,172S                ,4,1 ,1,
9999999,UNUSED                        ,X                   ,4,1 ,1,
`;
const MASTER = [
	'﻿N-NUMBER,SERIAL NUMBER,MFR MDL CODE,ENG MFR MDL,YEAR MFR,',
	'433LF,57484                         ,1182220,52299,2023,',
	'65KD,172S1234                      ,2072739,41512,2005,',
	'1AB,x,0000000,,,'
];

describe('registry', () => {
	it('maps TYPE-ACFT codes to airframes', () => {
		expect(airframeOf('4')).toBe('airplane');
		expect(airframeOf('6')).toBe('helicopter');
		expect(airframeOf('2')).toBe('other');
	});
	it('normalises tail numbers', () => {
		expect(registryKey('N433LF')).toBe('433LF');
		expect(registryKey('n65kd')).toBe('65KD');
		expect(registryKey('C-GABC')).toBeNull();
		expect(registryKey(null)).toBeNull();
	});
	it('builds a compact table keeping only used models', async () => {
		const data = await buildRegistry('2026-08-21', ACFTREF, MASTER);
		expect(Object.keys(data.models).sort()).toEqual(['1182220', '2072739']);
		expect(data.tails['433LF']).toBe('1182220');
		expect(lookupRegistry(data, 'N433LF')).toEqual({ manufacturer: 'BELL TEXTRON CANADA LTD', model: '429', airframe: 'helicopter', label: 'BELL 429' });
		expect(lookupRegistry(data, 'N1AB')).toBeNull();
	});
	it('fills blank types and airframes from the registry without overriding FlightAware', async () => {
		const data = await buildRegistry('2026-08-21', ACFTREF, MASTER);
		const lookup = (t: string | null | undefined) => lookupRegistry(data, t);
		const f = (tail: string, type: string | null): Flight => ({
			id: tail, airport: 'KPAE', night: '2026-08-15', ident: tail, tail, type, category: 'private', operator: null, operatorName: null, operatorShort: null,
			direction: 'arrival', eventTime: 0, otherCode: null, otherName: null, otherCity: null, positions: []
		});
		expect(describeFromRegistry(f('N433LF', null), lookup)).toMatchObject({ type: 'BELL 429', airframe: 'helicopter' });
		expect(describeFromRegistry(f('N65KD', 'C172'), lookup)).toMatchObject({ type: 'C172', airframe: 'airplane' });
		expect(describeFromRegistry(f('N1AB', null), lookup).airframe).toBeUndefined();
	});
});
