const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2024-06" → "June 2024". Client-safe. */
export function monthLabel(month: string): string {
	const [y, m] = month.split('-').map(Number);
	return `${MONTHS[m - 1]} ${y}`;
}
