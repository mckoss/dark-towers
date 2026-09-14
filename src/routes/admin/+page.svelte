<script lang="ts">
 let { data } = $props();
</script>
<svelte:head><title>Admin overview — Dark Towers</title></svelte:head>
<section class="section cell">
 <h1 class="page-headline">Admin overview</h1>
 <p class="body intro">Manage airports, review requests, and monitor nightly collection.</p>
 <div class="summaries">
  <a href="/admin/airports"><span class="table-header">Tracked airports</span><strong>{data.trackedAirports}</strong><span>Edit airports and tower hours →</span></a>
  <a href="/admin/requests"><span class="table-header">Pending requests</span><strong>{data.pendingRequests}</strong><span>Review airport requests →</span></a>
  <a href="/admin/data"><span class="table-header">Nights collected</span><strong>{data.nights}</strong><span>{data.incomplete} incomplete · inspect data →</span></a>
  <a href="/admin/pipeline"><span class="table-header">Failed runs · last 24 hours</span><strong>{data.activity.failed}</strong><span>{data.activity.runs} runs · {data.activity.apiCalls} API calls →</span></a>
 </div>
</section>
<section class="section cell">
 <h2 class="section-heading">Collection status</h2>
 <p class="body intro">Scheduler is <strong>{data.schedulerOn ? 'on' : 'off'}</strong>.
  {#if data.job}
   {data.job.name} · {data.job.finishedAt ? (data.job.ok ? 'finished successfully' : 'failed') : 'running'}.
  {:else}
   No job has run since the server started.
  {/if}
 </p>
 <a class="status-link" href="/admin/pipeline">Open pipeline controls and job log →</a>
</section>
<style>
 .intro { margin-top: 16px; }
 .summaries { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 24px; border-top: var(--rule); }
 .summaries a { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 24px 16px 24px 0; color: var(--ink); border-bottom: var(--row-rule); }
 .summaries a:hover { background: var(--ground-alt); }
 .summaries strong { font-size: 40px; font-weight: 800; font-variant-numeric: tabular-nums; }
 .summaries a > span:last-child { color: var(--accent-text); font-size: 14px; }
 .status-link { display: inline-block; margin-top: 16px; }
 @media (max-width: 760px) { .summaries { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
