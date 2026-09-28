"""In-game check of the sample-based sfx: every file loads, sfx really play from samples during combat.

usage: python3 tools/sfx-playtest.py [url=http://127.0.0.1:5181/?debug] [mission=m1] [secs=25]
Counts AudioBufferSourceNode starts (short buffers = sfx samples) vs OscillatorNode starts (synth fallback
or procedural music), lists sfx requests that failed and console errors. Exit 1 on any problem.
"""
import json
import sys
import time

from playwright.sync_api import sync_playwright

args = dict(a.split('=', 1) for a in sys.argv[1:] if '=' in a)
URL = args.get('url', 'http://127.0.0.1:5181/?debug')
MISSION = args.get('mission', 'm1')
SECS = float(args.get('secs', 25))
LOADOUT = {'front': {'id': 'arc', 'level': 6}, 'rear': {'id': 'flank', 'level': 4}, 'podL': {'id': 'viper', 'level': 2},
           'podR': {'id': 'viper', 'level': 2}, 'reactor': 'r3', 'shield': 's3', 'hull': 'h3', 'special': 'nova'}

PROBE = """
(() => {
  const s = { sfx: 0, long: 0, osc: 0, names: {} }
  window.__sfxProbe = s
  const bs = AudioBufferSourceNode.prototype.start
  AudioBufferSourceNode.prototype.start = function (...a) {
    const d = this.buffer ? this.buffer.duration : 0
    if (d > 0 && d < 8) { s.sfx++; const k = d.toFixed(3); s.names[k] = (s.names[k] || 0) + 1 } else s.long++
    return bs.apply(this, a)
  }
  const os = OscillatorNode.prototype.start
  OscillatorNode.prototype.start = function (...a) { s.osc++; return os.apply(this, a) }
})()
"""


def main():
    problems = []
    sfx_ok, sfx_bad = [], []
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.add_init_script(PROBE)
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.on('requestfailed', lambda r: sfx_bad.append(f'{r.url} {r.failure}') if '/sfx/' in r.url else None)
        pg.on('response', lambda r: (sfx_ok if r.ok else sfx_bad).append(r.url) if '/sfx/' in r.url else None)
        pg.goto(URL)
        pg.wait_for_function('window.__emb !== undefined', timeout=20000)
        man = pg.evaluate("fetch(new URL('sfx/manifest.json', location.href)).then(r => r.json())")
        expected = sum(len(e['files']) for e in man['sfx'].values()) + len(man['loops'])
        pg.mouse.click(640, 360)  # user gesture -> audio.unlock()
        t0 = time.time()
        while len([u for u in sfx_ok if u.endswith('.wav')]) < expected and time.time() - t0 < 20:
            time.sleep(0.2)
        load_s = time.time() - t0
        wavs = len({u for u in sfx_ok if u.endswith('.wav')})
        print(f'samples loaded: {wavs}/{expected} in {load_s:.1f}s')
        if wavs < expected:
            problems.append(f'only {wavs}/{expected} sample files loaded')
        before = pg.evaluate('({...window.__sfxProbe})')
        pg.evaluate(f"__emb.start('{MISSION}', {{loadout: {json.dumps(LOADOUT)}, difficulty: 'gunship'}})")
        time.sleep(0.5)
        pg.evaluate('__emb.autopilot(true); __emb.god(true)')
        time.sleep(SECS)
        mid = pg.evaluate('window.__sfxProbe')
        pg.evaluate('__emb.skipToBoss()')
        time.sleep(SECS / 2)
        after = pg.evaluate('window.__sfxProbe')
        state = pg.evaluate('__emb.state()')
        ctx_state = pg.evaluate("(() => { try { return __emb.app && 'ok' } catch (e) { return String(e) } })()")
        b.close()
    print(f"mission {state.get('mission')} t={state.get('time')} kills={state.get('kills')} fps={state.get('fps')} {ctx_state}")
    print(f"sample sfx starts: menu {before['sfx']} · combat {mid['sfx'] - before['sfx']} · boss {after['sfx'] - mid['sfx']}")
    print(f"oscillator starts (synth fallback / procedural music): {after['osc']} · long buffer starts (music): {after['long']}")
    top = sorted(after['names'].items(), key=lambda kv: -kv[1])[:12]
    print('most played buffer durations (s):', ', '.join(f'{k}×{v}' for k, v in top))
    if mid['sfx'] - before['sfx'] < 50:
        problems.append('fewer than 50 sample sfx during combat')
    if sfx_bad:
        problems.append(f'{len(sfx_bad)} failed sfx requests: {sfx_bad[:5]}')
    errs = [l for l in logs if 'error' in l]
    if errs:
        problems.append(f'console errors: {errs[:5]}')
    print('\n'.join(['PROBLEMS:'] + problems) if problems else 'OK: no 404, no console errors, sfx play from samples')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
