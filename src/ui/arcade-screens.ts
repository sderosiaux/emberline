import type { App, Screen } from '../app'
import { h, fmt } from './dom'
import { Nav } from './nav'
import { btn } from './screens'
import type { ArcadeRun } from '../game/arcade'
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
