/** Client-safe helpers for naming flights in plain language. */
import type { Flight } from './types';

/**
 * "Alaska 1712" for an airline flight whose operator has a short name and whose
 * callsign is operator + number (ASA1712); otherwise the callsign/registration.
 */
export function flightLabel(f: Pick<Flight, 'ident' | 'operator' | 'operatorShort'>): string {
	if (f.operator && f.operatorShort && f.ident.toUpperCase().startsWith(f.operator.toUpperCase())) {
		const num = f.ident.slice(f.operator.length).trim();
		if (num) return `${f.operatorShort} ${num}`;
	}
	return f.ident;
}

/** Secondary line: the raw callsign and tail when they add information. */
export function flightSubLabel(f: Pick<Flight, 'ident' | 'tail' | 'operator' | 'operatorShort'>): string | null {
	const parts: string[] = [];
	if (flightLabel(f) !== f.ident) parts.push(f.ident);
	if (f.tail && f.tail !== f.ident) parts.push(f.tail);
	return parts.length ? parts.join(' · ') : null;
}

/** "Alaska Airlines" / "Passenger airline" / "Private or training" for the Kind column. */
export function flightKind(f: Pick<Flight, 'category' | 'operatorName'>): string {
	if (f.category !== 'airline') return 'Private or training';
	return f.operatorName ?? 'Passenger airline';
}
