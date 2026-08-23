<script lang="ts">
	import '../app.css';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { onMount } from 'svelte';
	import { initAltView } from '$lib/altview.svelte';

	let { children } = $props();
	onMount(initAltView);
	let menuOpen = $state(false);

	const nav = [
		{ href: '/', label: 'Home' },
		{ href: '/airports', label: 'Airports' },
		{ href: '/method', label: 'Method' }
	];
	const isActive = (href: string) => (href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="manifest" href="/manifest.webmanifest" />
	<meta name="theme-color" content="#f3f2f2" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
</svelte:head>

<header class="site-header">
	<a href="/" class="brand" onclick={() => (menuOpen = false)}>
		<span class="brand-name">DARK TOWER WATCH</span>
		<span class="brand-tag">Flights with no tower on duty</span>
	</a>
	<nav class="site-nav" class:open={menuOpen} aria-label="Primary">
		{#each nav as item (item.href)}
			<a href={item.href} class:active={isActive(item.href)} onclick={() => (menuOpen = false)}>{item.label}</a>
		{/each}
	</nav>
	<button class="menu-btn" aria-label="Menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>≡</button>
</header>

<main>
	{@render children()}
</main>

<footer class="site-footer">
	<span class="footnote">Dark Tower Watch · a citizen project built on public ADS-B data and published tower hours</span>
	<span class="footnote glossary"><abbr title="Above ground level">AGL</abbr> — height above the airport, not above sea level · <abbr title="Automatic Dependent Surveillance–Broadcast">ADS-B</abbr> — the position and altitude each aircraft broadcasts · <abbr title="Nautical mile">NM</abbr> — nautical mile, 1.15 miles · <abbr title="Knots">kt</abbr> — knots, nautical miles per hour</span>
	<a href="/method#who-we-are">Who we are</a>
</footer>

<style>
	.site-header {
		position: sticky;
		top: 0;
		z-index: 50;
		display: flex;
		align-items: stretch;
		justify-content: space-between;
		background: var(--ground);
		border-bottom: var(--rule);
	}
	.brand {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 18px var(--gutter);
		border: none;
		border-right: var(--rule);
		color: var(--ink);
	}
	.brand:hover {
		color: var(--ink);
		background: var(--ground-alt);
	}
	.brand-name {
		font-size: 20px;
		font-weight: 900;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}
	.brand-tag {
		font-size: 11px;
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--ink-45);
		white-space: nowrap;
	}
	.site-nav {
		display: flex;
		align-items: stretch;
	}
	.site-nav a {
		display: flex;
		align-items: center;
		padding: 0 20px;
		border: none;
		border-left: 1px solid var(--hairline);
		font-size: 13px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ink);
	}
	.site-nav a:hover,
	.site-nav a.active {
		background: var(--ground-alt);
		color: var(--ink);
	}
	.site-nav a.active {
		box-shadow: inset 0 -3px 0 var(--accent);
	}
	.menu-btn {
		display: none;
		padding: 0 18px;
		font-size: 22px;
		background: none;
		border: none;
		border-left: 1px solid var(--hairline);
		cursor: pointer;
		color: var(--ink);
	}
	main {
		min-height: 70vh;
	}
	.site-footer {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 24px;
		align-items: baseline;
		padding: 24px var(--gutter) 40px;
		border-top: var(--rule);
		font-size: 13px;
	}
	.glossary {
		flex-basis: 100%;
		color: var(--ink-45);
	}
	.glossary abbr {
		text-decoration: none;
		font-weight: 700;
		color: var(--ink-60);
	}
	@media (max-width: 760px) {
		.brand {
			border-right: none;
			padding: 14px var(--gutter);
		}
		.brand-tag {
			display: none;
		}
		.menu-btn {
			display: block;
		}
		.site-nav {
			display: none;
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			flex-direction: column;
			background: var(--ground);
			border-bottom: var(--rule);
		}
		.site-nav.open {
			display: flex;
		}
		.site-nav a {
			padding: 16px var(--gutter);
			border-left: none;
			border-top: 1px solid var(--hairline);
		}
	}
</style>
