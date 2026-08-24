export type AircraftArtwork = {
	slug: string;
	name: string;
	alt: string;
};

export type AircraftArtworkDetails = {
	type?: string | null;
	registryLabel?: string | null;
	model?: string | null;
	airframe?: string | null;
	category?: string | null;
};

const artwork = {
	'e175': { slug: 'e175', name: 'regional jet', alt: 'Representative regional jet illustration' },
	'cessna-high-wing': { slug: 'cessna-high-wing', name: 'high-wing piston airplane', alt: 'Representative high-wing piston airplane illustration' },
	'boeing-737': { slug: 'boeing-737', name: 'narrow-body airliner', alt: 'Representative narrow-body airliner illustration' },
	'airbus-h125': { slug: 'airbus-h125', name: 'light utility helicopter', alt: 'Representative light utility helicopter illustration' },
	'piper-cherokee': { slug: 'piper-cherokee', name: 'low-wing piston airplane', alt: 'Representative low-wing piston airplane illustration' },
	'learjet-45': { slug: 'learjet-45', name: 'business jet', alt: 'Representative business jet illustration' },
	'cirrus-sr22': { slug: 'cirrus-sr22', name: 'modern piston airplane', alt: 'Representative modern piston airplane illustration' },
	'bell-407': { slug: 'bell-407', name: 'utility helicopter', alt: 'Representative utility helicopter illustration' },
	'cessna-caravan': { slug: 'cessna-caravan', name: 'high-wing utility turboprop', alt: 'Representative high-wing utility turboprop illustration' },
	'pilatus-pc12': { slug: 'pilatus-pc12', name: 'single-engine executive turboprop', alt: 'Representative single-engine executive turboprop illustration' },
	'schweizer-269': { slug: 'schweizer-269', name: 'small training helicopter', alt: 'Representative small training helicopter illustration' },
	'luscombe-8': { slug: 'luscombe-8', name: 'classic taildragger', alt: 'Representative classic taildragger illustration' },
	'metroliner': { slug: 'metroliner', name: 'commuter turboprop', alt: 'Representative commuter turboprop illustration' },
	'crj-200': { slug: 'crj-200', name: 'regional jet', alt: 'Representative regional jet illustration' }
} satisfies Record<string, AircraftArtwork>;

const byType: Record<string, keyof typeof artwork> = {
	E170: 'e175', E75L: 'e175', E175: 'e175',
	C150: 'cessna-high-wing', C152: 'cessna-high-wing', C172: 'cessna-high-wing', C182: 'cessna-high-wing',
	C205: 'cessna-high-wing', C206: 'cessna-high-wing', C207: 'cessna-high-wing', C210: 'cessna-high-wing', T206: 'cessna-high-wing', U206: 'cessna-high-wing',
	B737: 'boeing-737', B738: 'boeing-737', B739: 'boeing-737', B37M: 'boeing-737', B38M: 'boeing-737', B39M: 'boeing-737',
	AS50: 'airbus-h125', AS55: 'airbus-h125', H125: 'airbus-h125',
	P28A: 'piper-cherokee', PA28: 'piper-cherokee',
	LJ45: 'learjet-45',
	SR20: 'cirrus-sr22', SR22: 'cirrus-sr22', S22T: 'cirrus-sr22',
	B407: 'bell-407',
	C208: 'cessna-caravan',
	PC12: 'pilatus-pc12',
	H269: 'schweizer-269',
	SW4: 'metroliner',
	CRJ2: 'crj-200'
};

export function aircraftArtworkFor(...descriptions: Array<string | null | undefined>): AircraftArtwork | null {
	for (const description of descriptions) {
		if (!description) continue;
		const normalized = description.trim().toUpperCase().replace(/[–—]/g, '-');
		const direct = byType[normalized.replace(/\s+/g, '')];
		if (direct) return artwork[direct];
		if (/EMBRAER.*E-?17[05]/.test(normalized)) return artwork.e175;
		if (/CESSNA.*\b(150|152|172|182|205|206|207|210|T206|U206)[A-Z]?\b/.test(normalized)) return artwork['cessna-high-wing'];
		if (/BOEING.*737/.test(normalized)) return artwork['boeing-737'];
		if (/(AIRBUS|EUROCOPTER|AEROSPATIALE).*(H125|AS ?350)/.test(normalized)) return artwork['airbus-h125'];
		if (/PIPER.*(CHEROKEE|PA-?28)/.test(normalized)) return artwork['piper-cherokee'];
		if (/LEARJET.*45/.test(normalized)) return artwork['learjet-45'];
		if (/CIRRUS.*SR ?22/.test(normalized)) return artwork['cirrus-sr22'];
		if (/BELL.*407/.test(normalized)) return artwork['bell-407'];
		if (/CESSNA.*(208|CARAVAN)/.test(normalized)) return artwork['cessna-caravan'];
		if (/PILATUS.*PC-?12/.test(normalized)) return artwork['pilatus-pc12'];
		if (/(SCHWEIZER|HUGHES).*(269|300)/.test(normalized)) return artwork['schweizer-269'];
		if (/LUSCOMBE.*\b8(E)?\b/.test(normalized)) return artwork['luscombe-8'];
		if (/(SWEARINGEN|FAIRCHILD).*METRO/.test(normalized)) return artwork.metroliner;
		if (/(BOMBARDIER|CANADAIR).*CRJ-?200/.test(normalized)) return artwork['crj-200'];
	}
	return null;
}

export function aircraftArtworkForDetails(details: AircraftArtworkDetails): AircraftArtwork {
	const matched = aircraftArtworkFor(details.type, details.registryLabel, details.model);
	if (matched) return matched;

	const description = [details.type, details.registryLabel, details.model].filter(Boolean).join(' ').toUpperCase();
	const airframe = details.airframe?.toLowerCase();
	const category = details.category?.toLowerCase();

	if (airframe === 'helicopter' || /HELICOPTER|EUROCOPTER|BELL |ROTORCRAFT/.test(description)) {
		return /H269|SCHWEIZER|HUGHES 300/.test(description) ? artwork['schweizer-269'] : artwork['bell-407'];
	}
	if (/\b(CRJ[27]?|E1[279]\d?|B190|E120|SW4)\b/.test(description)) return artwork['crj-200'];
	if (category === 'airline' || /\b(A3[12]|A21N|B7[237][2479]|BLCF)\b/.test(description)) return artwork['boeing-737'];
	if (/\b(C25[BC]|C5(?:25|50|60|6X)|C68A|C7(?:00|50)|CL3[05]|CL60|E55P|F2TH|FA20|G150|GALX|GLF[456T]?|H25B|LJ[346][05]?|PC24|SF50)\b/.test(description)) return artwork['learjet-45'];
	if (/\b(C208|DHC-?2|P46T|PC12|TBM)\b|CARAVAN|BEAVER/.test(description)) return artwork['cessna-caravan'];
	if (/\b(BE20|BE9L|PA31)\b/.test(description)) return artwork.metroliner;
	if (/\b(C120|C140|C162|C170|C177|C185|C20[567]|C210|T206|U206|C77R|C82[RS])\b|KITFOX|RANGER R7/.test(description)) return artwork['cessna-high-wing'];
	if (/LUSCOMBE|\bBL(8|17)\b/.test(description)) return artwork['luscombe-8'];
	if (/\b(DA4[02]|DA62|S22T|SR2[02])\b|SLING|VL-?3|SUPER PETREL/.test(description)) return artwork['cirrus-sr22'];

	// Homebuilts and rare registrations often have no ICAO type. A known airplane
	// still receives a deliberately generic low-wing illustration rather than no art.
	if (airframe === 'airplane' || category === 'private' || category === 'military' || description) return artwork['piper-cherokee'];
	return artwork['piper-cherokee'];
}
