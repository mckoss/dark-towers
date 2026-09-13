<script lang="ts">
 import { page } from '$app/state';
 import './admin.css';
 let { data, children } = $props();
 const links = [
  ['/admin', 'Overview'], ['/admin/airports', 'Airports'], ['/admin/requests', 'Requests'],
  ['/admin/pipeline', 'Pipeline'], ['/admin/data', 'Data & diagnostics'],
  ['/admin/operators', 'Airline names'], ['/admin/aircraft', 'Aircraft'],
  ['/admin/basemap', 'Base maps'], ['/admin/configuration', 'Configuration']
 ];
</script>
<svelte:head><meta name="robots" content="noindex, nofollow" /></svelte:head>
<div class="admin-workspace">
 <div class="account">
  <span class="kicker">Admin</span>
  <span>Signed in as <strong>{data.user.email}</strong>.</span>
  {#if data.user.email === 'open@localhost'}
   <span>Open mode — local development only.</span>
  {:else}
   <form method="POST" action="/auth/signout"><button class="btn btn-ghost" type="submit">Sign out</button></form>
  {/if}
 </div>
 <nav class="admin-nav" aria-label="Admin">
  {#each links as [href, label]}
   <a {href} aria-current={page.url.pathname === href ? 'page' : undefined}>{label}</a>
  {/each}
 </nav>
 {@render children()}
</div>
<style>
 .account { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 24px; padding: 16px var(--gutter); font-size: 14px; overflow-wrap: anywhere; }
 .admin-nav { display: flex; flex-wrap: wrap; border-top: var(--row-rule); border-bottom: var(--rule); padding: 0 var(--gutter); }
 .admin-nav a { padding: 12px 16px; border: none; color: var(--ink); font-size: 14px; font-weight: 700; }
 .admin-nav a:hover, .admin-nav a[aria-current='page'] { background: var(--ground-alt); }
 .admin-nav a[aria-current='page'] { box-shadow: inset 0 -3px 0 var(--accent); }
</style>
