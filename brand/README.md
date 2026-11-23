# Double Helix brand assets

This directory contains the source assets for the approved Double Helix identity
rollout.

## Approved marks

- `assets/double-helix-symbol-*.svg` uses the selected A helix geometry, with the
  level top and bottom ends and the approved rightward tilt.
- `assets/double-helix-wordmark-*.svg` combines that exact mark with the B2
  compact Manrope 500 wordmark. The lettering is converted to vector paths so
  it renders consistently without loading a font in each storefront.
- `assets/Manrope-OFL.txt` is the typeface licence for the outlined lettering.

The light and dark suffixes describe the mark colour for light or dark surfaces.
They do not change the broader interface palette or general UI typography.

## App assets

`app-icon.svg`, `android-foreground.svg`, `android-monochrome.svg`,
`splash-mark.svg`, and `favicon.svg` are the vector sources for the installed
app and browser marks. PNG exports are used where native platforms require
raster images. The matching copies used at runtime live in each app's asset
folder; update those copies from these sources if the identity changes.

Web and theme use the SVG wordmarks directly. Shopify can optionally replace its
fallback wordmark with a merchant-selected logo and adjust its displayed width.
