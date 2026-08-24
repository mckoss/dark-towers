export type LabelSlot = 'e' | 'w' | 'ne' | 'se' | 'nw' | 'sw' | 'n' | 's' | 'e2' | 'w2' | 'ne2' | 'se2' | 'nw2' | 'sw2' | 'n2' | 's2';

export interface ReplayLabelTarget {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
	radius: number;
	/** Preferred direction from the aircraft, normally away from the paired target. */
	preferred?: { x: number; y: number };
}

export interface ReplayLabelPlacement {
	id: string;
	slot: LabelSlot;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

const DIRECTIONS = [
	['e', 1, 0],
	['w', -1, 0],
	['ne', 1, -1],
	['se', 1, 1],
	['nw', -1, -1],
	['sw', -1, 1],
	['n', 0, -1],
	['s', 0, 1]
] as const;

/** Dominant screen-space direction from the airport to an aircraft. */
export function cardinalDirectionAway(point: { x: number; y: number }, airport: { x: number; y: number }): { x: number; y: number } {
	const dx = point.x - airport.x;
	const dy = point.y - airport.y;
	if (Math.abs(dx) >= Math.abs(dy)) return { x: dx < 0 ? -1 : 1, y: 0 };
	return { x: 0, y: dy < 0 ? -1 : 1 };
}

function overlapArea(a: Rect, b: Rect, pad = 0): number {
	const width = Math.min(a.x + a.width + pad, b.x + b.width + pad) - Math.max(a.x - pad, b.x - pad);
	const height = Math.min(a.y + a.height + pad, b.y + b.height + pad) - Math.max(a.y - pad, b.y - pad);
	return Math.max(0, width) * Math.max(0, height);
}

function outsideArea(rect: Rect, viewport: { width: number; height: number }, pad: number): number {
	const insideWidth = Math.max(0, Math.min(rect.x + rect.width, viewport.width - pad) - Math.max(rect.x, pad));
	const insideHeight = Math.max(0, Math.min(rect.y + rect.height, viewport.height - pad) - Math.max(rect.y, pad));
	return rect.width * rect.height - insideWidth * insideHeight;
}

function rectFor(target: ReplayLabelTarget, slot: LabelSlot): Rect {
	const far = slot.endsWith('2');
	const key = (far ? slot.slice(0, -1) : slot) as Exclude<LabelSlot, `${string}2`>;
	const direction = DIRECTIONS.find(([name]) => name === key)!;
	const [, dx, dy] = direction;
	const gap = target.radius + 8 + (far ? Math.max(target.width, target.height) + 8 : 0);
	return {
		x: target.x + (dx > 0 ? gap : dx < 0 ? -gap - target.width : -target.width / 2),
		y: target.y + (dy > 0 ? gap : dy < 0 ? -gap - target.height : -target.height / 2),
		width: target.width,
		height: target.height
	};
}

/**
 * Places replay labels in stable named slots around their aircraft. Existing
 * slots win while they remain clear, preventing frame-to-frame oscillation;
 * collisions and map-edge clipping carry a much larger cost and move a label
 * to another slot when necessary.
 */
export function layoutReplayLabels(
	targets: ReplayLabelTarget[],
	viewport: { width: number; height: number },
	previous: ReadonlyMap<string, LabelSlot> = new Map()
): ReplayLabelPlacement[] {
	const aircraftRects: Rect[] = targets.map((target) => ({
		x: target.x - target.radius,
		y: target.y - target.radius,
		width: target.radius * 2,
		height: target.radius * 2
	}));
	const placed: Rect[] = [];
	const result: ReplayLabelPlacement[] = [];

	for (const target of targets) {
		const preferred = target.preferred;
		const ranked = DIRECTIONS
			.map(([slot, dx, dy], index) => ({ slot, score: preferred ? -(dx * preferred.x + dy * preferred.y) : index }))
			.sort((a, b) => a.score - b.score)
			.flatMap(({ slot }) => [slot as LabelSlot, `${slot}2` as LabelSlot]);
		const prior = previous.get(target.id);
		const slots = prior ? [prior, ...ranked.filter((slot) => slot !== prior)] : ranked;
		let best: { slot: LabelSlot; rect: Rect; score: number } | null = null;

		for (const [rank, slot] of slots.entries()) {
			const rect = rectFor(target, slot);
			const baseSlot = (slot.endsWith('2') ? slot.slice(0, -1) : slot) as (typeof DIRECTIONS)[number][0];
			const [, dx, dy] = DIRECTIONS.find(([name]) => name === baseSlot)!;
			const labelOverlap = placed.reduce((sum, other) => sum + overlapArea(rect, other, 5), 0);
			const aircraftOverlap = aircraftRects.reduce((sum, other) => sum + overlapArea(rect, other, 3), 0);
			const clipped = outsideArea(rect, viewport, 6);
			const distance = Math.hypot(rect.x + rect.width / 2 - target.x, rect.y + rect.height / 2 - target.y);
			// A small amount of hysteresis keeps equally good nearby directions
			// stable. Far slots exist only to escape an edge or collision, however,
			// and must give way as soon as a clear near slot becomes available.
			const changed = prior && slot !== prior ? 40 : 0;
			const far = slot.endsWith('2') ? 200 : 0;
			const direction = preferred ? (1 - (dx * preferred.x + dy * preferred.y) / Math.hypot(dx, dy)) * 120 : 0;
			const diagonal = preferred && dx !== 0 && dy !== 0 ? 80 : 0;
			const score = clipped * 20_000 + labelOverlap * 10_000 + aircraftOverlap * 2_000 + far + direction + diagonal + changed + distance + rank;
			if (!best || score < best.score) best = { slot, rect, score };
		}

		if (!best) continue;
		placed.push(best.rect);
		result.push({ id: target.id, slot: best.slot, ...best.rect });
	}
	return result;
}

/** Nearest point on a placed block to its aircraft, relative to the aircraft. */
export function replayLeaderEnd(placement: Pick<ReplayLabelPlacement, 'x' | 'y' | 'width' | 'height'>, aircraft: { x: number; y: number }): { x: number; y: number } {
	return {
		x: Math.max(placement.x, Math.min(aircraft.x, placement.x + placement.width)) - aircraft.x,
		y: Math.max(placement.y, Math.min(aircraft.y, placement.y + placement.height)) - aircraft.y
	};
}

export interface ReplayLabelElements {
	offset: HTMLElement;
	leader: HTMLElement;
}

export const REPLAY_LABEL_FADE_MS = 500;

/** Keep the positioning wrapper alive while the datablock's live values change. */
export function updateReplayLabel(host: HTMLElement, html: string): ReplayLabelElements {
	let offset = host.querySelector<HTMLElement>(':scope > .replay-label-offset');
	let leader = host.querySelector<HTMLElement>(':scope > .replay-label-leader');
	if (!offset || !leader) {
		host.replaceChildren();
		leader = host.ownerDocument.createElement('span');
		leader.className = 'replay-label-leader';
		offset = host.ownerDocument.createElement('span');
		offset.className = 'replay-label-offset';
		host.append(leader, offset);
	}
	offset.innerHTML = html;
	return { offset, leader };
}

/** Apply a collision-free placement and point its eased leader line at the block. */
export function applyReplayLabelPlacement(
	elements: ReplayLabelElements,
	placement: ReplayLabelPlacement,
	aircraft: { x: number; y: number },
	radius: number,
	color: string
): void {
	const firstPlacement = !elements.offset.classList.contains('positioned');
	const x = placement.x - aircraft.x;
	const y = placement.y - aircraft.y;
	elements.offset.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
	elements.offset.dataset.slot = placement.slot;

	const end = replayLeaderEnd(placement, aircraft);
	const length = Math.hypot(end.x, end.y);
	const start = Math.min(radius, Math.max(0, length - 1));
	const ux = length ? end.x / length : 0;
	const uy = length ? end.y / length : 0;
	elements.leader.style.left = `${(ux * start).toFixed(1)}px`;
	elements.leader.style.top = `${(uy * start).toFixed(1)}px`;
	elements.leader.style.width = `${Math.max(0, length - start).toFixed(1)}px`;
	elements.leader.style.transform = `rotate(${Math.atan2(end.y, end.x)}rad)`;
	elements.leader.style.backgroundColor = color;
	// The first layout is immediate so newly appearing labels do not animate
	// outward from one overlapping pile at the aircraft origins. Later slot
	// changes use the CSS ease-in-out transition.
	if (firstPlacement) {
		// Commit the final offset while still transparent. The first visual
		// transition is therefore a fade, not a flight outward from the target.
		void elements.offset.offsetWidth;
	}
	elements.offset.classList.add('positioned', 'visible');
	elements.leader.classList.add('positioned', 'visible');
}

/** Begin the shared half-second fade; callers retain the Leaflet marker until done. */
export function fadeOutReplayLabel(host: HTMLElement | null | undefined, done: () => void): ReturnType<typeof setTimeout> {
	const offset = host?.querySelector<HTMLElement>(':scope > .replay-label-offset');
	const leader = host?.querySelector<HTMLElement>(':scope > .replay-label-leader');
	offset?.classList.remove('visible');
	leader?.classList.remove('visible');
	return setTimeout(done, REPLAY_LABEL_FADE_MS);
}
