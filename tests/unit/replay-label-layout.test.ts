import { describe, expect, it } from 'vitest';
import { layoutReplayLabels, replayLeaderEnd, type LabelSlot } from '../../src/lib/replay-label-layout';

describe('layoutReplayLabels', () => {
	it('moves nearby datablocks into non-overlapping slots inside the map', () => {
		const placements = layoutReplayLabels(
			[
				{ id: 'a', x: 200, y: 150, width: 110, height: 52, radius: 18 },
				{ id: 'b', x: 205, y: 153, width: 110, height: 52, radius: 18 }
			],
			{ width: 400, height: 300 }
		);
		expect(placements).toHaveLength(2);
		const [a, b] = placements;
		const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
		const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
		expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
		for (const placement of placements) {
			expect(placement.x).toBeGreaterThanOrEqual(6);
			expect(placement.y).toBeGreaterThanOrEqual(6);
			expect(placement.x + placement.width).toBeLessThanOrEqual(394);
			expect(placement.y + placement.height).toBeLessThanOrEqual(294);
		}
	});

	it('keeps an existing clear slot when aircraft move slightly', () => {
		const previous = new Map<string, LabelSlot>([['a', 'nw']]);
		const [placement] = layoutReplayLabels([{ id: 'a', x: 201, y: 151, width: 100, height: 48, radius: 18 }], { width: 400, height: 300 }, previous);
		expect(placement.slot).toBe('nw');
	});

	it('returns an edge-displaced datablock to the nearest slot as its aircraft enters the map', () => {
		const target = { id: 'a', x: -100, y: 150, width: 100, height: 48, radius: 18 };
		const [offscreen] = layoutReplayLabels([target], { width: 400, height: 300 });
		expect(offscreen.slot).toBe('e2');

		const previous = new Map<string, LabelSlot>([['a', offscreen.slot]]);
		const [onscreen] = layoutReplayLabels([{ ...target, x: 30 }], { width: 400, height: 300 }, previous);
		expect(onscreen.slot).toBe('e');
		expect(onscreen.x - 30).toBeLessThan(offscreen.x - target.x);
	});

	it('points the leader to the nearest edge of the datablock', () => {
		expect(replayLeaderEnd({ x: 130, y: 80, width: 100, height: 50 }, { x: 100, y: 100 })).toEqual({ x: 30, y: 0 });
		expect(replayLeaderEnd({ x: 20, y: 140, width: 100, height: 50 }, { x: 100, y: 100 })).toEqual({ x: 0, y: 40 });
	});
});
