<script lang="ts">
	/** Colour key under a flight-path map. Items: a swatch kind plus a label. */
	export type LegendItem = { kind: 'accent' | 'ink' | 'grey' | 'military' | 'runway' | 'ring'; label: string };
	let { items }: { items: LegendItem[] } = $props();
</script>

<div class="map-legend" data-testid="map-legend">
	{#each items as it, i (i)}
		<span><i class={it.kind}></i>{it.label}</span>
	{/each}
</div>

<style>
	.map-legend {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 10px 24px;
		padding: 14px var(--gutter);
		border-top: var(--row-rule);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-60);
	}
	.map-legend span {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.map-legend i {
		display: block;
	}
	.accent {
		width: 20px;
		height: 3px;
		background: var(--accent);
	}
	.ink {
		width: 20px;
		height: 2px;
		background: var(--ink);
	}
	.grey {
		width: 20px;
		height: 2px;
		background: var(--ink-25);
	}
	.military {
		width: 20px;
		height: 3px;
		background: var(--military);
	}
	.runway {
		width: 20px;
		height: 5px;
		background: #f0a500;
		border: 1px solid #5d3c00;
	}
	.ring {
		width: 10px;
		height: 10px;
		border: 1px solid var(--ink);
		border-radius: 50% !important;
	}
</style>
