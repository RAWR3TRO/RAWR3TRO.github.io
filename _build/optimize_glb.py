#!/usr/bin/env python3
"""
optimize_glb.py — shrink a .glb by re-encoding its embedded textures.

    python3 _build/optimize_glb.py IN.glb OUT.glb [--size 1024] [--quality 82]

Why
---
psp.glb shipped at 11.8 MB, of which 9.56 MB was five embedded textures, all
of them 4096x4096. The model renders roughly 600px wide on a desktop screen, so
that is about 28x more texture than any pixel can ever show, and it was 61% of
the site's entire first-load payload.

Two of those textures were PNG:

  image[1]  5970 KB  metallicRoughness AND occlusion (a packed ORM map)
  image[3]  2186 KB  normal

Neither carries alpha — they are data maps, not artwork — so PNG buys nothing
over JPEG for them. The one image that DOES need alpha (image[4], a 32x32
baseColor on an alphaMode=BLEND material) is left exactly as it is, which is
why this script checks the material bindings rather than converting blindly.

Normal maps get a higher quality than the rest: JPEG ringing on a colour map is
invisible, but on a normal map it perturbs the surface direction and shows up as
shimmer across a lit curve.

GLB layout notes, since this rewrites the container by hand:
  · header is magic/version/total, then chunks of [len][type][data]
  · the JSON chunk pads to 4 bytes with SPACES (0x20), the BIN chunk with NULs
  · every bufferView byteOffset has to be re-derived, because replacing image
    bytes moves everything after it
  · buffers[0].byteLength must match the new BIN chunk exactly or loaders reject it
"""
import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    d = Path(path).read_bytes()
    magic, ver, _ = struct.unpack('<III', d[:12])
    if magic != 0x46546C67:
        raise SystemExit(f'{path}: not a GLB')
    pos, js, binblob = 12, None, b''
    while pos < len(d):
        ln, typ = struct.unpack('<II', d[pos:pos + 8])
        data = d[pos + 8:pos + 8 + ln]
        if typ == JSON_CHUNK:
            js = json.loads(data)
        elif typ == BIN_CHUNK:
            binblob = data
        pos += 8 + ln + ((4 - ln % 4) % 4 if ln % 4 else 0)
    return js, binblob


def needs_alpha(js, image_index):
    """True if this image is the baseColor of a material that blends."""
    tex = js.get('textures', [])
    for m in js.get('materials', []):
        if m.get('alphaMode', 'OPAQUE') == 'OPAQUE':
            continue
        ti = m.get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('index')
        if ti is not None and ti < len(tex) and tex[ti].get('source') == image_index:
            return True
    return False


def is_normal_map(js, image_index):
    tex = js.get('textures', [])
    for m in js.get('materials', []):
        ti = m.get('normalTexture', {}).get('index')
        if ti is not None and ti < len(tex) and tex[ti].get('source') == image_index:
            return True
    return False


def recode(blob, ext, size, quality, tmp):
    src = Path(tmp) / f'in.{ext}'
    src.write_bytes(blob)
    dst = Path(tmp) / 'out.jpg'
    subprocess.run(['sips', '-Z', str(size), '-s', 'format', 'jpeg',
                    '-s', 'formatOptions', str(quality), str(src), '--out', str(dst)],
                   check=True, capture_output=True)
    return dst.read_bytes()


def optimize(src, dst, size=1024, quality=82, normal_quality=92):
    js, binblob = read_glb(src)
    views = js['bufferViews']
    before = sum(views[im['bufferView']]['byteLength'] for im in js.get('images', []))

    replacement = {}                        # bufferView index -> new bytes
    with tempfile.TemporaryDirectory() as tmp:
        for i, im in enumerate(js.get('images', [])):
            bv = im.get('bufferView')
            if bv is None:
                continue
            v = views[bv]
            off = v.get('byteOffset', 0)
            blob = binblob[off:off + v['byteLength']]
            ext = 'jpg' if 'jpeg' in im.get('mimeType', '') else 'png'

            if needs_alpha(js, i):
                print(f'  image[{i}] {len(blob)/1024:8.0f} KB  kept as-is (needs alpha)')
                continue

            q = normal_quality if is_normal_map(js, i) else quality
            new = recode(blob, ext, size, q, tmp)
            if len(new) >= len(blob):
                print(f'  image[{i}] {len(blob)/1024:8.0f} KB  kept as-is (recode was bigger)')
                continue
            role = 'normal' if is_normal_map(js, i) else 'colour/data'
            print(f'  image[{i}] {len(blob)/1024:8.0f} KB -> {len(new)/1024:6.0f} KB '
                  f'({role}, {size}px q{q})')
            replacement[bv] = new
            im['mimeType'] = 'image/jpeg'

    # --- rebuild the BIN chunk, re-deriving every offset -------------------
    out = bytearray()
    for idx, v in enumerate(views):
        data = replacement.get(idx)
        if data is None:
            off = v.get('byteOffset', 0)
            data = binblob[off:off + v['byteLength']]
        if len(out) % 4:                    # keep every view 4-byte aligned
            out += b'\x00' * (4 - len(out) % 4)
        v['byteOffset'] = len(out)
        v['byteLength'] = len(data)
        out += data

    js['buffers'][0]['byteLength'] = len(out)
    js['buffers'][0].pop('uri', None)

    jsonbytes = json.dumps(js, separators=(',', ':')).encode()
    if len(jsonbytes) % 4:
        jsonbytes += b' ' * (4 - len(jsonbytes) % 4)      # JSON pads with SPACES
    binbytes = bytes(out)
    if len(binbytes) % 4:
        binbytes += b'\x00' * (4 - len(binbytes) % 4)     # BIN pads with NULs

    total = 12 + 8 + len(jsonbytes) + 8 + len(binbytes)
    glb = (struct.pack('<III', 0x46546C67, 2, total)
           + struct.pack('<II', len(jsonbytes), JSON_CHUNK) + jsonbytes
           + struct.pack('<II', len(binbytes), BIN_CHUNK) + binbytes)
    Path(dst).write_bytes(glb)

    after = sum(views[im['bufferView']]['byteLength'] for im in js.get('images', []))
    o, n = Path(src).stat().st_size, Path(dst).stat().st_size
    print(f'\n  textures {before/1024/1024:.2f} MB -> {after/1024/1024:.2f} MB')
    print(f'  file     {o/1024/1024:.2f} MB -> {n/1024/1024:.2f} MB  '
          f'({100 - n*100//o}% smaller)')


if __name__ == '__main__':
    argv = sys.argv[1:]
    opts = {}
    for flag in ('--size', '--quality', '--normal-quality'):
        if flag in argv:
            i = argv.index(flag)
            opts[flag[2:].replace('-', '_')] = int(argv[i + 1])
            del argv[i:i + 2]
    args = [a for a in argv if not a.startswith('--')]
    if len(args) < 2:
        raise SystemExit(__doc__)
    optimize(args[0], args[1], **opts)
