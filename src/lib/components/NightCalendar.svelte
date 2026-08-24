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
		return [`${s.flights} flights`, `${s.airline} airline`, `${s.incidents} close ${s.incidents === 1 ? 'approach' : 'approaches'}`, `${s.wakeIncidents ?? 0} wake ${s.wakeIncidents === 1 ? 'event' : 'events'}`];
	}
	let tip = $state<{ lines: string[]; x: number; hot: boolean; align: 'center' | 'left' | 'right' } | null>(null);
	let gridEl: HTMLDivElement;
	function showTip(e: Event, c: { night: string; summary: NightSummary | null }) {
		const el = e.currentTarget as HTMLElement;
		const r = el.getBoundingClientRect(),
			g = gridEl.getBoundingClientRect();
		// Keep the tip inside the strip: anchor it to the chip's left or right edge near the ends.
		const x = r.left - g.left + r.width / 2;
		const TIP_HALF = 80;
		const align = x < TIP_HALF ? 'left' : g.width - x < TIP_HALF ? 'right' : 'center';
		tip = { lines: describe(c), x: align === 'left' ? r.left - g.left : align === 'right' ? r.right - g.left : x, hot: (c.summary?.incidents ?? 0) + (c.summary?.wakeIncidents ?? 0) > 0, align };
	}


</script>

<div class="cal">
	<div class="legend">
		<span><i class="none"></i>No data</span>
		<span><i class="quiet"></i>No airline flights</span>
		<span><i class="airline"></i>Airline flights</span>
		<span><i class="hot"></i>Flagged event</span>
	</div>
	<div class="grid" bind:this={gridEl}>
		{#if tip}
			<div class="tip datablock {tip.align}" data-testid="cal-tip" style:left="{tip.x}px" style:--db-color={tip.hot ? 'var(--accent)' : 'var(--ink)'}>
				{#each tip.lines as line, i (i)}<div class={i === 0 ? 'db-id' : 'db-plain'}>{line}</div>{/each}
			</div>
		{/if}
		{#each calendar as c (c.night)}
			{@const s = c.summary}
			<button
				class="night"
				class:hot={(s?.incidents ?? 0) + (s?.wakeIncidents ?? 0) > 0}
				class:airline={!!s && s.incidents === 0 && (s.wakeIncidents ?? 0) === 0 && s.airline > 0}
				class:quiet={!!s && s.incidents === 0 && (s.wakeIncidents ?? 0) === 0 && s.airline === 0}
				class:selected={c.night === selected}
				class:empty={!s}
				aria-disabled={!s}
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
	.tip.left {
		transform: none;
	}
	.tip.right {
		transform: translateX(-100%);
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
	.night.quiet {
		background: var(--ground-alt);
	}
	.night.airline {
		background: var(--ink-25);
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
	.legend i.quiet {
		background: var(--ground-alt);
	}
	.legend i.airline {
		background: var(--ink-25);
	}
	.legend i.hot {
		background: var(--accent);
	}
</style>
