<script lang="ts">
	import { aircraftArtworkForDetails } from '$lib/aircraft-art';

	let { type, registryLabel, model, airframe, category }: { type?: string | null; registryLabel?: string | null; model?: string | null; airframe?: string | null; category?: string | null } = $props();
	const artwork = $derived(aircraftArtworkForDetails({ type, registryLabel, model, airframe, category }));
</script>

{#if artwork}
	<figure class="aircraft-hero" data-testid="aircraft-hero">
		<picture>
			<source
				type="image/webp"
				srcset="/images/aircraft/{artwork.slug}-320.webp 320w, /images/aircraft/{artwork.slug}-640.webp 640w, /images/aircraft/{artwork.slug}-960.webp 960w"
				sizes="(max-width: 760px) calc(100vw - 48px), 50vw"
			/>
			<img
				src="/images/aircraft/{artwork.slug}-640.webp"
				alt={artwork.alt}
				width="960"
				height="640"
				loading="eager"
				fetchpriority="high"
				data-testid="aircraft-hero-image"
			/>
		</picture>
		<figcaption>Representative {artwork.name} · Dark Towers illustration</figcaption>
	</figure>
{/if}

<style>
	.aircraft-hero {
		margin: 26px 0 0;
		background: #efe2c5;
		border: var(--rule);
		overflow: hidden;
	}
	picture { display: block; aspect-ratio: 3 / 2; }
	img { display: block; width: 100%; height: 100%; object-fit: contain; }
	figcaption {
		padding: 8px 10px;
		border-top: 1px solid color-mix(in srgb, var(--ink) 35%, transparent);
		color: var(--ink-60);
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
</style>
