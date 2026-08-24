<script lang="ts">
	import type { AircraftIdentityData } from '$lib/aircraft';

	interface Props { identity: AircraftIdentityData; details?: boolean; }
	let { identity, details = true }: Props = $props();
	const r = $derived(identity.registry);
	const location = $derived(r ? [r.ownerCity, r.ownerState || r.ownerCountry].filter(Boolean).join(', ') : '');
</script>

<span class="identity">
	{#if identity.href}
		<a class="identity-link" href={identity.href}>{identity.label}</a>
	{:else}
		<span class="identity-label">{identity.label}</span>
	{/if}
	{#if identity.sublabel}<span class="identity-sub">{identity.sublabel}</span>{/if}
	{#if r && details}
		<span class="aircraft-popover" role="tooltip">
			<strong>{r.registration} · {r.label}</strong>
			{#if r.year}<span>{r.year} · {r.airframe}</span>{:else}<span>{r.airframe}</span>{/if}
			{#if r.ownerName}<span>Registered to {r.ownerName}</span>{/if}
			{#if location}<span>{location}</span>{/if}
			<span class="as-of">FAA registry · {r.asOf}</span>
		</span>
	{/if}
</span>

<style>
	.identity { position: relative; display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 0 0.45em; font-weight: 600; }
	.identity-link { position: relative; z-index: 2; border-bottom: 1px dotted currentColor; color: inherit; }
	.identity-link:hover, .identity-link:focus-visible { color: var(--accent-text); }
	.identity-sub { font-weight: 400; color: var(--ink-45); }
	.aircraft-popover {
		position: absolute; left: 0; bottom: calc(100% + 8px); z-index: 1000; display: none; min-width: 230px;
		padding: 11px 13px; border: 1.5px solid var(--ink); background: var(--ground); color: var(--ink);
		box-shadow: 3px 3px 0 rgb(32 30 29 / 22%); font-size: 12px; font-weight: 500; line-height: 1.35;
	}
	.identity:hover .aircraft-popover, .identity:focus-within .aircraft-popover { display: flex; flex-direction: column; gap: 3px; }
	.aircraft-popover strong { font-size: 13px; }
	.aircraft-popover .as-of { margin-top: 3px; color: var(--ink-45); font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
</style>
