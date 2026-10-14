# Lieutenant Fizz app icon — 2g, "Fizz ring · Zargoth"

Ben in the fizz ring, in EGA magenta (the colours of Planet Zargoth), on the ink ground #0A0A0D. The source is a 512×512 pixel-art SVG. The full mark fills most of its square, which suits a store listing and the web icons, so the adaptive icon layers draw it smaller (see below).

- fizz-icon.svg — full 512 mark with a rounded ground (store listing, site, README, the web icons). The committed source for everything below.
- ic_launcher_foreground.svg / ic_launcher_background.svg — adaptive icon layers. Android shows only the middle 72 dp of the 108 dp layer through the launcher's mask and keeps 66 dp of it clear of the edge, so the artwork is drawn at 72 % of its full size (a group with `scale(0.72)` about the centre) and the farthest sparkle sits inside that 66 dp circle. Drawn at full size the ring filled the whole mask and the sparkles were cut off, which looked zoomed in. The foreground is the mark without its ground and the background is the plain ground.
- ic_launcher_monochrome.svg — Android 13+ themed icon layer (single colour, the system tints it): the ring outline and the figure's silhouette.
- ic_notification.svg — 24 dp small icon, currentColor, ring and centre pixel only.
- fizz-icon-dev.svg — the real mark with a small "Dev" ribbon, clipped to the rounded square, for the desktop and iOS sets of the side-by-side dev build.
- fizz-icon-android-dev.svg — the adaptive foreground with the ribbon (a full-bleed ground, the mark scaled as in the foreground layer, and a ribbon whose lettering stays inside the 66 dp safe zone). The "Dev" lettering is baked vector outlines, not `<text>`, because `<text>` needs a system font and renders as nothing inside the dev build container.
- tauri-icon.json — the manifest `tauri icon` reads for the real icons.

Regenerate the real icon set from `apps/player` with `bun run tauri icon ../../assets/icon/tauri-icon.json`; this writes `src-tauri/icons/` and patches the tracked Android launcher icons in place. `scripts/prepare-android-dev.sh` stamps the dev variant onto a regenerated dev project; the dev icons are never committed as generated output.

The web icons in `episodes/episode-1/public/icons/` are drawn from `fizz-icon.svg` by `bun run build:icons`.
