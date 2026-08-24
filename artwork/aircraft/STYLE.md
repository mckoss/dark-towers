# Dark Towers aircraft illustration style

This is the production recipe for adding an aircraft hero image that matches the
original Option C set. Keep the full-resolution transparent PNG in this directory;
only responsive derivatives belong under `static/images/aircraft/`.

## Generation prompt

Replace `{AIRCRAFT}` with a mechanically specific description. Mention the features
that distinguish the type: wing position, engines or rotor count, landing gear,
tail arrangement, and characteristic proportions.

```text
Use case: stylized-concept
Asset type: transparent aircraft hero illustration for the Dark Towers aviation website
Primary request: Create exactly one {AIRCRAFT}, recognizable and mechanically plausible.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background for removal; one uniform color with no shadows, gradients, texture, floor plane, reflections, or lighting variation.
Style/medium: modernized 1960s screen-print aviation poster illustration; bold simplified near-black forms, muted steel-blue and restrained safety-red accents, subtle cream-toned halftone texture only within the aircraft.
Composition/framing: elevated three-quarter view, nose facing upper right, full aircraft visible, centered, generous even padding, 3:2 landscape.
Color palette: near-black, warm cream, muted steel blue, restrained red accents; do not use #00ff00 anywhere in the aircraft.
Constraints: crisp silhouette and edges; no cast shadow, contact shadow, reflection, text, letters, numbers, registration, airline livery, logos, people, scenery, border, or watermark.
Avoid: extra aircraft, generic or inaccurate airframe geometry, photorealism, gradients, background texture.
```

Generate one type per prompt. Use OpenAI's built-in image generator and an approved
image from this directory as a visual style reference when the tool supports reference
images. Do not request several different aircraft in one generated image.

Example subject substitution:

```text
Cessna 208 Caravan single-engine high-wing utility turboprop, with wing struts,
fixed tricycle landing gear, boxy cabin and distinctive long nose
```

## Transparent master

The generated chroma-key source is an intermediate, not a repository asset. Convert
it with the image-generation skill's installed helper:

```sh
python ~/.codex/skills/.system/imagegen/scripts/remove_chroma_key.py \
  --input generated.png \
  --out artwork/aircraft/TYPE-SLUG.png \
  --auto-key border \
  --soft-matte \
  --transparent-threshold 12 \
  --opaque-threshold 220 \
  --despill
```

Validate that the PNG is RGBA, its corners have alpha 0, no green fringe remains,
the complete aircraft is visible, and the silhouette still reads on the site's warm
cream illustration background (`#efe2c5`). The original set is 1536 × 1024.

## Web derivatives

Create transparent WebP copies at widths 320, 640, and 960 pixels, preserving the
3:2 aspect ratio. Use high-quality Lanczos resampling and WebP quality 88. Name them:

```text
static/images/aircraft/TYPE-SLUG-320.webp
static/images/aircraft/TYPE-SLUG-640.webp
static/images/aircraft/TYPE-SLUG-960.webp
```

Then add aliases and family classification in `src/lib/aircraft-art.ts`, plus a unit
test. The UI deliberately calls each image “representative” so a close family match
does not claim to be the exact model.

## Acceptance checklist

- Aircraft is mechanically plausible and identifiable at a glance.
- Viewpoint, direction, palette, line weight, and halftone treatment match the set.
- No branding, registration, text, scenery, shadow, or background survives.
- Full-resolution PNG master is committed in this directory.
- All three responsive WebP derivatives are committed and mapped.
- `npm run check`, `npm test`, and the aircraft-page end-to-end test pass.
