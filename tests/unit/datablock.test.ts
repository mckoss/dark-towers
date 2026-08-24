import { describe, expect, it } from 'vitest';
import { dataBlockLines } from '../../src/lib/datablock';

describe('dataBlockLines', () => {
	it('keeps raw ADS-B altitude in the ATC line and corrected AGL below', () => {
		const [, atc, plain] = dataBlockLines({ label: 'N123AB · C172', altFt: 5100, plainAltFt: 4250, altUnit: 'AGL', gsKt: 123, trend: -1 });
		expect(atc).toBe('051↓ 123');
		expect(plain).toBe('4,250 ft AGL ↓ · 123 kt');
	});
});
