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
