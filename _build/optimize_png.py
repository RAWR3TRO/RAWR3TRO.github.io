#!/usr/bin/env python3
"""
optimize_png.py — losslessly shrink the cut-out PNGs.

    python3 _build/optimize_png.py assets/el/*.png assets/logo/*.png

Two independent wins, both lossless:

1. GREYSCALE STORAGE.  Every prop on this site is monochrome — the generated
   camera, tapes and cards were prompted black-and-white, and the wordmark is
   pure white artwork. They were nonetheless stored as RGBA, at 4 bytes per
   pixel, holding three identical channels. PNG has colour types for exactly
   this: type 4 is grey+alpha (2 bytes), type 0 is grey (1 byte). Converting
   throws away nothing.

   "Greyscale" is judged with a small tolerance and only over pixels that are
   actually visible — a fully transparent pixel's RGB is meaningless, and after
   matting most of the frame is transparent. JPEG-sourced art carries a little
   chroma noise, so an exact R==G==B test would reject files that are grey in
   every way that matters.

2. ADAPTIVE SCANLINE FILTERING.  PNG lets each row pick one of five filters,
   and the encoder is supposed to choose per row. The writer in cutout.py emits
   filter 0 (None) everywhere, which is correct but leaves a lot on the table
   for photographic content. This tries all five per row and keeps the one with
   the smallest sum of absolute signed deviation — the standard heuristic —
   which is where most of the remaining saving comes from.

No Pillow, no numpy on this machine, so this is all done directly on zlib.
"""
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from cutout import read_png, write_png            # noqa: E402  (shared PNG codec)

import struct                                     # noqa: E402


GREY_TOLERANCE = 12          # max channel spread still considered grey
ALPHA_VISIBLE = 8            # below this the pixel is transparent; RGB is noise


def analyse(w, h, bpp, px):
    """(is_grey, has_alpha) over the pixels that can actually be seen."""
    is_grey, has_alpha = True, False
    for p in range(w * h):
        i = p * bpp
        if bpp == 4:
            a = px[i + 3]
            if a < 255:
                has_alpha = True
            if a < ALPHA_VISIBLE:
                continue
        r, g, b = px[i], px[i + 1], px[i + 2]
        if max(r, g, b) - min(r, g, b) > GREY_TOLERANCE:
            is_grey = False
            if has_alpha or bpp == 3:
                break
    return is_grey, has_alpha


def to_channels(w, h, bpp, px, grey, alpha):
    """Repack pixels into the narrowest PNG colour type that is lossless here."""
    if grey and alpha:
        ct, n = 4, 2
    elif grey:
        ct, n = 0, 1
    elif bpp == 4 and alpha:
        return 6, 4, px
    elif bpp == 4:
        ct, n = 2, 3
    else:
        return 2, 3, px

    out = bytearray(w * h * n)
    for p in range(w * h):
        i, o = p * bpp, p * n
        # Rec.709 luma would be wrong here: these are already grey, so the
        # channels agree and green alone is the least noisy representative.
        out[o] = px[i + 1]
        if n == 2:
            out[o + 1] = px[i + 3] if bpp == 4 else 255
    return ct, n, out


def _filter_row(cur, prev, n, stride):
    """Return (best_filter_type, filtered_bytes) for one scanline."""
    best, best_score, best_type = None, None, 0
    for ft in range(5):
        out = bytearray(stride)
        for i in range(stride):
            a = cur[i - n] if i >= n else 0
            b = prev[i]
            c = prev[i - n] if i >= n else 0
            x = cur[i]
            if ft == 0:   v = x
            elif ft == 1: v = x - a
            elif ft == 2: v = x - b
            elif ft == 3: v = x - ((a + b) >> 1)
            else:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                v = x - pr
            out[i] = v & 255
        # sum of absolute SIGNED deviation — bytes near 0/255 compress best
        score = sum(v if v < 128 else 256 - v for v in out)
        if best_score is None or score < best_score:
            best, best_score, best_type = out, score, ft
    return best_type, best


def write_optimized(path, w, h, ct, n, px):
    stride = w * n
    raw = bytearray()
    prev = bytearray(stride)
    for y in range(h):
        cur = px[y * stride:(y + 1) * stride]
        ft, filtered = _filter_row(cur, prev, n, stride)
        raw.append(ft)
        raw += filtered
        prev = cur

    def chunk(t, data):
        return (struct.pack('>I', len(data)) + t + data +
                struct.pack('>I', zlib.crc32(t + data) & 0xffffffff))

    body = zlib.compress(bytes(raw), 9)
    Path(path).write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, ct, 0, 0, 0))
        + chunk(b'IDAT', body)
        + chunk(b'IEND', b''))


NAMES = {0: 'grey', 2: 'rgb', 4: 'grey+a', 6: 'rgba'}


def optimize(path):
    p = Path(path)
    before = p.stat().st_size
    try:
        w, h, bpp, px = read_png(p)
    except SystemExit:
        print(f'{p.name:24} {before/1024:7.0f} KB  skipped (already a narrow colour type)')
        return 0, 0
    grey, alpha = analyse(w, h, bpp, px)
    ct, n, packed = to_channels(w, h, bpp, px, grey, alpha)
    write_optimized(p, w, h, ct, n, packed)
    after = p.stat().st_size
    if after >= before:                      # never make a file worse
        write_png(p, w, h, bpp, px)
        after = p.stat().st_size
        print(f'{p.name:24} {before/1024:7.0f} KB  kept (no gain)')
        return before, before
    print(f'{p.name:24} {before/1024:7.0f} KB -> {after/1024:6.0f} KB   '
          f'{NAMES[6 if bpp==4 else 2]} -> {NAMES[ct]}  ({100-after*100//before}% off)')
    return before, after


if __name__ == '__main__':
    files = sys.argv[1:]
    if not files:
        raise SystemExit(__doc__)
    tb = ta = 0
    for f in files:
        b, a = optimize(f)
        tb += b; ta += a
    if tb:
        print(f'\n{"TOTAL":24} {tb/1024:7.0f} KB -> {ta/1024:6.0f} KB  '
              f'({100-ta*100//tb}% off, {(tb-ta)/1024:.0f} KB saved)')
