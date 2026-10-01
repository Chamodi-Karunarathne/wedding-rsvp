# Cinematic invitation assets

The guest scene uses `satin-garden.e3947bda09.webp` (95 KB, 1200 px wide)
and `satin-garden-mobile.7b96b557f7.webp` (25 KB, 640 px wide). Both are
optimized versions of the same image, generated with the built-in imagegen
tool. Their filenames contain content hashes for the existing immutable
asset cache. Keep a new content hash when replacing either file.

The environment contains only silk and edge flowers. The invitation, envelope,
wax seal, monogram, and wording remain live SVG/HTML. No final artwork
placeholders are required. `paper-grain.svg` is a small static noise texture;
its URL uses the existing SVG manifest version.

Generation prompt:

> Use case: photorealistic-natural. Asset type: quiet photographic environment background for a luxury wedding invitation animation, portrait 2:3 composition. Create an overhead editorial photograph of warm ivory silk satin with broad, soft, natural folds, diffuse champagne afternoon light coming from the upper left, delicately textured fabric, gentle shadow gradients. Very sparse pale ivory and barely blush garden roses and a few dried ivory baby's breath stems at extreme top left and extreme lower right edges ONLY, partially cropped. Those flowers are softly out of focus with optical depth of field, foreground lower right rose more blurred. Centre 75 percent of image must remain empty, calm, pale warm ivory silk with almost no folds, reserved for a separately rendered invitation. Muted elegant creamy palette, no strong pink, no dark brown. Real luxury wedding stationery editorial photography, tender atmosphere, subtle warm bokeh at edges. NO invitation, NO paper, NO envelope, NO wax seal, NO letters, NO monogram, NO text, NO watermark. Background asset only, not a complete invitation and not a collage.

The commissioned family wording is retained from `card-text.svg`. Couple names,
initials, event date/time/venue, reply date, and guest dedication come from the
invitation view model. `scripts/preview-card.ts` remains a preview of the
original exported SVG layers; inspect the guest route to review the live card.

## Realistic corner florals

`public/card/rose-corner-upper.1e4c20dbac.webp` (68 KB) and `public/card/rose-corner-lower.6277f50c09.webp` (55 KB) are transparent botanical cutouts generated with the built-in imagegen tool. Their optimized 512 px WebP versions preserve alpha and use content-hashed filenames. They replace only the live card's vector corner sprays; the original SVG export remains available for print previews. Both are independently animated in the existing floral beat.

Upper corner generation prompt:

> Use case: photorealistic-natural. Asset type: transparent floral corner cutout for an existing luxury ivory wedding invitation, replacing thin vector botanicals while preserving their sparse corner placement. Create ONE refined botanical spray, photographed from directly overhead, isolated on a genuinely transparent alpha background. An airy asymmetric triangular corner arrangement anchored in the UPPER RIGHT corner: one small open cream garden rose with barely blush petal tips near the upper right, two tiny ivory buds, delicate branching champagne beige leaves and sparse tiny ivory dried blossoms extending LEFT along the top and DOWN the right edge. Leaves have realistic fine veins and translucent dried texture, rose has intricate soft layered petals. Center and lower-left 70 percent stay completely EMPTY/TRANSPARENT so typography will remain unobstructed. Flowers and stems must taper delicately into the open space, no heavy bouquet. Soft diffuse light from upper left; tiny natural contact shading within petals, no cast shadow outside the cutout. Muted warm ivory, parchment, pale blush, champagne sage. Macro editorial botanical photograph, crisp natural texture, not vector, not cartoon, not outlined watercolor. Entire spray visible with slight transparent padding. Square image. NO paper, NO background, NO card, NO border, NO typography, NO watermark.

Lower corner generation prompt:

> Use case: photorealistic-natural. Asset type: transparent lower-left botanical corner cutout for a luxury ivory wedding invitation. ONE very sparse, refined botanical spray photographed from directly overhead, isolated on genuine transparent alpha background. Anchored at LOWER LEFT: one small half-open ivory spray rose with the faintest blush, two tiny cream buds, airy delicate champagne-beige dried leaves and a very few tiny baby's breath florets, slender stems extending UP along the left edge and RIGHT along the bottom edge. The rose is modest, not a huge flower. The center and upper right 70 percent must remain completely EMPTY/TRANSPARENT for separately rendered text. Macro editorial botanical photograph, realistic rose petal folds, delicate translucent dried leaf veins; not watercolor, not vector or cartoon. Soft diffuse light from upper left, muted warm parchment/ivory/soft blush palette, tiny shading within petals, no external drop shadow. Entire spray in frame with slight transparent padding. Square image. NO background, NO paper, NO card, NO border, NO letters, NO watermark. A sparse corner botanical decoration, not a complete invitation or bouquet.
