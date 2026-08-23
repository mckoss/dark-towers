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
	const severity = $derived(incident.severity === 'very-close' ? 'Very close' : 'Closer than allowed');
</script>

<a class="card" href="/close-approach/{incident.id}">
	<div class="top">
		<span class="sev">{severity}</span>
		<span class="time tabular">{localTime(tz, incident.t)}</span>
	</div>
	<div class="pair">{identA} × {identB}</div>
	<div class="figs">
		<div>
			<div class="fig tabular">{incident.lateralNm} NM</div>
			<div class="cap">Less than 3 NM</div>
		</div>
		<div>
			<div class="fig tabular">{incident.verticalFt.toLocaleString('en-US')}'</div>
			<div class="cap">Less than 1,000'</div>
		</div>
	</div>
	<div class="more">See what happened →</div>
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
		margin-top: 14px;
		font-size: 13px;
		font-weight: 700;
		color: var(--accent-text);
	}
</style>
