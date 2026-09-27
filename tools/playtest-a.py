"""Playtests for missions m2/m3 (port 5191).
usage:
  python3 tools/playtest-a.py run <mission> [--nogod] [--diff gunship] [--tier mid|low|high] [--boss]
  python3 tools/playtest-a.py shots <mission> <t1,t2,...> [--boss] [--tier mid]   (sim time → screenshot /tmp/pa_<mission>_<t>.png)
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5191/?debug'

TIERS = {
    # expected sustained DPS by mission tier (see content brief)
    'low': {'front': {'id': 'pulse', 'level': 3}, 'rear': None, 'podL': None, 'podR': None, 'reactor': 'r2', 'shield': 's1', 'hull': 'h2', 'special': 'nova'},
    'mid': {'front': {'id': 'hail', 'level': 4}, 'rear': {'id': 'stinger', 'level': 2}, 'podL': {'id': 'wasp', 'level': 1}, 'podR': None, 'reactor': 'r2', 'shield': 's2', 'hull': 'h2', 'special': 'nova'},
    'mid3': {'front': {'id': 'hornet', 'level': 5}, 'rear': {'id': 'flank', 'level': 3}, 'podL': {'id': 'wasp', 'level': 2}, 'podR': {'id': 'viper', 'level': 1}, 'reactor': 'r3', 'shield': 's2', 'hull': 'h3', 'special': 'nova'},
    'high': {'front': {'id': 'arc', 'level': 6}, 'rear': {'id': 'flank', 'level': 4}, 'podL': {'id': 'viper', 'level': 2}, 'podR': {'id': 'viper', 'level': 2}, 'reactor': 'r3', 'shield': 's3', 'hull': 'h3', 'special': 'nova'},
}


def opt(name, default=None):
    if name in sys.argv:
        i = sys.argv.index(name)
        return sys.argv[i + 1] if i + 1 < len(sys.argv) and not sys.argv[i + 1].startswith('--') else True
    return default


def session(fn):
    logs = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'])
        pg = b.new_page(viewport={'width': 1280, 'height': 720})
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        pg.goto(URL)
        pg.wait_for_function('window.__emb !== undefined', timeout=15000)
        fn(pg, logs)
        b.close()
    bad = [l for l in logs if 'pageerror' in l or 'missing sprite' in l or '[error]' in l]
    print('--- problems:' if bad else '--- no page errors / missing sprites')
    for l in sorted(set(bad)): print(l)


def start(pg, mission):
    lo = TIERS[opt('--tier', 'mid')]
    diff = opt('--diff', 'gunship')
    pg.evaluate(f"__emb.start('{mission}', {{loadout: {json.dumps(lo)}, difficulty: '{diff}'}})")
    time.sleep(0.5)
    pg.evaluate('__emb.autopilot(true)')
    if not opt('--nogod'): pg.evaluate('__emb.god(true)')
    if opt('--boss'): pg.evaluate('__emb.skipToBoss()')


def run(pg, logs):
    mission = sys.argv[2]
    start(pg, mission)
    boss_at = None
    last = None
    for _ in range(90):
        if opt('--nociv'): pg.evaluate("__emb.app.session && __emb.app.session.world.flags.delete('civilian_hit')")
        if opt('--allgen'): pg.evaluate("(() => { const w = __emb.app.session && __emb.app.session.world; if (w && !w.boss) for (const e of w.enemies) if (e.def.id === 'generator' && e.y > 0 && e.x > 0 && e.x < 560 && !(e.shieldedBy && !e.shieldedBy.dead)) w.kill(e) })()")
        if opt('--allgen'):
            for _ in range(20):
                pg.evaluate("(() => { const w = __emb.app.session && __emb.app.session.world; if (w && !w.boss) for (const e of w.enemies) if (e.def.id === 'generator' && e.y > 0 && e.x > 0 && e.x < 560 && !(e.shieldedBy && !e.shieldedBy.dead)) w.kill(e) })()")
                pg.evaluate('__emb.simulate(0.5)')
        st = pg.evaluate('__emb.simulate(10)'); cores = pg.evaluate('__emb.app.session ? [__emb.app.session.world.stats.cores, Math.round(__emb.app.session.world.stats.damageTaken)] : null'); st['cores'] = cores
        last = st
        if 'time' not in st: print('session lost', st); break
        if st['boss'] and boss_at is None: boss_at = st['time']
        extra = pg.evaluate("(() => { const s = __emb.app.session; if (!s) return ''; return s.world.enemies.filter(e => !e.dead).slice(0, 6).map(e => e.def.id + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' ') })()")
        print(f"t={st['time']:7.1f} prog={st['progress']:.2f} hull={st['hull']:4} en={st['enemies']:3} bul={st['bullets']:4} kills={st['kills']:4} boss={st['boss']} state={st['state']} secrets={st['secrets']} cores={st['cores']} | {extra}")
        bt = pg.evaluate('__emb.app.session ? __emb.app.session.world.stats.bossTime : -1')
        if st['state'] in ('won', 'lost'): break
    print(f"== boss appeared at t={boss_at}  bossTime={bt:.1f}s  final={last['state']} flags={last['flags']}")


def shots(pg, logs):
    mission = sys.argv[2]
    ts = [float(x) for x in sys.argv[3].split(',')]
    start(pg, mission)
    now = 0.0
    js = opt('--js')  # 'T|expr' : evaluate expr (w = world) once sim time passes T
    for t in ts:
        if js and float(js.split('|')[0]) <= t and float(js.split('|')[0]) > now:
            pg.evaluate(f"__emb.simulate({float(js.split('|')[0]) - now})")
            now = float(js.split('|')[0])
            pg.evaluate('(() => { const w = __emb.app.session.world; ' + js.split('|', 1)[1] + ' })()')
        pg.evaluate(f'__emb.simulate({t - now})')
        now = t
        time.sleep(0.35)
        st = pg.evaluate('__emb.state()')
        if 'time' not in st: print('session lost (reload?)', st); return
        pg.screenshot(path=f'/tmp/pa_{mission}_{int(t)}.png')
        print(f"shot t={t} sim={st['time']} boss={st['boss']} en={st['enemies']} bul={st['bullets']} hull={st['hull']} state={st['state']}")


def probe(pg, logs):
    """Boss hp trace: every 5 s sum of boss part hp, root phase/mode."""
    mission = sys.argv[2]
    start(pg, mission)
    prev = None
    for _ in range(80):
        # test pilot aid: the autopilot aims at the fattest target; hide an invulnerable root from it (harness only)
        st = pg.evaluate('''(() => { const w = __emb.app.session.world;
          for (let i = 0; i < 10; i++) { if (w.boss) w.boss.s.civilian = w.boss.armor <= 0 ? 1 : 0; __emb.simulate(0.5) }
          const r = w.boss; if (r) r.s.civilian = 0; const hp = w.bossParts.reduce((a, e) => a + (e.dead ? 0 : Math.max(0, e.hp)), 0);
          const max = w.bossParts.reduce((a, e) => a + e.maxHp, 0);
          return { t: +w.time.toFixed(1), hp: Math.round(hp), max: Math.round(max), phase: r ? r.s.phase : null, mode: r ? r.s.mode : null,
            alive: w.bossParts.filter(e => !e.dead).map(e => e.def.id.replace(/^m[0-9]_/, '') + ':' + Math.round(e.hp)).join(' '),
            hull: Math.round(w.player.hull), state: __emb.app.session.state, bt: w.stats.bossTime } })()''')
        d = '' if prev is None or st['hp'] is None else f" dps={(prev - st['hp']) / 5:6.0f}"
        prev = st['hp']
        print(f"t={st['t']} hp={st['hp']}/{st['max']} ph={st['phase']} mode={st['mode']}{d} hull={st['hull']} | {st['alive']}")
        if st['state'] != 'play' or st['phase'] is None and st['t'] > 30: print('bossTime', st['bt']); break


if __name__ == '__main__':
    if sys.argv[1] == 'probe': session(probe); sys.exit()
    {'run': run, 'shots': shots}[sys.argv[1]] and session({'run': run, 'shots': shots}[sys.argv[1]])
