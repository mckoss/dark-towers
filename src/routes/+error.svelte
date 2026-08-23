<script lang="ts">
	import { page } from '$app/state';

	const status = $derived(page.status);
	const headline = $derived(status === 404 ? 'This page doesn’t exist.' : 'Something went wrong.');
	const detail = $derived(
		status === 404
			? 'The address may be mistyped, or the page may have moved. The home page lists everything we publish.'
			: 'We could not finish loading this page. Please try again in a moment; if it keeps happening, let us know.'
	);
</script>

<svelte:head>
	<title>Error {status} — Dark Tower Watch</title>
</svelte:head>

<section class="section split">
	<div class="cell-lg">
		<div class="kicker">Error {status}</div>
		<h1 class="page-headline headline">{headline}</h1>
		<p class="body detail">{detail}</p>
		<a class="btn home" href="/">Back to the home page</a>
	</div>
	<div class="cell-lg inset">
		<div class="table-header">Where to go</div>
		<ul class="links">
			<li><a href="/">Home</a></li>
			<li><a href="/airports">Airports tracked</a></li>
			<li><a href="/method">Method</a></li>
			<li><a href="/method#who-we-are">Who we are</a></li>
		</ul>
	</div>
</section>

<style>
	.headline {
		margin-top: 20px;
		max-width: 18ch;
	}
	.detail {
		margin-top: 24px;
		max-width: 54ch;
	}
	.home {
		margin-top: 32px;
		border-bottom: none;
	}
	.links {
		list-style: none;
		margin: 16px 0 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-size: 16px;
	}
</style>
