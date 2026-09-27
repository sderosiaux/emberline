#!/usr/bin/env python3
"""Headless audio QA: starts vite on :5199, renders everything offline in Chromium, prints a report.
Usage: python3 tools/audio-check.py [only=sfx,bursts,loops,tracks,layers] [secs=60] [track=m1]
Exit code 1 on any clip / NaN / silence."""
import os
import signal
import subprocess
import sys
import time
import urllib.request
from glob import glob

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 5199
args = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
query = '&'.join(f'{k}={v}' for k, v in args.items())

vite = subprocess.Popen(['npx', 'vite', '--port', str(PORT), '--strictPort', '--host', '127.0.0.1'], cwd=ROOT,
                        stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT, start_new_session=True)
code = 0
try:
    for _ in range(150):
        try:
            urllib.request.urlopen(f'http://127.0.0.1:{PORT}/tools/audio-check.html', timeout=1)
            break
        except Exception:
            time.sleep(0.2)
    with sync_playwright() as p:
        # Newest cached headless shell: older builds (e.g. 1208) have an oscillator start-up bug that
        # injects a huge one-sample spike ~49 samples after start(), which corrupts peak readings.
        shells = sorted(glob(os.path.expanduser('~/Library/Caches/ms-playwright/chromium_headless_shell-*/*/chrome-headless-shell')),
                        key=lambda x: int(x.split('chromium_headless_shell-')[1].split('/')[0]))
        b = p.chromium.launch(executable_path=os.environ.get('CHROME') or (shells[-1] if shells else None))
        print('browser', b.version)
        page = b.new_page()
        page.on('console', lambda m: print('console:', m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: print('pageerror:', e))
        page.goto(f'http://127.0.0.1:{PORT}/tools/audio-check.html?{query}')
        page.wait_for_function('window.__done === true', timeout=30 * 60 * 1000, polling=500)
        err = page.evaluate('window.__error || null')
        if err:
            print('ERROR', err)
            sys.exit(2)
        rows = page.evaluate('window.__results')
        dump = page.evaluate('window.__dump || null')
        if dump:
            print(dump)
        b.close()
    print(f"{'item':36} {'peak':>7} {'rms':>7} {'rmsMax':>7} {'hot':>8}  verdict")
    for r in rows:
        print(f"{r['item']:36} {r['peak']:7.4f} {r['rms']:7.4f} {r['rmsMax']:7.4f} {r['hot']:8.1e}  {r['why']}")
    bad = [r for r in rows if not r['ok']]
    print(f"\n{len(rows)} renders, {len(bad)} failures")
    code = 1 if bad else 0
finally:
    os.killpg(vite.pid, signal.SIGTERM)
sys.exit(code)
