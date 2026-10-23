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

The printed card is reconstructed from the commissioned SVGs, including the
original single-line couple names, blessing, ampersand, two line ornaments,
heart and contact block. Only the printed RSVP word is replaced by Reply (or
Edit reply). Its invisible hit area remains 44px high. The rectangular gold
frame was removed because it does not appear on the physical card.

The printed wording is documented in manifest.json's printedContent field.
Matching configured details use the exact outlines; changed names, event details,
reply date or contacts fall back to live text in the same positions. Guest names
remain personalized. The opening, closing, thank-you and wax impression all use
monogram.svg directly, without recreating initials. `scripts/preview-card.ts` remains a preview of the
original exported SVG layers; inspect the guest route to review the live card.

## Realistic corner florals

`public/card/rose-corner-upper.1e4c20dbac.webp` (68 KB) and `public/card/rose-corner-lower.6277f50c09.webp` (55 KB) are transparent botanical cutouts generated with the built-in imagegen tool. Their optimized 512 px WebP versions preserve alpha and use content-hashed filenames. They decorate the surrounding guest experience: the intro closing message, RSVP sheet, thank-you screen, and guest notices. The invitation card uses the original card-florals.svg with its full-size print clusters and the offsets in src/lib/card/layers.ts; those vector clusters retain their staggered reveal. The photographic satin background remains unchanged. The supplied monogram is used without additional sprigs.

Upper corner generation prompt:

> Use case: photorealistic-natural. Asset type: transparent floral corner cutout for an existing luxury ivory wedding invitation, replacing thin vector botanicals while preserving their sparse corner placement. Create ONE refined botanical spray, photographed from directly overhead, isolated on a genuinely transparent alpha background. An airy asymmetric triangular corner arrangement anchored in the UPPER RIGHT corner: one small open cream garden rose with barely blush petal tips near the upper right, two tiny ivory buds, delicate branching champagne beige leaves and sparse tiny ivory dried blossoms extending LEFT along the top and DOWN the right edge. Leaves have realistic fine veins and translucent dried texture, rose has intricate soft layered petals. Center and lower-left 70 percent stay completely EMPTY/TRANSPARENT so typography will remain unobstructed. Flowers and stems must taper delicately into the open space, no heavy bouquet. Soft diffuse light from upper left; tiny natural contact shading within petals, no cast shadow outside the cutout. Muted warm ivory, parchment, pale blush, champagne sage. Macro editorial botanical photograph, crisp natural texture, not vector, not cartoon, not outlined watercolor. Entire spray visible with slight transparent padding. Square image. NO paper, NO background, NO card, NO border, NO typography, NO watermark.

Lower corner generation prompt:

> Use case: photorealistic-natural. Asset type: transparent lower-left botanical corner cutout for a luxury ivory wedding invitation. ONE very sparse, refined botanical spray photographed from directly overhead, isolated on genuine transparent alpha background. Anchored at LOWER LEFT: one small half-open ivory spray rose with the faintest blush, two tiny cream buds, airy delicate champagne-beige dried leaves and a very few tiny baby's breath florets, slender stems extending UP along the left edge and RIGHT along the bottom edge. The rose is modest, not a huge flower. The center and upper right 70 percent must remain completely EMPTY/TRANSPARENT for separately rendered text. Macro editorial botanical photograph, realistic rose petal folds, delicate translucent dried leaf veins; not watercolor, not vector or cartoon. Soft diffuse light from upper left, muted warm parchment/ivory/soft blush palette, tiny shading within petals, no external drop shadow. Entire spray in frame with slight transparent padding. Square image. NO background, NO paper, NO card, NO border, NO letters, NO watermark. A sparse corner botanical decoration, not a complete invitation or bouquet.

## Link preview artwork

`og-invitation-paper.8ea15a301e.jpg` (47 KB, 1200 × 630) is a deterministic
composition of the existing satin image and the two rose corner cutouts, with
the same warm paper palette as the invitation. The satin is center-cropped to
1200 × 630. The paper occupies `(68, 34, 1064, 562)`, and the 356 px roses sit
at `(776, 34)` and `(68, 240)`. It contains no text or personal information;
the commissioned monogram, couple names and household address remain live in
the Open Graph image route. JPEG is intentional because the installed Satori
renderer cannot decode these WebP sources directly. Keep a new content hash
when replacing the image and update the route's `invitation-v2` image identity
when changing the shared design. An updated URL helps new unfurls; messaging
apps may retain previews already cached for earlier messages.
