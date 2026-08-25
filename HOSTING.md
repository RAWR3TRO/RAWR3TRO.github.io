# Hosting

The site is plain static files — `index.html`, `css/`, `js/`, `assets/`. No
build step, no server, no dependencies. Any static host will serve it.

It is **22MB**, 12MB of which is the PSP model. That is fine everywhere below,
but it is the number to keep in mind.

The folder is already a git repo with a first commit, and `.DS_Store` and
`.claude/` are ignored. Nothing has been pushed anywhere.

---

## Quickest — Netlify Drop (no account, ~30 seconds)

1. Go to **[app.netlify.com/drop](https://app.netlify.com/drop)**
2. Drag the whole **`site`** folder onto the page
3. You get a live URL immediately

Good for showing someone today. The URL is random (`fluffy-pika-1a2b3c.netlify.app`)
and you need a free account to keep it or attach a domain.

---

## Best for the real thing — Cloudflare Pages

Free, unlimited bandwidth, fast CDN, free custom domain and SSL. Worth it here
because of the 12MB model.

**Without connecting git:**

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Upload assets**
2. Name it `rawretro`
3. Drag the **`site`** folder in → **Deploy**
4. Live at `rawretro.pages.dev`

**Connected to git (better, because you will iterate):** put the repo on GitHub
first (below), then in Cloudflare choose **Connect to Git** instead of Upload.
Build command: leave **empty**. Output directory: `/`. After that every `git push`
redeploys automatically — no re-dragging every time you swap a clip.

---

## If you want the source public — GitHub Pages

This is what the reference build uses. You have `git` but not the `gh` CLI, so
create the repo in the browser:

1. [github.com/new](https://github.com/new) → name it `rawretro-site` → **Create**
   (do **not** add a README, it would conflict with the commit already here)
2. Then, in Terminal:

```bash
cd "/Users/akmed/Documents/RAW. RETRO/site"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/rawretro-site.git
git push -u origin main
```

3. On GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/ (root)`**
4. Live at `https://YOUR-USERNAME.github.io/rawretro-site/` in a minute or two

---

## Custom domain

Same idea on all three: add the domain in the host's dashboard, then at your
registrar point

- an **`A`/`ALIAS`** record for the apex (`rawretro.com`), and
- a **`CNAME`** for `www`

at whatever the host tells you. Cloudflare is the least fiddly if the domain is
already registered with them. SSL is automatic everywhere.

---

## Things worth knowing

**`_headers` is already set up.** Cloudflare Pages and Netlify both read it. The
model and fonts are cached for a year as immutable; the clips, posters and
cut-outs revalidate daily because swapping a channel reuses the same filename,
so caching those forever would serve the old one. `index.html` never caches, or
a deploy would not take effect. **GitHub Pages ignores this file** — it has no
custom header support.

**Redeploying is a full re-upload** on the drag-and-drop routes. That is the main
argument for connecting git: `git add -A && git commit && git push` and it is
live.

**`_build/` and `framer/` get published too.** Harmless — a Python script and a
TypeScript file — but if you would rather they were not public, delete them from
the deployed copy or move them up a level, out of `site/`.

**Cellular load is slow.** 22MB on first visit. If that becomes a problem the
model is the thing to attack, not the images — `gltf-transform` with Draco or
meshopt typically takes a GLB like this down by 70–90%. That needs node, which
this machine does not currently have.
