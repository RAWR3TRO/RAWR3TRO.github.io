#!/usr/bin/env python3
"""
stamp.py — refresh the ?v= cache-busting tokens in index.html.

    python3 _build/stamp.py

Run this after editing any of css/style.css, js/*.js. It rewrites each
`?v=` to a short content hash of the file it points at.

Why it matters: browsers will happily hold an old CSS or JS and pair it with
freshly-served HTML. That is not a hypothetical — while tuning the audio
deferral, Chrome kept a main.js from before the change, so the page had the new
markup (no `src` on the <audio>) and the old script (which never attached one).
The result was a sound toggle that claimed to be on with no audio behind it, and
nothing in the console to say so.

Content-hash rather than a version number: it changes exactly when the file
changes, so caches stay warm across deploys that did not touch the file.
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HTML = ROOT / 'index.html'


def main():
    s = HTML.read_text()
    changed = []

    def sub(m):
        attr, rel, old = m.group(1), m.group(2), m.group(3)
        f = ROOT / rel
        if not f.exists():
            print(f'  ! {rel} referenced but missing')
            return m.group(0)
        new = hashlib.sha1(f.read_bytes()).hexdigest()[:8]
        if new != old:
            changed.append(f'{rel}  {old} -> {new}')
        return f'{attr}="{rel}?v={new}"'

    s = re.sub(r'(href|src)="((?:css|js)/[^"?]+)\?v=([0-9a-f]+)"', sub, s)
    HTML.write_text(s)

    if changed:
        print('restamped:')
        for c in changed:
            print('  ' + c)
    else:
        print('all tokens already current')
    return 0


if __name__ == '__main__':
    sys.exit(main())
