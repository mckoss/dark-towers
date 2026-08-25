import { describe, expect, it } from 'vitest';
import {
	cardinalDirectionAway,
	layoutReplayLabels,
	replayLabelPlacementIsClear,
	replayLeaderEnd,
	REPLAY_LABEL_FADE_MS,
	REPLAY_LABEL_SPEED_RATIO,
	stabilizeReplayLabelPlacement,
	type LabelSlot,
	type ReplayLabelPlacement
} from '../../src/lib/replay-label-layout';

describe('layoutReplayLabels', () => {
	it('uses a half-second datablock fade', () => {
		expect(REPLAY_LABEL_FADE_MS).toBe(500);
	});

	it('chooses the dominant cardinal direction away from the airport', () => {
		expect(cardinalDirectionAway({ x: 40, y: 90 }, { x: 100, y: 100 })).toEqual({ x: -1, y: 0 });
		expect(cardinalDirectionAway({ x: 110, y: 170 }, { x: 100, y: 100 })).toEqual({ x: 0, y: 1 });
	});

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

	it('keeps an inbound block visible, then moves it to the airport-opposite side', () => {
		const target = { id: 'a', x: -100, y: 150, width: 100, height: 48, radius: 18, preferred: { x: -1, y: 0 } };
		const [offscreen] = layoutReplayLabels([target], { width: 400, height: 300 });
		expect(offscreen.slot).toBe('e2');

		const previous = new Map<string, LabelSlot>([['a', offscreen.slot]]);
		const [entering] = layoutReplayLabels([{ ...target, x: 30 }], { width: 400, height: 300 }, previous);
		expect(entering.slot).toBe('e');
		expect(entering.x - 30).toBeLessThan(offscreen.x - target.x);

		const [clear] = layoutReplayLabels([{ ...target, x: 150 }], { width: 400, height: 300 }, new Map([['a', entering.slot]]));
		expect(clear.slot).toBe('w');
	});

	it('points the leader to the nearest edge of the datablock', () => {
		expect(replayLeaderEnd({ x: 130, y: 80, width: 100, height: 50 }, { x: 100, y: 100 })).toEqual({ x: 30, y: 0 });
		expect(replayLeaderEnd({ x: 20, y: 140, width: 100, height: 50 }, { x: 100, y: 100 })).toEqual({ x: 0, y: 40 });
	});

	it('keeps a clear datablock pinned while its aircraft moves', () => {
		const desired: ReplayLabelPlacement = { id: 'a', slot: 'e', x: 180, y: 100, width: 100, height: 48 };
		const previous = {
			placement: { ...desired, x: 120 },
			aircraft: { x: 90, y: 124 }
		};
		expect(stabilizeReplayLabelPlacement(desired, previous, { x: 110, y: 124 }, false)).toEqual(previous.placement);
	});

	it('caps necessary datablock motion at half the aircraft travel', () => {
		expect(REPLAY_LABEL_SPEED_RATIO).toBe(0.5);
		const desired: ReplayLabelPlacement = { id: 'a', slot: 'e', x: 200, y: 100, width: 100, height: 48 };
		const previous = {
			placement: { ...desired, x: 100, slot: 'w' as const },
			aircraft: { x: 90, y: 124 }
		};
		const moved = stabilizeReplayLabelPlacement(desired, previous, { x: 110, y: 124 }, true);
		expect(moved.x).toBe(110);
		expect(moved.y).toBe(100);
		expect(moved.slot).toBe('w');
	});

	it('only relocates pinned datablocks that clip, overlap an aircraft, or overlap another block', () => {
		const placement: ReplayLabelPlacement = { id: 'a', slot: 'e', x: 120, y: 80, width: 100, height: 48 };
		const targets = [{ id: 'a', x: 80, y: 104, width: 100, height: 48, radius: 18 }];
		expect(replayLabelPlacementIsClear(placement, targets, { width: 400, height: 300 })).toBe(true);
		expect(replayLabelPlacementIsClear({ ...placement, x: 2 }, targets, { width: 400, height: 300 })).toBe(false);
		expect(replayLabelPlacementIsClear({ ...placement, x: 75 }, targets, { width: 400, height: 300 })).toBe(false);
		expect(replayLabelPlacementIsClear(placement, targets, { width: 400, height: 300 }, [{ ...placement, id: 'b' }])).toBe(false);
	});
});
