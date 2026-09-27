"""Playtest helper: drive the game through window.__emb and take screenshots.
usage: python3 tools/shot.py <script.json>  (list of steps) — or import run()."""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5181/?debug'

def run(steps, out='/tmp/emb', w=1280, h=720, url=URL):
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(url)
        pg.wait_for_function('window.__emb !== undefined', timeout=15000)
        for i, st in enumerate(steps):
            kind = st[0]
            if kind == 'wait': time.sleep(st[1])
            elif kind == 'eval':
                r = pg.evaluate(st[1])
                if r is not None: logs.append(f'[eval] {json.dumps(r)[:600]}')
            elif kind == 'shot': pg.screenshot(path=f'{out}_{st[1]}.png')
            elif kind == 'key': pg.keyboard.press(st[1])
            elif kind == 'down': pg.keyboard.down(st[1])
            elif kind == 'up': pg.keyboard.up(st[1])
            elif kind == 'click': pg.mouse.click(st[1], st[2])
        b.close()
    return logs

if __name__ == '__main__':
    steps = json.load(open(sys.argv[1]))
    for l in run(steps): print(l)
