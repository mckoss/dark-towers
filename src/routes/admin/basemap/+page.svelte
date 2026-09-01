<script lang="ts">
	/**
	 * Base-map tile cache.
	 *
	 * One cache serves both the live map and the PDF report. Tiles are fetched
	 * at most once a month; warming them here means a reader's report never waits
	 * on the network, and CARTO sees roughly one request per tile per month
	 * rather than one per visitor.
	 *
	 * Without a keyed `tile_url`, warming runs in this browser: a fetch from the
	 * site's own origin comes back unstamped, where a keyless server-side fetch
	 * comes back marked "API KEY REQUIRED". That only works on the deployed
	 * origin — localhost gets the stamp.
	 */
	import { invalidateAll } from '$app/navigation';
	import { fillTileUrl, TILE_ATTRIBUTION, TILE_DIRECT_URL, TILE_PROXY_URL } from '$lib/report-maps';

	let { data } = $props();

	interface WarmView {
		key: string;
		caption: string;
		tiles: { z: number; x: number; y: number }[];
	}

	let busy = $state<string | null>(null);
	let note = $state('');
	let stamp = $state(Date.now());

	const preview = (airport: { pos: [number, number] }, view: { halfNm: number }, z = 11) => view;

	async function warm(airport: { code: string; icao: string }, force = false) {
		busy = airport.icao;
		note = '';
		try {
			if (data.keyed) {
				// A configured key lets the server fill its own cache.
				const res = await fetch(`/admin/basemap/warm?airport=${airport.code}&force=${force ? 1 : 0}`, { method: 'PUT' });
				if (!res.ok) throw new Error(await res.text());
				const { tiles } = await res.json();
				note = `${airport.code}: ${tiles} tiles cached.`;
			} else {
				const res = await fetch(`/admin/basemap/warm?airport=${airport.code}`);
				if (!res.ok) throw new Error(await res.text());
				const { views } = (await res.json()) as { views: WarmView[] };
				let stored = 0;
				let failed = 0;
				for (const view of views) {
					for (const t of view.tiles) {
						try {
							// Fetched by this browser, so CARTO answers for our own origin.
							const upstream = await fetch(fillTileUrl(TILE_DIRECT_URL, t.z, t.x, t.y), { mode: 'cors' });
							if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
							// A Blob body survives the trip; a bare ArrayBuffer does not.
							const png = new Blob([await upstream.arrayBuffer()], { type: 'image/png' });
							const put = await fetch(`/admin/basemap/warm?z=${t.z}&x=${t.x}&y=${t.y}`, { method: 'POST', body: png });
							if (!put.ok) throw new Error(await put.text());
							stored++;
						} catch {
							failed++;
						}
					}
				}
				note = `${airport.code}: ${stored} tiles cached${failed ? `, ${failed} failed` : ''}.`;
			}
			stamp = Date.now();
			await invalidateAll();
		} catch (e) {
			note = `${airport.code} failed: ${e instanceof Error ? e.message : e}`;
		} finally {
			busy = null;
		}
	}

	const when = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString('en-US', { dateStyle: 'medium' }) : '—');
	const mb = (bytes: number) => (bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1024)} kB`);
</script>

<svelte:head><title>Base map cache — Dark Towers admin</title></svelte:head>

<section class="section cell">
	<div class="table-header">Base maps</div>
	<h1 class="title">Base map tile cache</h1>
	<p class="lead">
		One cache serves the live map and the two charts in each PDF report. Tiles are refetched at most every {data.ttlDays}
		days, so a report never waits on the network and CARTO sees about one request per tile per month rather than one per
		visitor. Panning or zooming past these default views still fetches tiles as needed, and those are cached too.
	</p>

	<dl class="facts">
		<div><dt>Tile source</dt><dd>{data.keyed ? 'Keyed tile_url (server fetches directly)' : 'No key configured — warm from this browser'}</dd></div>
		<div><dt>Cached</dt><dd>{data.stats.tiles.toLocaleString('en-US')} tiles · {mb(data.stats.bytes)}</dd></div>
		<div><dt>Oldest tile</dt><dd>{when(data.stats.oldest)}</dd></div>
	</dl>

	{#if !data.keyed}
		<p class="warn">
			No <code>tile_url</code> is configured, so warming fetches tiles in this browser and uploads them. That only returns
			clean tiles on the deployed site — on localhost CARTO stamps them "API KEY REQUIRED". A free key from
			<a href="https://carto.com/basemaps/apikey" target="_blank" rel="noreferrer">carto.com/basemaps/apikey</a> lets the server
			do it instead.
		</p>
	{/if}
	{#if note}<p class="note">{note}</p>{/if}

	{#each data.airports as airport (airport.icao)}
		<div class="row">
			<div class="head">
				<div><span class="code">{airport.code}</span><span class="name">{airport.name}</span></div>
				<button class="btn btn-ghost" onclick={() => warm(airport)} disabled={busy === airport.icao}>
					{busy === airport.icao ? 'Caching…' : airport.views.every((v) => v.cached === v.total) ? 'Refresh' : 'Warm cache'}
				</button>
			</div>
			<div class="views">
				{#each airport.views as view (view.key)}
					<div class="view">
						<div class="cap">{view.caption}</div>
						<div class="meta" class:full={view.cached === view.total}>
							{view.cached} of {view.total} tiles cached{view.oldest ? ` · oldest ${when(view.oldest)}` : ''}
						</div>
						{#if view.cached}
							<img
								class="thumb"
								alt="{airport.code} {view.caption}"
								src={`${TILE_PROXY_URL.replace('{z}', '11').replace('{x}', '0').replace('{y}', '0')}?v=${stamp}`}
								hidden
							/>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	{:else}
		<p class="note">No tracked airports yet.</p>
	{/each}

	<p class="credit">{TILE_ATTRIBUTION}</p>
</section>

<style>
	.cell {
		padding: 24px var(--gutter) 48px;
	}
	.title {
		margin-top: 6px;
		font-size: 24px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.lead {
		margin-top: 10px;
		max-width: 70ch;
		font-size: 14px;
		line-height: 1.55;
		color: var(--ink-60);
	}
	.facts {
		display: flex;
		flex-wrap: wrap;
		gap: 0;
		margin: 20px 0 0;
		border: 1px solid var(--hairline);
	}
	.facts > div {
		padding: 12px 16px;
		flex: 1 1 200px;
	}
	.facts > div + div {
		border-left: 1px solid var(--hairline);
	}
	dt {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-45);
	}
	dd {
		margin: 4px 0 0;
		font-size: 14px;
		font-weight: 700;
	}
	.warn,
	.note {
		margin-top: 16px;
		max-width: 70ch;
		font-size: 13px;
		line-height: 1.5;
		color: var(--accent-text);
	}
	.row {
		margin-top: 24px;
		padding-top: 14px;
		border-top: var(--row-rule);
	}
	.head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 16px;
	}
	.code {
		font-size: 20px;
		font-weight: 900;
		letter-spacing: -0.02em;
	}
	.name {
		margin-left: 8px;
		font-size: 14px;
		color: var(--ink-60);
	}
	.btn {
		padding: 8px 14px;
		font-size: 12px;
	}
	.views {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
		gap: 12px;
		margin-top: 12px;
		max-width: 720px;
	}
	.cap {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ink-60);
	}
	.meta {
		margin-top: 4px;
		font-size: 13px;
		color: var(--ink-45);
	}
	.meta.full {
		color: var(--ink);
	}
	.thumb {
		display: none;
	}
	.credit {
		margin-top: 28px;
		font-size: 11px;
		color: var(--ink-45);
	}
</style>
