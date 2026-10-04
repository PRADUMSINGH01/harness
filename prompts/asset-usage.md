## How to use assets

Assets are what make a film look like *this* brand and not a template. Use the ones you were given; reach for the library before drawing something by hand.

### Rules for every asset

- **Reference project files only.** Every `src`, `href`, and CSS `url()` points at a file inside `PROJECT_DIR` (for example `assets/logo/stripe-official-logo.svg`). Never hotlink a remote image, video, or SVG: renders run offline and in parallel. Don't add `crossorigin` to `<video>`/`<audio>`.
- **Required assets must appear.** If `assets/ASSETS.md` marks an asset **required**, it has to be clearly visible in the film. The gate fails a variant that never references it, and the judge checks the frames.
- **Never distort.** Keep each asset's aspect ratio (it's in `ASSETS.md`). Size by one dimension (`width: 420px; height: auto`) or use `object-fit: contain`/`cover`; never set both `width` and `height` to values that don't match the ratio.
- **Never upscale raster images past about 1.5× their native size.** A 400px photo shown 1200px wide looks soft on a phone. Pick a larger asset or use it smaller.
- **Time the wrapper or the element, not both.** A timed `<img class="clip" data-start data-duration>` is fine; so is a timed wrapper `<div class="clip" ...>` containing an untimed `<img>`. Camera moves (Ken Burns, punch-in, pan) go on an **inner, untimed** wrapper, never on the timed clip itself (`/hyperframes-keyframes`).
- **Looks come from media treatments, not CSS filters.** To darken, warm, stylize, or blur a photo or video, use `hyperframes media-treatment` (see `media-use/references/media-treatments.md`), not `filter:` hacks.

### The creative kit

The library has 225 original SVG building blocks made for this kind of film. Search them before hand-building one, then adapt them to the brand:

- **Kinds:** `background` (aurora, grainy gradient, grids, spotlight, paper), `overlay` (film grain, light leaks, lens flare, VHS, letterbox), `shape` (blobs, sparkles, soft-3D orb and cube, glass panel), `doodle` (hand-drawn circles, underlines, arrows, checks), `mockup` (browser, phone, laptop, cursor, toast, chat, search bar), `chart` (bars, line, donut, gauge, KPI), `title` (lower thirds, callouts, stickers, chapter cards), `matte` (wipes, iris, brush, ink, tiles), `frame` (film strip, polaroid, tape, viewfinder, story chrome), `icon` (one 55-icon line set).
- **Theme it:** inline the SVG (`use_asset` returns the markup) and set `--accent`, `--accent-2`, `--ink`, `--surface`, `--muted`, `--paper`, and `--font` on its wrapper to apply the brand palette and type. As an `<img>` it keeps its default dark palette.
- **Animate its parts:** each description names the parts (`#bar-1`, `#needle`, `.tile`, ...). Draw-on strokes (`.draw`) tween `stroke-dashoffset` from `1.02` to `0`. Every move still follows the doctrine: one-shot and purposeful, never a looping wobble.
- **Replace the copy:** text in mockups, titles and charts is placeholder. Swap in the brief's real words and numbers, and never show UI, prices, or stats the brief doesn't support.
- **Frames** have transparent openings: put the photo or screenshot behind the frame at the box in its description. **Overlays** go on top with the blend mode in `usage.css`. **Mattes** sweep or scale across a cut in the ledger's direction.
- **Restraint:** one or two kit elements per scene. A doodle that circles the key word earns its place; five decorations compete with the message.

### Logos (`kind: logo`)

Official marks are the brand's property. They are **never redrawn, retyped, recolored, cropped, skewed, or partially hidden**.

- Use the file as provided: `<img src="assets/logo/…svg" alt="Stripe">`. Prefer SVG, and size it by height so its proportions hold (`height: 96px; width: auto`).
- **Clear space:** keep empty space around the mark at least 25% of its height. Don't let text, edges, or other elements crowd it.
- **Contrast:** place it on a ground it was designed for. If a `mono` variant exists and the ground clashes, use the mono variant; don't recolor with filters.
- **Minimum size:** at least 64px tall on a 1080p canvas (about 6% of the short edge) when it's the subject; never shrink it into an unreadable speck.
- **Motion:** animate the logo's *container* (fade, scale, slide, mask reveal). A path-draw reveal is allowed only on the real SVG inlined unchanged, drawing its own paths. Never trace a new outline. `usage.outlinePath` in `assets.json` is an approximate silhouette, fine for a mask or glow, never a substitute for the mark.
- **Hold:** a logo lockup at the end of a film gets a clean final hold of at least 1 second.
- **Need a brand's logo you don't have?** Fetch the official mark (`fetch_logo`); never draw one.

### Photos (`kind: photo`)

- Fill the frame with `object-fit: cover` on a sized box, and choose the crop with `object-position` so the subject's focal point survives (for example `object-position: 50% 30%` for a face).
- Give still photos life with a slow, purposeful camera move on an inner wrapper: scale 1.0→1.08 or a gentle pan over the clip's duration. Don't let a photo sit perfectly still for more than about 2 seconds, and don't loop a wobble.
- Text over a photo needs contrast: a scrim (a gradient or solid band behind the text), or text placed on the photo's calm region. The contrast gate checks this.

### Screenshots and UI captures (`kind: screenshot`)

- They are product truth: show them as they are. Crop, frame, zoom, pan, and spotlight regions; never repaint the UI or invent states, numbers, or features.
- Zooming in past 1:1 softens the image. Plan crops so the region you show is at least as large as the viewport, or use a higher-resolution capture of that region.
- Device frames, shadows, and callouts go *around* or *over* the screenshot, never instead of it.

### Illustrations and icons (`kind: illustration`, `icon`)

- SVG: use `<img>` for placement, or inline the SVG markup when you need to animate its parts (stroke-draw, per-group stagger). Keep the `viewBox`.
- Icons share one visual weight and size within a scene; don't mix icon styles from different sets in one row.
- `usage.entrance`/`usage.ease` in `assets.json` are the asset author's suggestion; the film's motion language and the doctrine win when they disagree.

### Textures (`kind: texture`)

- Backgrounds and overlays, not subjects. Tile with `background-image: url('assets/texture/…'); background-size: …` (use `usage.css` from `assets.json` when present), or lay them over a scene at low opacity with `mix-blend-mode`.
- Keep them subtle: a texture that competes with the message is decoration.

### Lottie (`kind: lottie`)

Load it from the project with lottie-web, `autoplay: false`, an explicit `loop`, and register it so HyperFrames can seek it (`hyperframes-animation/adapters/lottie.md`):

```html
<div id="loader" class="clip" data-start="1" data-duration="3" style="width:240px;height:240px"></div>
<script>
  const anim = lottie.loadAnimation({ container: document.getElementById("loader"), renderer: "svg", loop: true, autoplay: false, path: "assets/lottie/progress-ring-loader.json" });
  window.__hfLottie = window.__hfLottie || [];
  window.__hfLottie.push(anim);
</script>
```

Its native length is `durationSec` in `assets.json`. A one-shot holds its last frame; a looping one cycles for the whole clip.

### Video and audio (`kind: video`, `audio`)

`<video src="assets/video/…" class="clip" data-start="…" muted>` for silent b-roll; keep `data-has-audio="true"` (and no `muted`) only when the clip's own sound should play. Music and voiceover go in separate `<audio>` elements. Media playback is owned by the framework: don't call `.play()` yourself.

### Fonts (`kind: font`)

Declare them with `@font-face` pointing at the project file, and use them only for the brand's own type. Body copy still has to pass the readability floor.
