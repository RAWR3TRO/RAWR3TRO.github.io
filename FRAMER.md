# Putting this into Framer

Short answer: **host the site, then embed it full-bleed in a Framer page.** Do
not try to rebuild it as Framer layers.

The reasoning matters, because it decides the whole approach.

## Why embedding, and not a native rebuild

This is not a page of content — it is a self-contained app that assumes it owns
the window:

- **It owns the scroll.** `js/main.js` reads `window.scrollY` and each section's
  `offsetTop` to bleed the backdrop tone across the seams and drift every
  element at its own rate. Inside Framer's own scroll container those numbers
  mean something different.
- **It owns the viewport.** Four sections at `100svh`, plus five
  `position:fixed` overlays — the OSD, the controls, the grain, the scanlines,
  the tracking bar. `fixed` pins to the viewport, which in Framer is Framer's,
  not this page's.
- **It runs WebGL with a 12MB model**, a CRT shader, and a `<canvas>` re-uploaded
  as a texture every frame.
- **It uses `mix-blend-mode` against a specific paper colour.** Framer sections
  above and below would blend into it.

An iframe gives it its own window, which is exactly what it wants. Everything
below was verified working in an embed — not assumed.

## Verified in an embed

| | Result |
|---|---|
| WebGL context | alive, not lost |
| PSP model + CRT shader | loads and renders |
| Audio | `readyState 4`, playing, no error |
| `100svh` sections | resolve to the frame, not the outer page — 4 × frame height |
| `position:fixed` overlays | pin to the frame, correctly |
| `localStorage` / `sessionStorage` | fine same-origin (see caveat 2) |

## Step 1 — host it

Any static host. The whole site is `index.html` + `css/` + `js/` + `assets/`,
no build step.

**GitHub Pages** (what the reference build uses):

```bash
cd "/Users/akmed/Documents/RAW. RETRO/site"
git init && git add -A && git commit -m "RAW.RETRO site"
gh repo create rawretro-site --public --source=. --push
gh api -X POST repos/:owner/rawretro-site/pages -f "source[branch]=main" -f "source[path]=/"
```

Cloudflare Pages or Netlify work the same way and are faster for the 12MB model.

> **Note on weight:** first load is ~18MB — 12MB PSP model, 3.8MB audio, ~2MB
> cut-outs. Fine on desktop, slow on cellular. If that matters, the model is the
> thing to compress (Draco/meshopt via `gltf-transform`), not the images.

## Step 2 — embed it in Framer

1. New page in Framer.
2. Set the page background to **black** (`#000`), so nothing flashes light
   during load.
3. Insert → **Embed**, choose **URL**, paste your deployed URL.
4. Size the embed **Fill × Fill** (or width `100%`, height `100vh`).
5. Set the frame's padding to 0 and remove any Framer nav *inside* the flow —
   see caveat 1.

### Or use the code component

`framer/RawRetroEmbed.tsx` in this folder is a ready-to-paste Framer code
component. It exists because Framer's stock Embed does not let you set the
`allow` attribute, and **without `allow="autoplay"` a cross-origin iframe cannot
start the audio** — the site would silently fall back to its muted-until-gesture
path forever.

In Framer: **Assets → Code → New Code File**, paste it in, then drag
`RawRetroEmbed` onto the page and set the URL in the properties panel.

## The three real caveats

### 1. Nested scroll — put nothing above or below it

The embed scrolls internally. If the Framer page also scrolls, visitors get two
scroll containers fighting each other, and the site's four full-height sections
become impossible to page through.

**So the Framer page should be *only* the embed, at exactly `100vh`.** If you
want Framer nav on top, position it `absolute`/`fixed` **over** the embed rather
than in the flow above it.

Do not try to make the iframe `400vh` tall to avoid the inner scroll. A tall
iframe has a tall viewport, so `100svh` sections would each become 400vh and
every `position:fixed` overlay would pin to the top of the frame and scroll away.

### 2. Cross-origin storage is partitioned

Once the site is on a different domain from the Framer page, Safari and Chrome
partition or block third-party storage. The invert and sound preferences are
stored in `localStorage`/`sessionStorage`, so they may not persist between
visits.

This degrades cleanly — every access is already wrapped in `try/catch`, so
nothing throws; the toggles just start at their defaults. If you want it solid,
put the site on a **subdomain of the Framer domain** (`app.rawretro.com`
embedded in `rawretro.com`) and it stops being third-party.

### 3. Autoplay

Cross-origin iframes are gated harder than top-level pages. The site already
handles refusal correctly — it rolls the track muted so it buffers, then unmutes
on the visitor's first real gesture — but it needs `allow="autoplay"` on the
iframe to have any chance of starting with sound. That is the main reason to use
the code component over the stock Embed.

## If it truly must be native Framer layers

Possible, but it is a rewrite, not an import. What would have to change:

- **Rescope the scroll engine** from `window` to a container element:
  `scrollY` → `el.scrollTop`, `offsetTop` → offset within that container, and
  the `IntersectionObserver` calls need an explicit `root`.
- **Re-anchor the fixed overlays** to that container (`position:absolute` inside
  a `position:relative` wrapper), since `fixed` would escape to Framer's viewport.
- **Import Three.js as ESM** — Framer has no importmap, so
  `import * as THREE from "https://esm.sh/three@0.160.1"` and the same for the
  three addons.
- **Move the CSS** into the component, scoped, because the custom properties
  (`--paper`, `--el-inv`, `--el-blend`) are global and would leak into Framer.
- **Keep `100svh` off** — the sections would need the container's height instead.

That is a real day of work and it buys you very little over the embed, because
the page is meant to be full-bleed anyway.
