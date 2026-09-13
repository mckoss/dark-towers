<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>Sign-in — Dark Towers</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="section cell-lg">
	<div class="kicker">Error {page.status}</div>
	<h1 class="page-headline">{page.error?.account ? 'Admin access denied.' : 'Sign-in failed.'}</h1>
	{#if page.error?.account}
		<p class="body">You are signed in as <strong>{page.error.account}</strong>. This account is not authorized for admin.</p>
	{:else}
		<p class="body">{page.error?.message}</p>
	{/if}
	<div class="actions">
		<a class="btn" href="/auth/google" data-sveltekit-reload>Sign in with another Google account</a>
		<form method="POST" action="/auth/signout">
			<button class="btn btn-ghost" type="submit">Sign out</button>
		</form>
		<a href="/">Back to the home page</a>
	</div>
</section>

<style>
	h1, p, .actions { margin-top: 24px; }
	p { overflow-wrap: anywhere; }
	.actions { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; }
</style>
