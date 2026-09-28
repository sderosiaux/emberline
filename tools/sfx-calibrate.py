"""Level every recorded sfx/loop against the mix the game was balanced with (the synthesized recipes).

usage: python3 tools/sfx-calibrate.py [passes=3]
Renders both versions offline in Chromium through the real master chain (tools/sfx-calibrate.ts), then sets
`gain` in public/sfx/manifest.json so each sample lands at the synth's loudness plus a deliberate offset per
category. Several passes because the master compressor makes level changes non-linear.
"""
import json
import os
import signal
import subprocess
import sys
import time
import urllib.request
from glob import glob

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'public', 'sfx', 'manifest.json')
PORT = 5198
# Files peak at -1.2 dBFS: above this gain a single hit already drives the master limiter, which then pumps
# everything else. Sounds that can't reach their target under the cap are reported, not forced.
MAX_GAIN = 1.25

# dB added on top of the synth reference. The old explosions/hits were thin beeps; the new ones carry their
# weight in the lows, which K-weighting partly discounts, so they get a little extra. Enemy fire sits under
# the player's own guns; UI stays gentle.
OFFSETS = [('expl_', 1.5), ('chain_reaction', 1.5), ('player_death', 1.5), ('boss_part', 1.5), ('hull_hit', 1.0),
           ('enemy_', -1.5), ('ui_', -1.0), ('shot_', 0.0)]


def offset(name):
    return next((d for p, d in OFFSETS if name.startswith(p)), 0.0)


def measure(browser):
    page = browser.new_context().new_page()  # fresh context: no cached manifest from the previous pass
    page.on('pageerror', lambda e: print('pageerror:', e))
    page.goto(f'http://127.0.0.1:{PORT}/tools/sfx-calibrate.html?{time.time()}')
    page.wait_for_function('window.__done === true', timeout=20 * 60 * 1000, polling=500)
    err = page.evaluate('window.__error || null')
    if err:
        sys.exit(f'ERROR {err}')
    rows = page.evaluate('window.__results')
    page.context.close()
    return rows


def main():
    passes = int(dict(a.split('=') for a in sys.argv[1:] if '=' in a).get('passes', 3))
    vite = subprocess.Popen(['npx', 'vite', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, start_new_session=True)
    try:
        for _ in range(150):
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/tools/sfx-calibrate.html', timeout=1)
                break
            except Exception:
                time.sleep(0.2)
        with sync_playwright() as p:
            shells = sorted(glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell')),
                            key=lambda x: int(x.split('chromium_headless_shell-')[1].split('/')[0]))
            b = p.chromium.launch(executable_path=os.environ.get('CHROME') or (shells[-1] if shells else None))
            for i in range(passes):
                rows = measure(b)
                man = json.load(open(MANIFEST))
                worst = 0.0
                for r in rows:
                    if r['sample'] is None:
                        print('MISSING sample for', r['name'])
                        continue
                    entry = man['loops' if r['loop'] else 'sfx'][r['name']]
                    err = r['synth'] + offset(r['name']) - r['sample']
                    worst = max(worst, abs(err))
                    entry['gain'] = round(min(MAX_GAIN, entry['gain'] * 10 ** (err / 20)), 4)
                json.dump(man, open(MANIFEST, 'w'), indent=1)
                print(f'pass {i + 1}: worst error {worst:.2f} dB')
            rows = measure(b)
            b.close()
        print(f"\n{'name':22} {'synth':>7} {'sample':>7} {'target':>7} {'gain':>6}  variants")
        man = json.load(open(MANIFEST))
        for r in rows:
            g = man['loops' if r['loop'] else 'sfx'][r['name']]['gain']
            vs = ' '.join(f'{v:.1f}' for v in r['variants'])
            capped = '  CAPPED' if g >= MAX_GAIN and (r['sample'] or 0) < r['synth'] + offset(r['name']) - 0.5 else ''
            print(f"{r['name']:22} {r['synth']:7.1f} {r['sample'] or 0:7.1f} {r['synth'] + offset(r['name']):7.1f} {g:6.2f}  {vs}{capped}")
    finally:
        os.killpg(vite.pid, signal.SIGTERM)


if __name__ == '__main__':
    main()
