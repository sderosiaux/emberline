"""Playtests for missions m6/m7 (port 5193).
usage:
  python3 tools/playtest-c.py run <mission> [--nogod] [--diff gunship] [--tier mid|high|low] [--boss] [--step 10]
  python3 tools/playtest-c.py shots <mission> <t1,t2,...> [--boss] [--tier mid] [--nogod] [--js 'T|expr']
        simulated time -> screenshot /tmp/pc_<mission>_<t>.png ; expr runs with w = world once time T is reached
  python3 tools/playtest-c.py sheet <prefix> [--zoom 1] [--bg #1a1a24]      contact sheet of sprites -> /tmp/pc_sheet_<prefix>.png
"""
import json, sys, time
from playwright.sync_api import sync_playwright

URL = 'http://127.0.0.1:5193/?debug'

TIERS = {
    # rough expected builds for late missions (M6 ~500-800 DPS, M7 ~700-1200)
    'low': {'front': {'id': 'hail', 'level': 4}, 'rear': {'id': 'stinger', 'level': 2}, 'podL': {'id': 'wasp', 'level': 2}, 'podR': None, 'reactor': 'r3', 'shield': 's2', 'hull': 'h3', 'special': 'nova'},
    'mid': {'front': {'id': 'rail', 'level': 6}, 'rear': {'id': 'flank', 'level': 3}, 'podL': {'id': 'viper', 'level': 3}, 'podR': {'id': 'wasp', 'level': 3}, 'reactor': 'r4', 'shield': 's3', 'hull': 'h4', 'special': 'nova'},
    'high': {'front': {'id': 'rail', 'level': 8}, 'rear': {'id': 'flank', 'level': 5}, 'podL': {'id': 'viper', 'level': 4}, 'podR': {'id': 'viper', 'level': 4}, 'reactor': 'r5', 'shield': 's4', 'hull': 'h5', 'special': 'nova'},
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
        pg.wait_for_function('window.__emb !== undefined', timeout=20000)
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
    if opt('--ai'): pg.evaluate('(() => { const w = __emb.app.session.world; ' + open(opt('--ai')).read() + ' })()')


ENEMY_SUMMARY = """(() => { const s = __emb.app.session; if (!s) return ''; const w = s.world;
  const bp = w.bossParts.filter(e => !e.dead).map(e => e.def.id.replace(/^m[67]_/, '') + ':' + Math.round(e.hp)).join(' ');
  return (w.boss ? '[' + bp + '] ' : '') + w.enemies.filter(e => !e.dead && !e.bossPart && e.y > -5000).slice(0, 7).map(e => e.def.id + '@' + Math.round(e.x) + ',' + Math.round(e.y)).join(' ') })()"""


def run(pg, logs):
    mission = sys.argv[2]
    start(pg, mission)
    step = float(opt('--step', 10))
    boss_at = None
    last = None
    bt = -1
    for _ in range(int(900 / step)):
        st = pg.evaluate(f'__emb.simulate({step})')
        last = st
        if st['boss'] and boss_at is None: boss_at = st['time']
        extra = pg.evaluate(ENEMY_SUMMARY)
        dmg = pg.evaluate('__emb.app.session ? Math.round(__emb.app.session.world.stats.damageTaken) : -1')
        print(f"dmg={dmg:5} t={st['time']:7.1f} prog={st['progress']:.2f} hull={st['hull']:4} en={st['enemies']:3} bul={st['bullets']:4} kills={st['kills']:4} boss={st['boss']} state={st['state']} sec={st['secrets']} | {extra}")
        bt = pg.evaluate('__emb.app.session ? __emb.app.session.world.stats.bossTime : -1')
        if st['state'] in ('won', 'lost'): break
    dmg = pg.evaluate('__emb.app.session ? [Math.round(__emb.app.session.world.stats.damageTaken), __emb.app.session.world.god] : null')
    print(f"== damageTaken/god={dmg}")
    print(f"== boss appeared at t={boss_at}  bossTime={bt:.1f}s  final={last['state']} flags={last['flags']} secrets={last['secrets']}")


def shots(pg, logs):
    mission = sys.argv[2]
    ts = [float(x) for x in sys.argv[3].split(',')]
    start(pg, mission)
    now = 0.0
    js = opt('--js')
    jt = float(js.split('|')[0]) if js else None
    for t in ts:
        if js and jt is not None and jt <= t:
            pg.evaluate(f'__emb.simulate({jt - now})')
            now = jt
            r = pg.evaluate('(() => { const w = __emb.app.session.world; ' + js.split('|', 1)[1] + ' })()')
            if r is not None: print('[js]', json.dumps(r)[:400])
            jt = None
        st = pg.evaluate(f'__emb.simulate({t - now})')
        now = t
        time.sleep(0.25)
        path = f'/tmp/pc_{mission}_{t:g}.png'
        pg.screenshot(path=path)
        print(f"{path}  t={st['time']} hull={st['hull']} boss={st['boss']} state={st['state']} | {pg.evaluate(ENEMY_SUMMARY)}")


def sheet(pg, logs):
    prefix = sys.argv[2]
    zoom = float(opt('--zoom', 1))
    bg = opt('--bg', '#1a1a24')
    js = """async ([prefix, zoom, bg]) => {
      const S = await import('/src/render/sprites.ts')
      const keys = S.spriteKeys().filter(k => k.startsWith(prefix))
      const sps = keys.map(k => S.getSprite(k))
      const W = 1280
      let x = 10, y = 24, rowH = 0
      const pos = []
      for (const sp of sps) {
        const w = sp.w * zoom, h = sp.h * zoom
        if (x + w > W - 10) { x = 10; y += rowH + 24; rowH = 0 }
        pos.push([x, y]); x += w + 16; rowH = Math.max(rowH, h)
      }
      const c = document.createElement('canvas'); c.width = W; c.height = y + rowH + 20
      const g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height)
      g.font = '11px monospace'; g.fillStyle = '#ccc'
      sps.forEach((sp, i) => { const [px, py] = pos[i]; g.fillText(sp.key + ' ' + sp.w + 'x' + sp.h, px, py - 6); g.drawImage(sp.img, px, py, sp.w * zoom, sp.h * zoom) })
      document.body.innerHTML = ''; document.body.style.margin = '0'; document.body.style.background = bg
      c.style.display = 'block'; document.body.appendChild(c)
      return [keys.length, c.height]
    }"""
    n, h = pg.evaluate(js, [prefix, zoom, bg])
    pg.set_viewport_size({'width': 1280, 'height': max(200, int(h))})
    path = f'/tmp/pc_sheet_{prefix}.png'
    pg.screenshot(path=path, full_page=True)
    print(path, n, 'sprites')




def dps(pg, logs):
    """Measure sustained single-target DPS of each tier against a parked dummy straight ahead."""
    fronts = opt('--fronts')
    cases = [(t, TIERS[t]) for t in ['low', 'mid', 'high']]
    if fronts:
        base = TIERS[opt('--tier', 'mid')]
        cases = [(f, {**base, 'front': {'id': f.split(':')[0], 'level': int(f.split(':')[1])}}) for f in fronts.split(',')]
    for tier, lo in cases:
        pg.evaluate(f"__emb.start('m6', {{loadout: {json.dumps(lo)}, difficulty: 'gunship'}})")
        time.sleep(0.3)
        pg.evaluate('__emb.god(true)')
        r = pg.evaluate("""(() => { const s = __emb.app.session; const w = s.world; s.runner.L.steps.length = 0; s.runner.L.steps.push({ t: 1e9, fn() {} }); s.runner.i = 0; s.runner.done = false; const p = w.player; for (let i = 0; i < 120; i++) s.update(1/60);
          const e = w.spawn('m6_revenant', 280, 250); e.s.phase = 1; e.armor = 1; e.s.intro = 0; e.hp = e.maxHp = 1e7; e.s.dying = 1;
          p.x = 280; p.y = 600; p.ai = () => ({ mx: (280 - p.x) / 50, my: 0, fire: true, special: false });
          for (let i = 0; i < 600; i++) s.update(1/60);
          return { dps: Math.round((1e7 - e.hp) / 10), energy: Math.round(p.energy) } })()""")
        print(tier, r)




def focus(pg, logs):
    """God-mode 'perfect aim' pilot: parks under the weakest exposed boss part. Measures the DPS-bound boss time."""
    mission = sys.argv[2]
    start(pg, mission)
    pg.evaluate('__emb.skipToBoss()')
    pg.evaluate("""(() => { const w = __emb.app.session.world; const p = w.player;
      p.ai = () => { const t = w.bossParts.filter(e => !e.dead && !e.hidden && e.armor > 0).sort((a, b) => a.hp - b.hp)[0];
        const tx = t ? t.x : 280; return { mx: Math.max(-1, Math.min(1, (tx - p.x) / 20)), my: Math.max(-1, Math.min(1, (560 - p.y) / 20)), fire: true, special: false } } })()""")
    for _ in range(60):
        st = pg.evaluate('__emb.simulate(10)')
        print(f"t={st['time']:6.1f} boss={st['boss']} | {pg.evaluate(ENEMY_SUMMARY)[:200]}")
        if not st['boss'] and st['time'] > 30: break


if __name__ == '__main__':
    session({'run': run, 'shots': shots, 'sheet': sheet, 'dps': dps, 'focus': focus}[sys.argv[1]])
