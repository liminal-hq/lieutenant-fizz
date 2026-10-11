# Google Play store graphics

The artwork for the Play Console listing. The SVGs are generated; do not edit them by hand.

- `feature-graphic-1024x500.svg` is a clean version of the README hero: the same Planet Zargoth scene with more sky, and only the title and episode name, drawn from the Fizz glyph grids so it needs no font.
- `icon-512.svg` is `assets/icon/fizz-icon.svg` without its rounded corners, because Play applies its own mask.

Regenerate them with `bun run build:play-graphics` (`bun run check:play-graphics` fails when they are out of date, and `bun run validate` runs it). The script reads `assets/hero.svg` and the icon, so a change to either needs a regenerate.

Play wants PNGs. Render them from the SVGs with librsvg, then make the icon a 32-bit PNG with ImageMagick:

```sh
rsvg-convert -w 1024 -h 500 feature-graphic-1024x500.svg -o feature-graphic-1024x500.png
rsvg-convert -w 512 -h 512 icon-512.svg -o icon-512.png
magick icon-512.png -alpha on PNG32:icon-512.png
```

The listing text, the field limits and the screenshot sizes are kept with the maintainer's store notes, not in the repository.
