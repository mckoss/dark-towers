import { describe, expect, it } from 'vitest';
import {
	cardinalDirectionAway,
	CLOSE_APPROACH_ANGLE_STEP,
	layoutCloseApproachLabels,
	layoutReplayLabels,
	planCloseApproachLabelRoute,
	replayLeaderEnd,
	REPLAY_LABEL_FADE_MS,
	type LabelSlot
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

	it('jointly places close-approach blocks without the old 16 fixed slots', () => {
		expect(360 / CLOSE_APPROACH_ANGLE_STEP).toBeGreaterThan(16);
		const placements = layoutCloseApproachLabels(
			[
				{ id: 'a', x: 200, y: 150, width: 130, height: 58, radius: 20 },
				{ id: 'b', x: 204, y: 153, width: 130, height: 58, radius: 20 }
			],
			{ width: 500, height: 320 }
		);
		const [a, b] = placements;
		const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
		const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
		expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
		for (const placement of placements) {
			expect(placement.radial).toBe(0);
			expect(placement.angle % CLOSE_APPROACH_ANGLE_STEP).toBe(0);
		}
	});

	it('plans across the whole route and lets a datablock move less than its aircraft', () => {
		const frames = Array.from({ length: 9 }, (_, index) => [
			{ id: 'a', x: 100 + index * 24, y: 120, width: 110, height: 52, radius: 18 },
			{ id: 'b', x: 390, y: 240, width: 110, height: 52, radius: 18 }
		]);
		const plan = planCloseApproachLabelRoute(frames, { width: 520, height: 320 });
		expect(plan).toHaveLength(frames.length);
		for (const placements of plan) {
			const [a, b] = placements;
			const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
			const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
			expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
		}
		const aircraftTravel = frames.at(-1)![0].x - frames[0][0].x;
		const blockTravel = plan.slice(1).reduce((sum, placements, index) => sum + Math.hypot(placements[0].x - plan[index][0].x, placements[0].y - plan[index][0].y), 0);
		expect(blockTravel).toBeLessThan(aircraftTravel);
	});
});
