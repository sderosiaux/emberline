import type { App, Screen } from '../app'
import { h, fmt } from './dom'
import { Nav } from './nav'
import { audio } from '../audio/audio'
import type { MissionDef } from '../game/level'
import type { Campaign, DifficultyId } from '../game/campaign'
import { DIFFICULTIES } from '../game/campaign'
import type { MissionResult } from '../game/session'
import { ITEM } from '../data/items'
import { ORDER } from '../data/missions'
import type { MenuAction } from '../core/input'

const btn = (label: string, onClick: () => void, opts: { hint?: string; primary?: boolean; def?: boolean; danger?: boolean; small?: boolean } = {}) =>
  h('button', {
    class: `btn nav${opts.primary ? ' primary' : ''}${opts.danger ? ' danger' : ''}${opts.small ? ' small' : ''}`,
    'data-default': opts.def,
    onClick: () => { audio.sfx('ui_select'); onClick() },
  }, h('span', null, label), opts.hint ? h('span', { class: 'hint' }, opts.hint) : null)

function fmtTime(s: number) {
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  return `${m}:${r.toString().padStart(2, '0')}`
}

// ───────────────────────── title ─────────────────────────

export function titleScreen(app: App): Screen {
  const c = app.campaign
  const canContinue = !!c
  const el = h('div', { class: 'screen' },
    h('div', { class: 'title-panel paper' },
      h('div', { class: 'kicker' }, 'A courier with far too many guns'),
      h('h1', { class: 'wordmark' }, 'EMBER', h('br'), 'LINE'),
      h('div', { class: 'ember-bar', style: 'margin-top:14px' }),
      h('p', { class: 'tagline' }, 'The Verge colonies went quiet. The mining machines started singing. Someone has to fly in and find out why — and you have a salvage courier, a quartermaster with opinions, and a bank account.'),
      h('div', { class: 'menu' },
        canContinue ? btn('Continue', () => app.continueGame(), { hint: c!.finished ? 'campaign complete' : `mission ${Math.min(c!.next + 1, ORDER.length)} · ${fmt(c!.credits)}c`, primary: true, def: true }) : null,
        btn('New campaign', () => app.chooseDifficulty(), { primary: !canContinue, def: !canContinue }),
        btn('Settings', () => app.openSettings()),
      ),
      h('div', { class: 'title-foot' }, 'Arrows / WASD move · Space / Z fire · X special · Shift precision · Esc pause', h('br'), 'Gamepad supported.'),
    ),
    h('div', { class: 'title-right paper' },
      h('div', { class: 'kicker' }, 'Service record'),
      h('div', { class: 'rule' }),
      h('div', { class: 'stat-row' }, h('span', null, 'Best campaign score'), h('b', null, fmt(app.records.bestScore))),
      h('div', { class: 'stat-row' }, h('span', null, 'Campaigns completed'), h('b', null, `${app.records.completedDifficulties.length}`)),
      h('div', { class: 'stat-row' }, h('span', null, 'Secrets ever found'), h('b', null, `${app.records.secretsEver.length}`)),
      c ? h('div', { class: 'stat-row' }, h('span', null, 'Current difficulty'), h('b', null, DIFFICULTIES[c.difficulty].name)) : null,
      h('div', { style: 'margin-top:auto;font-size:12px;color:var(--muted);line-height:1.6' },
        'Between missions, Dasha sells guns. Guns change how you fly. The reactor decides how long you can keep flying like that.'),
    ),
  )
  const nav = new Nav(el)
  return { el, nav, backdrop: 'attract' }
}

export function difficultyModal(app: App, pickD: (d: DifficultyId) => void): Screen {
  const list = app.difficulties()
  const el = h('div', { class: 'modal-wrap' },
    h('div', { class: 'modal paper diff' },
      h('div', { class: 'kicker' }, 'New campaign'),
      h('h2', { style: 'margin-top:6px' }, 'Choose your contract'),
      h('div', { class: 'menu' },
        list.map((d) => h('button', {
          class: 'btn nav', 'data-default': d.id === 'gunship',
          onClick: () => { audio.sfx('ui_select'); app.closeModal(); pickD(d.id) },
        }, h('span', null, d.name + (d.id === 'gunship' ? '  · recommended' : '')), h('span', { class: 'diff-desc' }, d.desc))),
      ),
      app.campaign ? h('p', { style: 'margin-top:14px;font-size:12px;color:var(--bad)' }, 'Starting a new campaign overwrites the current one.') : null,
    ),
  )
  const nav = new Nav(el)
  nav.onBack = () => app.closeModal()
  return { el, nav, backdrop: 'attract' }
}

// ───────────────────────── settings ─────────────────────────

export function settingsModal(app: App, onClose: () => void = () => app.closeModal()): Screen {
  const s = app.settings
  let confirmReset = false
  const body = h('div', { class: 'menu', style: 'gap:4px' })
  const rows: { el: HTMLElement; left(): void; right(): void; click(): void }[] = []
  const slider = (label: string, get: () => number, set: (v: number) => void) => {
    const fill = h('i')
    const val = h('span', null)
    const refresh = () => { fill.style.width = `${Math.round(get() * 100)}%`; val.textContent = `${Math.round(get() * 100)}` }
    const el = h('div', { class: 'setting nav' }, h('span', null, label), h('span', { class: 'val' }, h('span', { class: 'slider' }, fill), val))
    refresh()
    const step = (d: number) => { set(Math.max(0, Math.min(1, Math.round((get() + d) * 10) / 10))); refresh(); app.saveSettings(); audio.sfx('ui_move') }
    el.addEventListener('click', (e) => {
      const r = (el.querySelector('.slider') as HTMLElement).getBoundingClientRect()
      const k = ((e as MouseEvent).clientX - r.left) / r.width
      if (k >= 0 && k <= 1) { set(Math.round(k * 10) / 10); refresh(); app.saveSettings() } else step(0.1)
    })
    rows.push({ el, left: () => step(-0.1), right: () => step(0.1), click: () => step(0.1) })
    body.append(el)
  }
  const choice = <T extends string | boolean | number>(label: string, opts: [T, string][], get: () => T, set: (v: T) => void) => {
    const val = h('span', { class: 'val' })
    const refresh = () => { val.textContent = opts.find(([v]) => v === get())?.[1] ?? '' }
    const el = h('div', { class: 'setting nav' }, h('span', null, label), val)
    refresh()
    const cycle = (d: number) => {
      const i = opts.findIndex(([v]) => v === get())
      set(opts[(i + d + opts.length) % opts.length][0]); refresh(); app.saveSettings(); audio.sfx('ui_move')
    }
    el.addEventListener('click', () => cycle(1))
    rows.push({ el, left: () => cycle(-1), right: () => cycle(1), click: () => cycle(1) })
    body.append(el)
  }
  slider('Master volume', () => s.master, (v) => (s.master = v))
  slider('Music', () => s.music, (v) => (s.music = v))
  slider('Sound effects', () => s.sfx, (v) => (s.sfx = v))
  choice('Screen shake', [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']], () => s.shake, (v) => (s.shake = v))
  choice('Effects', [['high', 'High'], ['low', 'Low']], () => s.effects, (v) => (s.effects = v))
  choice('Always fire', [[false, 'Off — hold fire'], [true, 'On']], () => s.alwaysFire, (v) => (s.alwaysFire = v))
  choice('Show FPS', [[false, 'Off'], [true, 'On']], () => s.showFps, (v) => (s.showFps = v))
  choice('Frame rate', [[60, '60 fps — cooler laptop'], [0, 'Display refresh']], () => s.fpsCap, (v) => (s.fpsCap = v))
  const full = h('div', { class: 'setting nav' }, h('span', null, 'Fullscreen'), h('span', { class: 'val' }, 'Toggle'))
  full.addEventListener('click', () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen() })
  body.append(full)
  const reset = h('button', { class: 'btn nav danger small', style: 'margin-top:14px' }, h('span', null, 'Erase save data'))
  reset.addEventListener('click', () => {
    if (!confirmReset) { confirmReset = true; reset.firstChild!.textContent = 'Press again to erase everything'; audio.sfx('ui_deny'); return }
    audio.sfx('ui_back')
    app.resetSave()
  })
  const el = h('div', { class: 'modal-wrap' },
    h('div', { class: 'modal paper', style: 'width:520px' },
      h('div', { class: 'kicker' }, 'Settings'),
      h('h2', { style: 'margin:6px 0 16px' }, 'Configuration'),
      body, reset,
      h('div', { style: 'margin-top:14px' }, btn('Close', onClose, { small: true })),
    ),
  )
  const nav = new Nav(el)
  nav.onBack = onClose
  nav.onAction = (a: MenuAction) => {
    const r = rows.find((x) => x.el === nav.focused)
    if (!r) return false
    if (a === 'left') { r.left(); return true }
    if (a === 'right') { r.right(); return true }
    return false
  }
  return { el, nav, backdrop: 'attract' }
}

// ───────────────────────── briefing ─────────────────────────

export function briefingScreen(app: App, m: MissionDef, c: Campaign): Screen {
  const text = h('div', { class: 'brief-text' })
  const paras = m.briefing
  let t = 0
  const full = paras.join('\n')
  const render = (n: number) => {
    text.innerHTML = ''
    let left = n
    for (const p of paras) {
      if (left <= 0) break
      text.append(h('p', null, p.slice(0, left)))
      left -= p.length + 1
    }
  }
  const isFirst = c.completed.length === 0 && !c.detour
  const secret = m.num === '??'
  const el = h('div', { class: 'screen paper' },
    h('div', { class: 'brief' },
      h('div', { class: 'side-note' },
        h('div', { class: 'kicker' }, 'Kestrel status'),
        h('div', { class: 'rule' }),
        h('div', { class: 'stat-row' }, h('span', null, 'Front'), h('b', null, `${ITEM[c.loadout.front.id].name} ${c.loadout.front.level}`)),
        h('div', { class: 'stat-row' }, h('span', null, 'Reactor'), h('b', null, ITEM[c.loadout.reactor].name)),
        h('div', { class: 'stat-row' }, h('span', null, 'Shield'), h('b', null, ITEM[c.loadout.shield].name)),
        h('div', { class: 'stat-row' }, h('span', null, 'Credits'), h('b', null, fmt(c.credits))),
        isFirst ? h('p', { style: 'margin-top:26px' }, 'First flight: your credits carry over. After the mission, Dasha\'s hangar opens — that is where the Kestrel becomes yours.') : null,
      ),
      h('div', { class: 'brief-doc' },
        h('div', { class: 'stamp' }, secret ? 'UNLISTED' : 'ORDERS'),
        h('div', { class: 'kicker' }, secret ? 'Mission ?? · coordinates unknown' : `Mission ${m.num} of ${String(ORDER.length).padStart(2, '0')}`),
        h('h1', null, m.name.toUpperCase()),
        h('div', { class: 'ember-bar', style: 'margin-top:12px' }),
        text,
        h('div', { class: 'menu' },
          btn('Launch', () => app.launch(), { primary: true, def: true, hint: 'enter' }),
          isFirst ? null : btn('Hangar', () => app.toHangar(), { hint: 'esc' }),
        ),
      ),
      h('div', { class: 'side-note' },
        h('div', { class: 'kicker' }, 'Handler'),
        h('div', { class: 'rule' }),
        h('p', null, 'Cmdr. Halloran, Verge Fleet logistics. Keeps his sentences short because the rest of the fleet does not listen past the first clause.'),
      ),
    ),
  )
  const nav = new Nav(el)
  nav.onBack = () => { if (!isFirst) app.toHangar() }
  nav.onAction = (a) => {
    if (a === 'confirm' && t * 60 < full.length) { t = 999; render(full.length); return true }
    return false
  }
  return {
    el, nav, backdrop: 'paper',
    update(dt) {
      if (t * 60 >= full.length) return
      t += dt
      render(Math.floor(t * 60))
    },
  }
}

// ───────────────────────── pause / failed ─────────────────────────

export function pauseScreen(app: App): Screen {
  const el = h('div', { class: 'overlay-field' },
    h('div', { class: 'modal paper', style: 'width:380px' },
      h('div', { class: 'kicker' }, 'Paused'),
      h('h2', { style: 'margin-top:6px' }, app.session?.mission.name.toUpperCase() ?? ''),
      h('div', { class: 'menu' },
        btn('Resume', () => app.resume(), { primary: true, def: true, hint: 'esc' }),
        btn('Restart mission', () => { app.resume(); app.retry() }),
        btn('Settings', () => app.openModal(settingsWrap(app))),
        btn('Abandon to hangar', () => app.abandon(), { danger: true, hint: 'credits lost' }),
      ),
    ),
  )
  const nav = new Nav(el)
  nav.onBack = () => app.resume()
  return { el, nav, backdrop: 'game' }
}

function settingsWrap(app: App): Screen {
  return settingsModal(app, () => app.openModal(pauseScreen(app)))
}

export function failedScreen(app: App): Screen {
  const s = app.session!
  const st = s.world.stats
  const el = h('div', { class: 'overlay-field failed' },
    h('div', { class: 'modal paper', style: 'width:400px' },
      h('div', { class: 'kicker', style: 'color:var(--bad)' }, 'Signal lost'),
      h('h2', { style: 'margin-top:6px' }, 'KESTREL DOWN'),
      h('p', { style: 'margin-top:12px;font-size:14px;color:var(--ink2);line-height:1.5' },
        `The salvage tug hauls what is left of you home. Credits collected in flight are lost; your loadout is intact. Progress: ${Math.round(s.runner.progress * 100)}%, ${st.kills} kills.`),
      h('div', { class: 'menu' },
        btn('Retry mission', () => app.retry(), { primary: true, def: true }),
        btn('Back to hangar', () => app.toHangar(), { hint: 'rethink the build' }),
        btn('Title screen', () => app.toTitle()),
      ),
    ),
  )
  const nav = new Nav(el)
  return { el, nav, backdrop: 'game' }
}

// ───────────────────────── results ─────────────────────────

export function resultsScreen(app: App, r: MissionResult, c: Campaign): Screen {
  const s = r.stats
  const acc = s.shotsFired ? Math.round((s.shotsHit / s.shotsFired) * 100) : 0
  const ground = s.groundTotal ? Math.round((s.groundKills / s.groundTotal) * 100) : 100
  const rows: [string, string][] = [
    ['Enemies destroyed', `${s.kills}`],
    ['Ground targets', `${s.groundKills} / ${s.groundTotal} · ${ground}%`],
    ['Accuracy', `${acc}%`],
    ['Best chain', `${s.maxChain}`],
    ['Hull damage taken', `${Math.round(r.hullDamage)}`],
    ['Flight time', fmtTime(s.time)],
    ['Boss', s.bossTime ? fmtTime(s.bossTime) : '—'],
    ['Secrets', `${r.secrets.length}`],
  ]
  const totalEl = h('b', { class: 'mono' }, '0')
  const el = h('div', { class: 'screen paper' },
    h('div', { class: 'results' },
      h('div', { class: 'res-left' },
        h('div', { class: 'kicker' }, `Mission ${r.mission.num} · ${r.mission.name}`),
        h('h1', null, 'COMPLETE'),
        h('div', { class: 'ledger' }, rows.map(([k, v]) => h('div', { class: 'stat-row' }, h('span', null, k), h('b', null, v)))),
        h('div', { class: 'stat-row', style: 'margin-top:12px;font-size:16px' }, h('span', null, 'Score'), h('b', { class: 'mono' }, fmt(r.score))),
        r.cores.length ? h('div', { style: 'margin-top:16px;display:flex;gap:8px;flex-wrap:wrap' },
          r.cores.map((id) => h('span', { class: 'pill core' }, `DATA CORE · ${Object.values(ITEM).find((i) => i.core === id)?.name ?? id} unlocked in the hangar`))) : null,
        r.warp ? h('p', { style: 'margin-top:16px;color:var(--core);font-weight:600' }, 'Your nav computer logged a set of coordinates that do not exist.') : null,
      ),
      h('div', { class: 'res-right' },
        h('div', { class: 'kicker' }, 'Payment'),
        h('div', { class: 'ledger', style: 'margin-top:12px' },
          h('div', { class: 'stat-row' }, h('span', null, 'Collected in flight'), h('b', null, fmt(r.earned))),
          h('div', { class: 'stat-row' }, h('span', null, 'Mission pay'), h('b', null, fmt(r.reward))),
          r.bonuses.map((b) => h('div', { class: 'stat-row bonus' }, h('span', null, b.name), h('b', null, `+${fmt(b.credits)}`))),
          h('div', { class: 'stat-row total' }, h('span', null, 'Total'), totalEl),
          h('div', { class: 'stat-row' }, h('span', null, 'Bank balance'), h('b', null, fmt(c.credits))),
        ),
        h('div', { class: 'menu', style: 'margin-top:auto' }, btn(c.finished ? 'Continue' : 'To the hangar', () => app.afterResults(), { primary: true, def: true })),
      ),
    ),
  )
  let t = 0
  const nav = new Nav(el)
  return {
    el, nav, backdrop: 'paper',
    update(dt) {
      if (t > 1.2) return
      t += dt
      const k = Math.min(1, t / 1.2)
      totalEl.textContent = fmt(r.total * (1 - (1 - k) ** 3))
      if (Math.random() < 0.3 && k < 1) audio.sfx('pickup_credit', { vol: 0.25, pitch: 1 + k })
    },
  }
}

// ───────────────────────── ending ─────────────────────────

export function endingScreen(app: App, c: Campaign): Screen {
  const d = DIFFICULTIES[c.difficulty]
  const el = h('div', { class: 'screen paper' },
    h('div', { class: 'ending' },
      h('div', { class: 'doc' },
        h('div', { class: 'kicker' }, 'After action · Verge Fleet'),
        h('h1', { style: 'font-size:34px;letter-spacing:0.12em;margin:6px 0 12px' }, 'THE SONG STOPS'),
        h('p', null, 'The Heart went dark at 03:52 ship time. Across the Verge, a few thousand mining machines stopped mid-sentence and sat down in the dust.'),
        h('p', null, 'Halloran logged it as "hostile network neutralised". Dasha logged it as "Kestrel: needs new everything". You logged nothing. You flew home slowly, for once, with the radio off.'),
        h('p', null, 'Somewhere under the refinery row on Cinder Reach, something is still humming. Very quietly. Out of tune.'),
        h('div', { class: 'rule' }),
        h('div', { class: 'stat-row' }, h('span', null, 'Difficulty'), h('b', null, d.name)),
        h('div', { class: 'stat-row' }, h('span', null, 'Campaign score'), h('b', null, fmt(c.score))),
        h('div', { class: 'stat-row' }, h('span', null, 'Enemies destroyed'), h('b', null, fmt(c.stats.kills))),
        h('div', { class: 'stat-row' }, h('span', null, 'Credits earned'), h('b', null, fmt(c.stats.earned))),
        h('div', { class: 'stat-row' }, h('span', null, 'Times shot down'), h('b', null, `${c.stats.deaths}`)),
        h('div', { class: 'stat-row' }, h('span', null, 'Secrets'), h('b', null, `${c.secrets.length}`)),
        h('p', { class: 'credits-roll' }, 'EMBERLINE — an original game. Design, code, art, sound and music generated procedurally. Thank you for flying.',
          app.records.completedDifficulties.length ? h('span', null, h('br'), h('b', null, 'Emberline difficulty unlocked.')) : null),
        h('div', { class: 'menu', style: 'margin-top:12px' }, btn('Return to title', () => app.toTitle(), { primary: true, def: true })),
      ),
    ),
  )
  return { el, nav: new Nav(el), backdrop: 'paper' }
}
