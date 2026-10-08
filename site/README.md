# Landing page

The static landing page published at <https://liminalhq.ca/lieutenant-fizz/>. It has no build step and no dependencies. It is set in the Fizz pixel font: `assets/fonts` is a link to `packages/engine/assets/fonts` (the Pages build copies the real files, with their `OFL.txt` licence), and `css/site.css` sizes every piece of text as 11px times a whole number so the pixels stay crisp. Every link is relative, so it works under any subpath.

## Adding an episode

Add one object to `episodes.json`. Cards are sorted by `number`, and the "more episodes soon" tile is always last.

```json
{
  "id": "episode-2",
  "number": 2,
  "series": "Lieutenant Fizz",
  "title": "Title",
  "tagline": "One or two sentences.",
  "status": "coming-soon",
  "path": "./episode-2/",
  "thumbnail": "assets/episode-2.jpg",
  "thumbnailAlt": "Describe the image"
}
```

- `series` is optional and prefixes the card's episode label ("Lieutenant Fizz — Episode 2").
- `status` is `playable` (links to `path`) or `coming-soon` (a non-clickable card).
- `thumbnail` is optional; put a ~800px wide JPEG in `assets/`.
- When an episode ships, flip `status` to `playable`.

## Pages artifact layout

The workflow assembles:

```
<artifact>/             <- contents of site/ copied here (index.html, css/, js/, assets/, episodes.json)
<artifact>/episode-1/   <- episode 1's built dist (index.html at its root)
<artifact>/episode-N/   <- one per episode, directory name = the `id` in episodes.json
```

```sh
mkdir -p _site && cp -r site/. _site/
cp -r episodes/episode-1/dist _site/episode-1   # repeat per episode
```

Each episode must build with a base path of `/lieutenant-fizz/episode-N/` (or relative assets). Preview locally with `python3 -m http.server -d _site`.
