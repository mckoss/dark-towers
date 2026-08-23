<script lang="ts">
	/* 30-night calendar (README §3). Heat by flight volume through greys; nights
	   with a close approach are accent-filled; selected night has an ink border. */
	import type { NightSummary } from '$lib/types';
	import { weekdayShort, dayOfMonth } from '$lib/time';

	interface Props {
		calendar: { night: string; summary: NightSummary | null }[];
		selected: string | null;
		onselect: (night: string) => void;
	}
	let { calendar, selected, onselect }: Props = $props();

	/** Lines for a chip's hover / focus tip: flights, then close approaches. */
	function describe(c: { night: string; summary: NightSummary | null }): string[] {
		const s = c.summary;
		if (!s) return ['No data yet'];
		return [`${s.flights} flights`, `${s.incidents} close ${s.incidents === 1 ? 'approach' : 'approaches'}`];
	}
	let tip = $state<{ lines: string[]; x: number; hot: boolean } | null>(null);
	let gridEl: HTMLDivElement;
	function showTip(e: Event, c: { night: string; summary: NightSummary | null }) {
		const el = e.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect(),
			g = gridEl.getBoundingClientRect();
		tip = { lines: describe(c), x: r.left - g.left + r.width / 2, hot: (c.summary?.incidents ?? 0) > 0 };
	}

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
	<div class="grid" bind:this={gridEl}>
		{#if tip}
			<div class="tip datablock" data-testid="cal-tip" style:left="{tip.x}px" style:--db-color={tip.hot ? 'var(--accent)' : 'var(--ink)'}>
				{#each tip.lines as line, i (i)}<div class={i === 0 ? 'db-id' : 'db-plain'}>{line}</div>{/each}
			</div>
		{/if}
		{#each calendar as c (c.night)}
			{@const s = c.summary}
			<button
				class="night"
				class:hot={(s?.incidents ?? 0) > 0}
				class:selected={c.night === selected}
				class:empty={!s}
				aria-disabled={!s}
				style:background={s && s.incidents === 0 ? heat(s.flights) : undefined}
				aria-label={`${weekdayShort(c.night)} ${dayOfMonth(c.night)}${s ? ` — ${s.flights} flights` : ' — no data yet'}`}
				aria-pressed={c.night === selected}
				onclick={() => s && onselect(c.night)}
				onmouseenter={(e) => showTip(e, c)}
				onmouseleave={() => (tip = null)}
				onfocus={(e) => showTip(e, c)}
				onblur={() => (tip = null)}
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
		position: relative;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(34px, 1fr));
		gap: 4px;
	}
	.tip {
		position: absolute;
		top: 100%;
		margin-top: 4px;
		transform: translateX(-50%);
		z-index: 5;
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
	.night:hover:not(.empty) {
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
