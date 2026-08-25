# RAW.RETRO

A static, single-page site for [@raw._retro](https://www.instagram.com/raw._retro/) —
retro camcorder photography and video. Old Sony camcorders, shot to tape:
car meets, night runs, gyms, and now taking bookings for concerts, weddings
and events.

Built on the same architecture as
[shutterkif-oss.github.io](https://github.com/shutterkif-oss/shutterkif-oss.github.io),
re-skinned onto the RAW.RETRO brand kit and loaded with this archive's own footage.

No build step. No dependencies to install. Open `index.html` through any static
server and it runs.

```bash
python3 -m http.server 4173
```

---

## What's on the page

| # | Section | What it is |
|---|---------|-----------|
| — | **Boot** | SMPTE colour bars, the wordmark, and a seven-segment counter that waits on the 3D scene. |
| 01 | **Front** | The graffiti wordmark at size, flanked by the dice and the two slowly counter-rotating stars, one line of tape-deck caps beneath. |
| 02 | **The machine** | A real-time PSP you can operate. Ten clips loaded as channels. |
| 03 | **About** | Copy, with MiniDV cassettes and Memory Stick PRO cards in the side margins. |
| 04 | **Contact** | Instagram and email, with the VX2000 bleeding off the bottom-left corner. |

Two fixed controls sit bottom-right: **invert** flips every surface on the page
*and* the PSP's casing; **sound** only appears if an audio track is present
(see [Music](#music)).

A camcorder OSD — blinking `REC`, a running timecode, `SP` — is pinned to the
viewport corners, over the top of everything.

## The machine

`js/psp.js` loads `assets/models/psp.glb`, then re-orients it **from the screen
plane** rather than trusting the exporter's axes: it finds the largest triangle
on the screen mesh to get the plane normal, and derives "down" from where the
HOME / VOL / SELECT / START row actually sits. The screen's UVs are rebuilt by
PCA over the vertices projected into that plane, so the picture is welded to the
glass and stays square in its own bezel at any tilt.

The screen itself is a live `<canvas>` sampled through a CRT shader — pixel
grid, phosphor stripes, scanline gaps, chromatic split, barrel warp, a
horizontal tear on channel change, and a power-on slit that opens into the
picture. The screen is also the main light source: its average colour is read
back at ~6 Hz and drives three point lights, so a bright frame genuinely throws
light across the buttons.

**Controls**

| Input | Does |
|-------|------|
| `←` `→` / D-pad / ○ △ | Previous / next channel |
| `↑` / `↓` | First / last channel |
| ✕ / START / tapping the screen / ↗ | Opens the Instagram profile |
| □ / SELECT / HOME | Jumps to About |
| Drag | Turns the machine; springs back to dead-front |

Buttons are picked with a raycaster and physically depress along an axis
computed in each button's own parent space.

## Media

`assets/reels/*.mp4` are 6-second muted loops trimmed out of the finished edits
in `../EDITZ`. `assets/works/*.jpg` are the posters — each one is **the first
frame of its own loop**, so the still and the motion can never disagree.

Clips are fetched only when a channel is selected; the poster covers the gap,
and the two neighbouring channels are pre-warmed on idle.

Everything was cut with the macOS built-ins, no ffmpeg:

```bash
avconvert --preset PresetLowQuality --source "EDIT.mov" \
          --output reels/id.mp4 --start 48 --duration 6 --replace
qlmanage -t -s 1024 -o /tmp reels/id.mp4          # poster = first frame
sips -s format jpeg -s formatOptions 72 -Z 800 /tmp/id.mp4.png --out works/id.jpg
```

To change which moment a clip opens on, edit the start time and re-run both
steps — the poster must be regenerated from the new clip or it will no longer
match.

To reorder, retitle or add channels, edit `js/data.js`. Nothing else needs to
know.

## Type

Straight out of `../BRANDING/FONTS`, with each face kept to the job its folder
implies:

- **VCR OSD Mono** — the main face. Section headings, the camcorder OSD,
  controls, captions and the PSP's own HUD, so the page reads as one burnt-in
  signal
- **Share Tech Mono** — body copy (left-aligned, never justified: a stretched
  word-space in a fixed-width face is as wide as a glyph and the rivers show)
- **Silkscreen** — small pixel labels, colophon
- **DSEG7 Classic** — only numbers a device would actually have lit

## Cut-outs

`assets/el/` holds the dice and the two stars (carried over from the reference
build), plus the VX2000, two MiniDV cassette shots and the Memory Stick PRO
cards. The dice and stars are **dark artwork on an opaque white
rectangle** — `dice.png` has no alpha channel at all — so they are never
dropped in as-is. Each cut-out is inverted and blended against the paper it
sits on:

| Page | `--el-inv` | `--el-blend` | Result |
|------|-----------|--------------|--------|
| dark (default) | `1` | `screen` | artwork lighter than the paper, screens onto it |
| inverted | `0` | `multiply` | artwork darker than the paper, multiplies into it |

Get either half wrong and the source rectangle shows up as a white or black box
over the composition.

Behind the About copy there is also a soft scrim (`.lay--bio::before`) painted
in `--paper` and heavily blurred, so it pushes the background away from the text
colour in either polarity without reading as a panel sitting on the
composition. The reveal transition re-states the invert for the same
reason — a bare `filter:none` would drop it on the final frame.

The stars turn against each other on `@property --spin`, so the scroll parallax
on `transform` stays live instead of being frozen into the keyframes.

The generated props — `vx2000`, `dv-a`, `dv-b`, `memstick` — are the exception:
their backgrounds were flood-filled to **transparent** rather than left white. That is more forgiving than depending on the white
background being exactly `#fff` — a near-white gradient inverts to near-black
and screens as a faint visible rectangle. Transparency sidesteps the question
entirely and still works in both blend directions.

The tape and card shots also carry real drop shadows, so those are matted with
a **soft alpha ramp** rather than a binary cut. A hard cut at one threshold
either leaves the shadow as an opaque grey blob with a visible edge, or — set
low enough to remove it — eats the object's own dark edges.

Adding a new prop is one command:

```bash
python3 _build/cutout.py ~/path/to/shot.jpg assets/el/newprop.png
```

It downscales with `sips`, flood-fills the background in from the border, and
ramps alpha to nothing across brightness 200→250. Flood-filling from the border
(rather than thresholding globally) is what keeps bright areas *inside* the
object opaque — a white label, a specular highlight on a lens ring — because
they are not connected to the edge. Tune with `--width`, `--flood`, `--clear`;
it warns if it cut almost nothing or almost everything.

No Pillow and no numpy on this machine, so it decodes and re-encodes PNG
directly on `zlib`.

## Layout

Every composed section sits on a 16:9 stage of definite size, with positions in
percent-of-stage and type in `cqw`, so a composition scales as one rigid piece.
The stage is `container-type: size` and stays absolutely positioned at every
breakpoint — narrow screens change the aspect, never the coordinate system.

### The stage is centred with explicit margins, not `margin:auto`

`margin:auto` is the obvious way to centre an absolutely positioned box and it
is **wrong** for a box larger than its container. Per CSS 2.1 §10.3.7, when
`left`/`right` are both `0` and equal auto margins would have to be negative,
the spec sets `margin-left` to zero and lets `margin-right` absorb the rest. The
stage therefore pinned to the left edge and the whole composition slid right by
half the overflow — at 1200x799 the stage is 1420 wide, so everything sat 110px
right of centre. It only ever looked correct at exactly 16:9, where the overflow
is zero. The same applied vertically, which also put the seam mask in the wrong
place.

So the stage sets `left/top: 50%` with `margin-left/-top: calc(var(--stage-w) / -2)`.
A transform is not an option — `[data-rise]` owns `transform` on this element
for the hero reveal.

### Narrow type is clamped on both axes

Every size in the narrow block is `min(Ncqw, Mcqh)`. Sizing on `cqw` alone is
right for a phone and wrong for a tablet: at 390x799 the stage is portrait and
width is the scarce axis, but at 810x799 it is nearly square and the same figure
resolves to roughly twice the pixels while the available height has not moved.
That is what pushed the About copy off the bottom and put the tape on the
heading.

### Breakpoints

| Band | Width | About anchors |
|------|-------|---------------|
| Desktop | > 820px | heading 24%, copy 37% |
| Tablet | 601–820px | heading 27%, copy 38%; tape shrinks to 30% and moves to the corner |
| Phone | ≤ 600px | heading 20%, copy 31% |

The tablet band exists because the copy reflows much shorter there than on a
phone, so the same offsets that centre the group at 390x799 leave 305px of dead
space at 810x799. Verified balanced at all four: 1440x799, 1200x799, 810x799,
390x799.

## Music

`assets/audio/theme.m4a` — *Daymian · Destroy Lonely, "if looks could kill"
(og beat)*, 3:15, AAC, 3.8 MB. Transcoded from the Final Cut library copy with
`avconvert --preset PresetAppleM4A`.

**It is on by default**, and the handling around that is the fiddly part:

- Autoplay *with sound* is refused on a cold visit. On refusal the track is set
  rolling **muted** — which is always permitted — so it buffers, and listeners
  wait for the first real gesture to unmute it. Unmuting cannot fail the way a
  first `play()` on a cold network can.
- `wheel` and `scroll` are **not** user-activation gestures. This is a
  scroll-driven site, so the first thing most visitors do is scroll: the arming
  listeners are therefore not `{once:true}` and only tear down on *confirmed*
  success. Getting this wrong means one scroll kills the audio for the session.
- The choice is remembered per session in `sessionStorage`, so anyone who turns
  it off is not asked twice.
- If the file is ever missing the toggle removes itself rather than sitting
  there doing nothing — checked against `audio.error` and `networkState === 3`
  as well as the `error` event, since a 404 can fire before the script runs.

`preload="auto"` is deliberate and load-bearing for the above, but it does mean
3.8 MB is fetched on every visit on top of the 12 MB model. If that matters more
than instant unmute, that is the knob to turn.

**Licensing:** this is a commercial music track. Fine for a personal page, but
worth clearing before any paid or promoted use of the site.

## Before it goes live

- **The photographic props are AI-generated**, not shots of your gear:
  `vx2000.png`, `dv-a.png`, `memstick.png`. The camcorder and the cassette read
  convincingly. **`memstick.png` is the weak one** — it came back as two plain
  dark slabs with no connector contacts and no notched corner, so it reads as
  "a card" rather than as a Memory Stick PRO. You own the real things; shoot
  them on a plain white wall and they are straight one-file swaps, using the
  matting described above.
- Every channel's ↗ points at the profile, not at an individual post. If you
  have per-post permalinks, put them in `link` in `js/data.js`.

## Hosting

See **[HOSTING.md](HOSTING.md)**. It is static files with no build step, so
anything serves it; Cloudflare Pages is the pick. The folder is already a git
repo with a first commit and nothing pushed.

## Framer

See **[FRAMER.md](FRAMER.md)**. Short version: host it and embed it full-bleed —
this is a self-contained app that assumes it owns the scroll and the viewport,
so it wants its own window rather than to be rebuilt as Framer layers.
`framer/RawRetroEmbed.tsx` is a ready-to-paste code component; it exists because
Framer's stock Embed cannot set `allow="autoplay"`, without which a cross-origin
iframe can never start the audio.

## Credits

The PSP model and the renderer it grew out of come from the
`shutterkif-oss.github.io` repository.
