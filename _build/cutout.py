#!/usr/bin/env python3
"""
cutout.py — matte a product shot onto transparency for use as a site cut-out.

    python3 _build/cutout.py SOURCE OUT.png [--width 1100] [--flood 200]
                             [--clear 250] [--mono] [--contrast 100]

Why this exists
---------------
The cut-outs in assets/el/ are composited by CSS, which inverts them and then
either `screen`s them onto black paper or `multiply`s them into white paper
(see the Cut-outs section of the README). That only works if the background is
genuinely absent. A near-white studio background is NOT absent: it inverts to
near-black and screens as a faint but visible rectangle around the object.

So the background is flood-filled from the border and matted out.

The matte is a SOFT RAMP, not a binary cut. Real product shots carry a drop
shadow, and a single threshold either:
  - leaves the shadow as an opaque grey blob with a hard visible edge, or
  - set low enough to remove the shadow, eats the object's own dark edges.
Ramping alpha across `clear`..`flood` keeps the shadow and lets it fall off to
nothing, which is what a matte extraction actually has to do.

Flood-filling from the BORDER (rather than thresholding globally) is what keeps
bright areas *inside* the object — a white label, a specular highlight on a lens
ring — fully opaque. They are not connected to the edge, so the fill never
reaches them.

--mono
------
Converts to greyscale on Rec.709 luma before matting. The site is strictly
black and white — the only colour anywhere is the SMPTE bars on the boot
screen — so a colour source (the Sony feature stickers, for instance) has to be
desaturated or it becomes the loudest thing on the page.

Luma, not a channel average: green carries most of the perceived brightness, so
averaging flattens a saturated red and a saturated green to the same grey and
throws away the contrast that made the artwork legible.

`--contrast N` (percent, default 100 = unchanged) then pushes tones away from
mid-grey around a 128 pivot. Desaturating a bright sticker tends to land
everything in a narrow mid band; 130-160 usually restores the snap.

No Pillow, no numpy: this machine has neither, so PNG is decoded and re-encoded
directly on top of zlib.
"""
import collections
import struct
import subprocess
import sys
import tempfile
import zlib
from pathlib import Path


# ---------------------------------------------------------------- PNG codec
def read_png(path):
    d = Path(path).read_bytes()
    if d[:8] != b'\x89PNG\r\n\x1a\n':
        raise SystemExit(f'{path}: not a PNG (convert it with sips first)')
    pos, idat, hdr = 8, [], None
    while pos < len(d):
        ln = struct.unpack('>I', d[pos:pos + 4])[0]
        typ = d[pos + 4:pos + 8]
        if typ == b'IHDR':
            hdr = struct.unpack('>IIBBBBB', d[pos + 8:pos + 8 + ln])
        elif typ == b'IDAT':
            idat.append(d[pos + 8:pos + 8 + ln])
        elif typ == b'IEND':
            break
        pos += 12 + ln
    w, h, bd, ct, _, _, inter = hdr
    if bd != 8 or inter or ct not in (2, 6):
        raise SystemExit(f'{path}: need 8-bit non-interlaced RGB/RGBA, got depth={bd} type={ct}')
    bpp = 3 if ct == 2 else 4
    raw = zlib.decompress(b''.join(idat))
    stride = w * bpp
    out, prev, p = bytearray(h * stride), bytearray(stride), 0
    for y in range(h):
        f = raw[p]; p += 1
        line = bytearray(raw[p:p + stride]); p += stride
        if f == 1:
            for i in range(bpp, stride):
                line[i] = (line[i] + line[i - bpp]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y * stride:(y + 1) * stride] = line
        prev = line
    return w, h, bpp, out


def write_png(path, w, h, bpp, px):
    stride = w * bpp
    raw = bytearray()
    for y in range(h):
        raw.append(0)                      # filter type 0 (None)
        raw += px[y * stride:(y + 1) * stride]

    def chunk(t, data):
        return (struct.pack('>I', len(data)) + t + data +
                struct.pack('>I', zlib.crc32(t + data) & 0xffffffff))

    Path(path).write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2 if bpp == 3 else 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b''))


# ---------------------------------------------------------------- matte
def to_mono(px, w, h, contrast=100):
    """Rec.709 luma, then an optional contrast stretch about mid-grey."""
    k = max(0.0, contrast / 100.0)
    lut = [max(0, min(255, int(round((v - 128) * k + 128)))) for v in range(256)]
    for p in range(w * h):
        i = p * 4
        y = lut[min(255, int(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]))]
        px[i] = px[i + 1] = px[i + 2] = y
    return px


def cutout(src, dst, width=1100, flood=200, clear=250, mono=0, contrast=100):
    """Downscale with sips, then flood the background out to transparency."""
    with tempfile.TemporaryDirectory() as tmp:
        staged = Path(tmp) / 'in.png'
        subprocess.run(['sips', '-Z', str(width), '-s', 'format', 'png',
                        str(src), '--out', str(staged)],
                       check=True, capture_output=True)
        w, h, bpp, px = read_png(staged)

    if bpp == 3:                            # give it an alpha channel to write into
        rgba = bytearray(w * h * 4)
        for p in range(w * h):
            rgba[p * 4:p * 4 + 3] = px[p * 3:p * 3 + 3]
            rgba[p * 4 + 3] = 255
        px, bpp = rgba, 4

    # Desaturate BEFORE matting, so the flood threshold is measured against the
    # tones that will actually ship. A saturated background can sit above the
    # threshold in one channel and below it in another.
    if mono:
        px = to_mono(px, w, h, contrast)

    def bright(p):
        i = p * 4
        return min(px[i], px[i + 1], px[i + 2])

    seen = bytearray(w * h)
    dq = collections.deque()

    def seed(p):
        if not seen[p] and bright(p) >= flood:
            seen[p] = 1
            dq.append(p)

    for x in range(w):
        seed(x); seed((h - 1) * w + x)
    for y in range(h):
        seed(y * w); seed(y * w + w - 1)

    while dq:
        p = dq.popleft()
        x, y = p % w, p // w
        if x > 0:     seed(p - 1)
        if x < w - 1: seed(p + 1)
        if y > 0:     seed(p - w)
        if y < h - 1: seed(p + w)

    span = max(1, clear - flood)
    cut = 0
    for p in range(w * h):
        if not seen[p]:
            continue
        i, b = p * 4, bright(p)
        a = 0 if b >= clear else int((clear - b) / span * 255)
        px[i + 3] = a
        if a == 0:
            px[i] = px[i + 1] = px[i + 2] = 255
        cut += 1

    write_png(dst, w, h, 4, px)
    pct = cut * 100 // (w * h)
    print(f'{Path(dst).name}: {w}x{h}, background cut {pct}% '
          f'(flood>={flood}, clear>={clear}'
          + (f', mono contrast={contrast}' if mono else '') + ')')
    if pct < 20:
        print('  ! very little was cut — is the background actually light?')
    if pct > 92:
        print('  ! almost everything was cut — try a higher --flood')


if __name__ == '__main__':
    argv = sys.argv[1:]
    opts = {}
    if '--mono' in argv:
        opts['mono'] = 1
        argv = [a for a in argv if a != '--mono']
    for a in list(argv):
        if a.startswith('--') and '=' in a:
            k, v = a[2:].split('=', 1)
            opts[k] = int(v)
            argv.remove(a)
    for i, a in enumerate(list(argv)):
        if a in ('--width', '--flood', '--clear', '--contrast'):
            opts[a[2:]] = int(argv[i + 1])
    skip = set()
    for i, a in enumerate(argv):
        if a in ('--width', '--flood', '--clear', '--contrast'):
            skip.add(i); skip.add(i + 1)
    args = [a for i, a in enumerate(argv) if i not in skip and not a.startswith('--')]
    if len(args) < 2:
        raise SystemExit(__doc__)
    cutout(args[0], args[1], **opts)
