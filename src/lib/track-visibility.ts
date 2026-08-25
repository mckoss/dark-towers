export const TRACK_VISIBILITY_MARGIN_MS = 5_000;

/** Full-track opacity at a replay-clock instant, including five-second fade margins. */
export function replayTrackVisibility(at: number, from: number, to: number, replayStarted: boolean): number {
	if (!replayStarted) return 1;
	if (at <= from - TRACK_VISIBILITY_MARGIN_MS || at >= to + TRACK_VISIBILITY_MARGIN_MS) return 0;
	if (at < from) return (at - (from - TRACK_VISIBILITY_MARGIN_MS)) / TRACK_VISIBILITY_MARGIN_MS;
	if (at > to) return 1 - (at - to) / TRACK_VISIBILITY_MARGIN_MS;
	return 1;
}
