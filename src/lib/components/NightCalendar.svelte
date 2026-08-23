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

	// Interpolate ground-alt (#eae9e9) → ink-25 (#bab6b6) by volume.
	const GROUND_ALT = [0xea, 0xe9, 0xe9];
	const INK_25 = [0xba, 0xb6, 0xb6];
	function heat(flights: number): string {
		const k = Math.min(1, flights / max);
		const c = GROUND_ALT.map((a, i) => Math.round(a + (INK_25[i] - a) * k));
		return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
	}
</script>

<div class="cal">
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
				title={s ? `${nightLabel(c.night)} — ${s.flights} flights` : `${nightLabel(c.night)} — no data yet`}
				aria-pressed={c.night === selected}
				onclick={() => s && onselect(c.night)}
			>
				<span class="dow">{weekdayShort(c.night)}</span>
				<span class="bottom">
					<span class="day">{dayOfMonth(c.night)}</span>
					<span class="count">{s ? `${s.flights} flights` : '—'}</span>
				</span>
			</button>
		{/each}
	</div>
	<div class="legend">
		<span><i style:background={heat(0)}></i>Fewer flights</span>
		<span><i style:background={heat(max)}></i>More flights</span>
		<span><i style:background="var(--accent)"></i>Close approach</span>
	</div>
</div>

<style>
	.cal {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 24px;
		align-items: start;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(15, 1fr);
		gap: 6px;
	}
	.night {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		min-height: 78px;
		padding: 8px 8px 10px;
		border: 2px solid var(--hairline);
		background: var(--ground);
		color: var(--ink);
		text-align: left;
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
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		opacity: 0.7;
	}
	.bottom {
		display: block;
	}
	.day {
		display: block;
		font-size: 17px;
		font-weight: 800;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	.count {
		display: block;
		margin-top: 3px;
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.06em;
		opacity: 0.8;
		white-space: nowrap;
	}
	.legend {
		display: flex;
		flex-direction: column;
		gap: 10px;
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
	@media (max-width: 760px) {
		.cal {
			grid-template-columns: 1fr;
		}
		.grid {
			grid-template-columns: repeat(6, 1fr);
		}
		.legend {
			flex-direction: row;
			flex-wrap: wrap;
			gap: 8px 18px;
		}
	}
</style>
