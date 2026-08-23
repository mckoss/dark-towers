<script lang="ts">
	/* 30-night calendar (README §3). Heat by flight volume through greys; nights
	   with a close approach are accent-filled; selected night has an ink border. */
	import type { NightSummary } from '$lib/types';
	import { weekdayShort, dayOfMonth, nightLabel } from '$lib/time';

	interface Props {
		calendar: { night: string; summary: NightSummary | null }[];
		selected: string | null;
		onselect: (night: string) => void;
	}
	let { calendar, selected, onselect }: Props = $props();

	const max = $derived(Math.max(1, ...calendar.map((c) => c.summary?.flights ?? 0)));

	// Interpolate a mid grey (#d6d3d3) → ink-45 (#8f8b8b) by volume. The low end
	// is deliberately darker than an empty (no data) chip so the two never look alike.
	const LOW = [0xd6, 0xd3, 0xd3];
	const HIGH = [0x8f, 0x8b, 0x8b];
	function heat(flights: number): string {
		const k = Math.min(1, flights / max);
		const c = LOW.map((a, i) => Math.round(a + (HIGH[i] - a) * k));
		return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
	}
</script>

<div class="cal">
	<div class="legend">
		<span><i class="none"></i>No data</span>
		<span><i style:background={heat(0)}></i>Fewer flights</span>
		<span><i style:background={heat(max)}></i>More flights</span>
		<span><i style:background="var(--accent)"></i>Close approach</span>
	</div>
	<div class="grid">
		{#each calendar as c (c.night)}
			{@const s = c.summary}
			<button
				class="night"
				class:hot={(s?.incidents ?? 0) > 0}
				class:selected={c.night === selected}
				class:empty={!s}
				disabled={!s}
				style:background={s && s.incidents === 0 ? heat(s.flights) : undefined}
				title={s ? `${nightLabel(c.night)} — ${s.flights} flights${s.incidents ? `, ${s.incidents} close approach${s.incidents === 1 ? '' : 'es'}` : ''}` : `${nightLabel(c.night)} — no data yet`}
				aria-label={`${weekdayShort(c.night)} ${dayOfMonth(c.night)}${s ? ` — ${s.flights} flights` : ' — no data yet'}`}
				aria-pressed={c.night === selected}
				onclick={() => s && onselect(c.night)}
			>
				<span class="dow">{weekdayShort(c.night).slice(0, 1)}</span>
				<span class="day">{dayOfMonth(c.night)}</span>
			</button>
		{/each}
	</div>
</div>

<style>
	.cal {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
		gap: 4px;
	}
	.night {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 40px;
		padding: 0;
		border: 2px solid var(--hairline);
		background: var(--ground);
		color: var(--ink);
		cursor: pointer;
		font-family: inherit;
	}
	.night:hover:not(:disabled) {
		border-color: var(--ink-45);
	}
	.night.hot {
		background: var(--accent);
		color: #fff;
	}
	.night.selected {
		border-color: var(--ink);
	}
	.night.empty {
		opacity: 0.5;
		cursor: default;
		color: var(--ink-25);
	}
	.dow {
		font-size: 9px;
		font-weight: 700;
		line-height: 1;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.day {
		margin-top: 2px;
		font-size: 14px;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 18px;
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-45);
		white-space: nowrap;
	}
	.legend span {
		display: flex;
		align-items: center;
		gap: 7px;
	}
	.legend i {
		display: block;
		width: 12px;
		height: 12px;
		border: 1px solid var(--hairline);
	}
	.legend i.none {
		background: var(--ground);
		opacity: 0.6;
	}
</style>
