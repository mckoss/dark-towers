import { describe, expect, it } from 'vitest';
import { replayTrackVisibility, TRACK_VISIBILITY_MARGIN_MS } from '../../src/lib/track-visibility';

describe('whole-night track visibility', () => {
	const from = 100_000;
	const to = 200_000;

	it('shows every complete track only in the untouched initial overview', () => {
		expect(replayTrackVisibility(0, from, to, false)).toBe(1);
		expect(replayTrackVisibility(300_000, from, to, false)).toBe(1);
	});

	it('fades through five simulated seconds on each side of aircraft visibility', () => {
		expect(TRACK_VISIBILITY_MARGIN_MS).toBe(5_000);
		expect(replayTrackVisibility(from - 5_000, from, to, true)).toBe(0);
		expect(replayTrackVisibility(from - 2_500, from, to, true)).toBe(0.5);
		expect(replayTrackVisibility(from, from, to, true)).toBe(1);
		expect(replayTrackVisibility(to, from, to, true)).toBe(1);
		expect(replayTrackVisibility(to + 2_500, from, to, true)).toBe(0.5);
		expect(replayTrackVisibility(to + 5_000, from, to, true)).toBe(0);
	});
});
