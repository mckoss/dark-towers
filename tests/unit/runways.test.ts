import { describe, expect, it } from 'vitest';
import { distanceNm } from '../../src/lib/geo';
import { runwayOutline } from '../../src/lib/runways';
import type { Runway } from '../../src/lib/types';

describe('runwayOutline', () => {
	it('uses the FAA endpoints for length and declared runway width', () => {
		const runway: Runway = {
			id: '16R/34L',
			ends: [
				{ id: '16R', pos: [47.91308658, -122.28566763] },
				{ id: '34L', pos: [47.89664002, -122.28530252] }
			],
			lengthFt: 6000,
			widthFt: 150,
			surface: 'ASPH-CONC'
		};
		const outline = runwayOutline(runway);
		expect(outline).toHaveLength(4);
		expect(distanceNm(outline[0], outline[3]) * 6076.12).toBeCloseTo(150, 3);
		expect(distanceNm(outline[0], outline[1]) * 6076.12).toBeCloseTo(6000, -1);
	});
});
