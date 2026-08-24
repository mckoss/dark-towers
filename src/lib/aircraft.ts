import { flightLabel, flightSubLabel } from './flights';
import { registryKey, type RegistryEntry } from './registry';
import type { Flight } from './types';
import type { DataBlockInput } from './datablock';

export interface AircraftIdentityData {
	label: string;
	sublabel: string | null;
	tail: string | null;
	href: string | null;
	registry: RegistryEntry | null;
}

export function aircraftHref(tail: string | null | undefined): string | null {
	const key = registryKey(tail);
	return key ? `/aircraft/N${key}` : null;
}

export function aircraftIdentity(flight: Flight): AircraftIdentityData {
	return {
		label: flightLabel(flight),
		sublabel: flightSubLabel(flight),
		tail: flight.tail,
		href: aircraftHref(flight.tail),
		registry: flight.registry ?? null
	};
}

/** Link and concise registry facts suitable for an animated ATC data block. */
export function dataBlockAircraft(flight: Flight): DataBlockInput['aircraft'] {
	const identity = aircraftIdentity(flight);
	if (!identity.href) return undefined;
	const registry = identity.registry;
	return {
		href: identity.href,
		registration: registry?.registration ?? identity.tail ?? identity.label,
		description: registry ? `${registry.year ? `${registry.year} · ` : ''}${registry.label}` : flight.type ?? identity.label,
		ownerName: registry?.ownerName ?? null,
		ownerLocation: registry ? [registry.ownerCity, registry.ownerState || registry.ownerCountry].filter(Boolean).join(', ') || null : null,
		asOf: registry?.asOf ?? null
	};
}
