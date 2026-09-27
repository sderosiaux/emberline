"""Playtest for missions m4 / garden / m5 (content_b). Dev server on port 5192.

usage:
  python3 tools/playtest-b.py <mission> [--nogod] [--diff gunship] [--tier 4|5|garden]
         [--boss] [--shots 10,30,60] [--max 400] [--pre "<js run after start>"]
         [--every "<js run each sim chunk>"] [--out /tmp/pb]

Simulates headless in chunks (window.__emb.simulate), rendering a frame for each
requested screenshot time. Prints state per chunk, console warnings and errors.
"""
import argparse, json, time
from playwright.sync_api import sync_playwright

LOADOUTS = {
    # mid-tier builds roughly matching the expected DPS for each mission
    '4': {'front': {'id': 'hail', 'level': 7}, 'rear': {'id': 'flank', 'level': 4}, 'podL': {'id': 'viper', 'level': 3}, 'podR': {'id': 'wasp', 'level': 3},
          'reactor': 'r3', 'shield': 's2', 'hull': 'h3', 'special': 'nova'},
    '5': {'front': {'id': 'helix', 'level': 8}, 'rear': {'id': 'flank', 'level': 5}, 'podL': {'id': 'viper', 'level': 3}, 'podR': {'id': 'spark', 'level': 3},
          'reactor': 'r4', 'shield': 's3', 'hull': 'h3', 'special': 'nova'},
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mission')
    ap.add_argument('--nogod', action='store_true')
    ap.add_argument('--noauto', action='store_true')
    ap.add_argument('--diff', default='gunship')
    ap.add_argument('--tier', default=None)
    ap.add_argument('--boss', action='store_true')
    ap.add_argument('--shots', default='')
    ap.add_argument('--max', type=float, default=420)
    ap.add_argument('--chunk', type=float, default=5)
    ap.add_argument('--pre', default='')
    ap.add_argument('--every', default='')
    ap.add_argument('--out', default='/tmp/pb')
    ap.add_argument('--port', default='5192')
    a = ap.parse_args()
    tier = a.tier or ('4' if a.mission in ('m4', 'garden') else '5')
    loadout = LOADOUTS[tier]
    shots = sorted(float(s) for s in a.shots.split(',') if s)
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('warning', 'error') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(f'http://127.0.0.1:{a.port}/?debug')
        pg.wait_for_function('window.__emb !== undefined', timeout=20000)
        pg.evaluate(f"__emb.start({json.dumps(a.mission)}, {{loadout: {json.dumps(loadout)}, difficulty: {json.dumps(a.diff)}}})")
        time.sleep(0.5)
        if not a.noauto: pg.evaluate('__emb.autopilot(true)')
        pg.evaluate(f'__emb.god({"false" if a.nogod else "true"})')
        if a.boss: pg.evaluate('__emb.skipToBoss()')
        if a.pre: logs.append('[pre] ' + json.dumps(pg.evaluate(a.pre))[:300])
        t = 0.0
        si = 0
        boss_seen = None
        boss_time = 0
        while t < a.max:
            nxt = t + a.chunk
            if si < len(shots) and shots[si] < nxt: nxt = shots[si]
            st = pg.evaluate(f'__emb.simulate({nxt - t})')
            t = nxt
            if a.every: pg.evaluate(a.every)
            bt = pg.evaluate('__emb.app.session ? __emb.app.session.world.stats.bossTime : 0')
            if bt: boss_time = bt
            if st and st.get('boss') and boss_seen is None: boss_seen = t
            print(f"t={t:6.1f} sim={st['time'] if st else None} state={st and st['state']} hull={st and st['hull']} en={st and st['enemies']} bul={st and st['bullets']} kills={st and st['kills']} cr={st and st['credits']} boss={st and st['boss']} prog={st and st['progress']} secrets={st and st['secrets']}", flush=True)
            if si < len(shots) and abs(shots[si] - t) < 1e-6:
                time.sleep(0.12)
                pg.screenshot(path=f'{a.out}_{a.mission}_{int(t):04d}.png')
                si += 1
            if not st or st['state'] in ('won', 'lost', 'outro'):
                break
        extra = pg.evaluate('(() => { const w = __emb.app.session?.world; return w ? { bossTime: w.stats.bossTime, cores: w.stats.cores, flags: [...w.flags], dmg: w.stats.damageTaken } : null })()')
        print('extra', json.dumps(extra), 'bossAppearedAt', boss_seen, 'bossTime', round(boss_time, 1))
        b.close()
    seen = set()
    for l in logs:
        if l in seen: continue
        seen.add(l)
        print(l)


if __name__ == '__main__':
    # other people edit the tree while we test: a hot reload kills the page, so retry
    for attempt in range(4):
        try:
            main()
            break
        except Exception as ex:
            if 'Execution context was destroyed' not in str(ex) and 'navigation' not in str(ex): raise
            print(f'[retry] page reloaded mid-run ({attempt + 1})', flush=True)
            time.sleep(3)
