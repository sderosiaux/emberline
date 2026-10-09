import type { App, Screen } from '../app'
import { h, fmt } from './dom'
import { Nav } from './nav'
import { btn } from './screens'
import type { ArcadeRun } from '../game/arcade'
import { rank, type Mods, type PerkDef, PERK } from '../game/perks'
import { audio } from '../audio/audio'
import { ARCADE_STAGES, MISSIONS } from '../data/missions'

const row = (k: string, v: string) => h('div', { class: 'stat-row' }, h('span', null, k), h('b', null, v))

export function arcadeStageScreen(app: App, run: ArcadeRun, stageName: string, final: boolean): Screen {
  const next = final ? null : MISSIONS[ARCADE_STAGES[run.stage]]
  const el = h('div', { class: 'screen paper' },
    h('div', { class: 'ending' },
      h('div', { class: 'doc' },
        h('div', { class: 'kicker' }, final ? 'Arcade · run complete' : `Arcade · stage ${run.stage} of ${ARCADE_STAGES.length} clear`),
        h('h1', { style: 'font-size:34px;letter-spacing:0.12em;margin:6px 0 14px' }, final ? 'ALL CLEAR' : stageName.toUpperCase()),
        row('Score', fmt(run.score)),
        row('High score', fmt(Math.max(run.score, app.records.arcadeBest))),
        row('Graze', fmt(run.graze)),
        row('Spell cards captured', `${run.captured} / ${run.spells}`),
        row('Lives · Bombs · Power', `${run.lives} · ${run.bombs} · ${run.power.toFixed(2)}`),
        row('Level · Upgrades', `${run.level} · ${Object.entries(run.mods).map(([k, v]) => `${PERK[k].name}${v > 1 ? ' ' + v : ''}`).join(', ') || '—'}`),
        run.continues ? row('Continues used', `${run.continues}`) : null,
        h('div', { class: 'menu', style: 'margin-top:18px' },
          next ? btn(`Stage ${run.stage + 1} — ${next.name}`, () => app.launchArcadeStage(), { primary: true, def: true }) : null,
          btn('Title screen', () => app.leaveArcade(), { primary: !next, def: !next }),
        ),
      ),
    ),
  )
  return { el, nav: new Nav(el), backdrop: 'paper' }
}

export function arcadeOverScreen(app: App, run: ArcadeRun): Screen {
  const el = h('div', { class: 'overlay-field failed' },
    h('div', { class: 'modal paper', style: 'width:400px' },
      h('div', { class: 'kicker', style: 'color:var(--bad)' }, `Stage ${run.stage + 1}`),
      h('h2', { style: 'margin-top:6px' }, 'GAME OVER'),
      h('div', { style: 'margin-top:12px' }, row('Score', fmt(run.score)), row('Graze', fmt(run.graze)), row('Spells captured', `${run.captured} / ${run.spells}`)),
      h('div', { class: 'menu' },
        btn('Continue', () => app.continueArcade(), { primary: true, def: true, hint: 'score resets' }),
        btn('Title screen', () => app.leaveArcade()),
      ),
    ),
  )
  return { el, nav: new Nav(el), backdrop: 'game' }
}

const TAG_COLOR: Record<string, string> = { gun: '#ff9a3d', kill: '#ff5a5a', graze: '#c49bff', body: '#5ac8ff', rift: '#ff4a8a' }

/** Level-up: the run is frozen and the player picks one of three cards (1/2/3, arrows + confirm, or click). */
export function levelUpModal(cards: PerkDef[], mods: Mods, level: number, pick: (id: string) => void): Screen {
  const done = (id: string) => { audio.sfx('ui_upgrade'); pick(id) }
  const el = h('div', { class: 'overlay-field' },
    h('div', { class: 'levelup' },
      h('div', { class: 'kicker', style: 'color:#ffd27a;text-align:center' }, `Level ${level}`),
      h('h2', { style: 'text-align:center;color:#fff;letter-spacing:0.2em;margin:4px 0 18px' }, 'CHOOSE AN UPGRADE'),
      h('div', { class: 'perk-row' }, cards.map((c, i) => {
        const r = rank(mods, c.id)
        return h('button', { class: 'perk nav', 'data-default': i === 1, style: `--tag:${TAG_COLOR[c.tag]}`, onClick: () => done(c.id) },
          h('div', { class: 'perk-key' }, `${i + 1}`),
          h('div', { class: 'perk-tag' }, c.rare ? 'rare' : c.tag),
          h('div', { class: 'perk-name' }, c.name),
          h('div', { class: 'perk-text' }, c.text[r]),
          h('div', { class: 'perk-pips' }, Array.from({ length: c.max }, (_, k) => h('i', { class: k < r ? 'on' : k === r ? 'next' : '' }))),
        )
      })),
    ),
  )
  const nav = new Nav(el)
  const key = (e: KeyboardEvent) => { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && cards[i]) done(cards[i].id) }
  window.addEventListener('keydown', key)
  return { el, nav, backdrop: 'game', dispose: () => window.removeEventListener('keydown', key) }
}
