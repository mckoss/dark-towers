/** Median of a list; undefined for an empty list. */
export function median(xs: number[]): number | undefined {
	if (!xs.length) return undefined;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}
