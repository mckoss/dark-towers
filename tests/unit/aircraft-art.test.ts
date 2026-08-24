import { describe, expect, it } from 'vitest';
import { aircraftArtworkFor, aircraftArtworkForDetails } from '../../src/lib/aircraft-art';

describe('aircraft artwork', () => {
	it.each([
		['E75L', 'e175'],
		['C172', 'cessna-high-wing'],
		['B738', 'boeing-737'],
		['B38M', 'boeing-737'],
		['AS50', 'airbus-h125'],
		['C150', 'cessna-high-wing'],
		['P28A', 'piper-cherokee'],
		['C182', 'cessna-high-wing'],
		['C152', 'cessna-high-wing'],
		['B737', 'boeing-737'],
		['LJ45', 'learjet-45'],
		['S22T', 'cirrus-sr22'],
		['BELL 407', 'bell-407'],
		['C208', 'cessna-caravan'],
		['PC12', 'pilatus-pc12'],
		['H269', 'schweizer-269'],
		['SILVAIRE LUSCOMBE 8E', 'luscombe-8'],
		['SW4', 'metroliner'],
		['SR22', 'cirrus-sr22'],
		['CRJ2', 'crj-200']
	])('maps %s to %s', (type, slug) => {
		expect(aircraftArtworkFor(type)?.slug).toBe(slug);
	});

	it('uses registry descriptions and leaves unknown aircraft without a misleading image', () => {
		expect(aircraftArtworkFor(null, 'CESSNA 172S SKYHAWK')).toMatchObject({ slug: 'cessna-high-wing' });
		expect(aircraftArtworkFor('ZZZZ', 'EXPERIMENTAL HOMEBUILT')).toBeNull();
	});

	it.each([
		[{ type: 'A320', airframe: 'airplane', category: 'airline' }, 'boeing-737'],
		[{ type: 'C550', airframe: 'airplane', category: 'private' }, 'learjet-45'],
		[{ type: 'EC45', airframe: 'helicopter', category: 'private' }, 'bell-407'],
		[{ type: 'RV12', airframe: 'airplane', category: 'private' }, 'piper-cherokee'],
		[{ type: null, airframe: null, category: 'private' }, 'piper-cherokee']
	])('always chooses a representative family for recorded aircraft', (details, slug) => {
		expect(aircraftArtworkForDetails(details).slug).toBe(slug);
	});
});
