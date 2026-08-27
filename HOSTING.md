# Hosting

The site is plain static files — `index.html`, `css/`, `js/`, `assets/`. No
build step, no server, no dependencies. Any static host will serve it.

It is **12MB** on disk and about **4MB on first paint** (the 3.9MB track loads
after the boot screen hands over, and the below-the-fold artwork is lazy). The
largest single file is 3.8MB — GitHub's hard limit is 100MB per file, so
nothing here is close.

The folder is already a git repo. `.DS_Store` and `.claude/` are ignored, and
`.nojekyll` is present so GitHub Pages serves the files verbatim.

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

## GitHub Pages

What the reference build uses, and free for a public repo.

`gh` is not installed on this machine, so the repo gets created in the browser
and pushed from Terminal.

**1 — set your git identity** (not configured yet; commits fail without it):

```bash
git config --global user.name "Your Name"
git config --global user.email "Raw.R3tro@gmail.com"
```

**2 — commit what is currently uncommitted:**

```bash
cd "/Users/akmed/Documents/RAW. RETRO/site"
git add -A
git commit -m "Optimise payload, fix invert lighting, add build scripts"
```

**3 — create the repo:** [github.com/new](https://github.com/new) → name it
`rawretro-site` → Public → **Create**. Do **not** tick "Add a README" — this
folder already has commits and it would collide.

**4 — push:**

```bash
git remote add origin https://github.com/YOUR-USERNAME/rawretro-site.git
git push -u origin main
```

**5 — turn Pages on:** repo **Settings → Pages → Source: Deploy from a branch**
→ branch `main`, folder `/ (root)` → **Save**.

Live at `https://YOUR-USERNAME.github.io/rawretro-site/` in a minute or two.

### Two things specific to GitHub Pages

**`_headers` does nothing here.** GitHub Pages has no custom-header support, so
the year-long immutable caching set up for Cloudflare/Netlify does not apply.
It is not a problem — the `?v=` content hashes on the CSS and JS mean a stale
cache can never pair old code with new markup — but assets will revalidate more
often than they would elsewhere.

**`.nojekyll` matters.** Without it Pages runs the whole repo through Jekyll,
which silently skips every file and folder whose name starts with an underscore.
Nothing the page loads is underscore-prefixed today, but `_build/` is, and one
day something in `assets/` might be. The empty `.nojekyll` file turns all of
that off and serves the tree verbatim.

### The repo carries the old model in its history

`.git` is ~21MB against a 12MB working tree, because the first commit contains
the original 11.8MB `psp.glb` from before the textures were re-encoded. Git
keeps it forever. That is harmless at this scale — GitHub's soft limit is 1GB —
but if you ever want it gone, the history has to be rewritten
(`git filter-repo`), and the simpler option is to start a fresh repo from the
current tree.

---

## Custom domain — rawretro.net

Registered at Squarespace. That choice matters more than it looks, because it
decides which host is the easy one.

**A CNAME cannot sit at the apex.** It is a DNS rule, not a vendor limitation:
the root of a zone already carries SOA and NS records, and CNAME is not allowed
to coexist with them. Hosts get around it in one of two ways — publish real `A`
records (GitHub Pages does), or offer a synthetic `ALIAS`/`ANAME` that resolves
server-side (Cloudflare does). Squarespace's DNS panel has no ALIAS record type.

So: **GitHub Pages works with Squarespace DNS as-is. Cloudflare Pages needs the
nameservers moved first.**

### Option A — GitHub Pages, DNS stays at Squarespace

Least moving parts. In **Squarespace → Domains → rawretro.net → DNS Settings**:

| Type | Host | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `YOUR-USERNAME.github.io.` |

Those four are GitHub's Pages CDN — verified by reverse lookup
(`cdn-185-199-10x-153.github.com`). Optionally add the IPv6 equivalents as
`AAAA` on `@`: `2606:50c0:8000::153` through `...8003::153`.

Then **repo → Settings → Pages → Custom domain** → `rawretro.net` → Save. Wait
for the DNS check to go green, then tick **Enforce HTTPS**.

That writes a file called `CNAME` into the repo root containing the domain.
Leave it there — deleting it un-sets the custom domain on the next deploy.

### Option B — Cloudflare Pages, nameservers moved to Cloudflare

Better hosting for this site: Cloudflare honours `_headers` (GitHub ignores it
entirely), and has unlimited bandwidth. The domain stays **registered and billed
at Squarespace** — only DNS moves.

1. Cloudflare dashboard → **Add a site** → `rawretro.net` → Free plan. It scans
   existing records and gives you two nameservers.
2. **Squarespace → Domains → rawretro.net → Nameservers → Use custom
   nameservers** → paste Cloudflare's two → Save. Propagation is usually minutes.
3. Cloudflare → **Workers & Pages → your project → Custom domains → Set up a
   domain** → `rawretro.net`. Cloudflare writes its own records; CNAME
   flattening handles the apex, so there is nothing to hand-enter.

### Either way

Add `www` as well as the apex and let the host redirect one to the other, so
both spellings work. GitHub redirects `www` → apex automatically once both are
configured; Cloudflare needs a redirect rule, which is one line in the dashboard.

SSL is automatic and free on both. Allow up to an hour before assuming something
is wrong — DNS propagation is genuinely slow sometimes, and both hosts have to
issue a certificate after the records resolve.

**rawretro.com is taken** — parked on ParkingCrew, no real site behind it. So
anyone who types `.com` out of habit lands on ads rather than on you. Nothing to
do about it short of buying it off the parker, but worth knowing when you print
the domain on anything.

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

**First visit is ~4MB**, down from ~20MB: the model's five 4096x4096 textures
were re-encoded (11.8MB → 2.6MB, `_build/optimize_glb.py`), the cut-outs were
converted to greyscale PNG with adaptive filtering (55% off,
`_build/optimize_png.py`), the 3.9MB track now attaches after the boot screen
instead of competing with it, and below-the-fold artwork is `loading="lazy"`.

**After editing CSS or JS, re-stamp before deploying:**

```bash
python3 _build/stamp.py
```

That refreshes the `?v=` content hashes in `index.html`. Skip it and a returning
visitor can run new HTML against a cached old script — which fails silently and
is genuinely hard to spot.
