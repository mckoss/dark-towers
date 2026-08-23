import { describe, expect, it } from 'vitest';
import { assignLanes } from '../../src/lib/replay';

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
