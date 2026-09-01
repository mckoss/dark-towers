<script lang="ts">
	import type { Incident } from '$lib/types';
	import { localTime } from '$lib/time';

	interface Props {
		incident: Incident;
		identA: string;
		identB: string;
		tz: string;
	}
	let { incident, identA, identB, tz }: Props = $props();
	const wake = $derived(incident.kind === 'wake-turbulence');
	const severity = $derived(wake ? 'Wake turbulence' : incident.severity === 'very-close' ? 'Very close' : 'Close approach');
</script>

<a class="card" href="/close-approach/{incident.id}" data-airline={incident.airlineInvolved ? 'yes' : 'no'}>
	<div class="top">
		<span class="sev">{severity}</span>
		{#if incident.airlineInvolved}<span class="airline-tag">Passenger airline</span>{/if}
		<span class="time tabular">{localTime(tz, incident.t)}</span>
	</div>
	<div class="pair">{identA} × {identB}</div>
	<div class="figs">
		{#if wake}
		<div><div class="fig tabular">{incident.lateralNm} NM</div><div class="cap">In trail · required {incident.requiredNm} NM</div></div>
		<div><div class="fig tabular">{incident.trailSeconds}s</div><div class="cap">Behind leader · CWT {incident.leaderCategory} → {incident.followerCategory}</div></div>
		{:else}
		<div>
			<div class="fig tabular">{incident.lateralNm} NM</div>
			<div class="cap">Less than 3 NM</div>
		</div>
		<div>
			<div class="fig tabular">{incident.verticalFt.toLocaleString('en-US')}'</div>
			<div class="cap">Less than 1,000'</div>
		</div>
		{/if}
	</div>
	<span class="btn more">Replay this {wake ? 'wake event' : 'close approach'} →</span>
</a>

<style>
	.card {
		display: block;
		padding: 22px 24px;
		background: var(--accent-tint);
		border: none;
		border-bottom: var(--row-rule);
		border-left: 6px solid var(--accent);
		color: var(--ink);
	}
	.card:hover {
		background: #ffe0d9;
		color: var(--ink);
	}
	.top {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 10px;
	}
	/* Explains why these cards lead the night's list. */
	.airline-tag {
		margin-right: auto;
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink-45);
	}
	.sev {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--accent-text);
	}
	.time {
		font-size: 12px;
		color: var(--ink-45);
	}
	.pair {
		margin-top: 12px;
		font-size: 20px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.figs {
		display: flex;
		gap: 24px;
		margin-top: 14px;
	}
	.fig {
		font-size: 26px;
		font-weight: 900;
		letter-spacing: -0.02em;
		color: var(--accent);
	}
	.cap {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-60);
	}
	.more {
		display: inline-block;
		margin-top: 16px;
		padding: 10px 16px;
		font-size: 12px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
</style>
