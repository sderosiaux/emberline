import type { App } from './app'
import { MISSIONS, ORDER } from './data/missions'
import { newCampaign, type Loadout, type DifficultyId } from './game/campaign'
import { autopilot } from './game/autopilot'
import * as save from './game/save'
import { ITEM } from './data/items'

/**
 * Developer tools, enabled with ?debug in the URL. Keyboard shortcuts for
 * manual testing plus a window.__emb API used by the automated playtests.
 */
export function installDebug(app: App) {
  const w = () => app.session?.world
  window.addEventListener('keydown', (e) => {
    const s = app.session
    switch (e.code) {
      case 'F1': if (w()) { w()!.god = !w()!.god; console.log('god', w()!.god) } break
      // arcade: F2 = effectively infinite lives and bombs for testing
      case 'F2': if (app.arcade) { app.arcade.lives = 99; app.arcade.bombs = 99; console.log('arcade: 99 lives / 99 bombs') } else if (app.campaign) { app.campaign.credits += 10000; save.saveCampaign(app.campaign); if (app.screen?.backdrop === 'paper') app.toHangar() } break
      case 'F3': if (w()) for (const en of w()!.enemies) if (!en.bossPart) w()!.kill(en) ; break
      case 'F4': if (s) skipToBoss(app) ; break
      case 'F6': app.slowmo = app.slowmo === 1 ? 0.25 : 1; break
      case 'F7': app.renderer.showHitboxes = !app.renderer.showHitboxes; break
      case 'F8': if (s) s.hud.showFps = !s.hud.showFps; break
      case 'F9': if (app.arcade) { const ids = ['pulse', 'hail', 'sunline', 'hornet']; app.arcade.weapon = ids[(ids.indexOf(app.arcade.weapon) + 1) % ids.length]; app.arcade.power = Math.max(app.arcade.power, 2) } else if (app.campaign) { const f = app.campaign.loadout.front; f.level = Math.min(ITEM[f.id].maxLevel, f.level + 1); save.saveCampaign(app.campaign) } break
      case 'F10': if (s) { s.runner.done = true; for (const en of w()!.enemies) en.gone = true; w()!.flags.add('boss_dead') } break
      default: return
    }
    e.preventDefault()
  })

  const api = {
    app,
    missions: ORDER,
    /** Start a mission directly with an optional loadout. */
    start(id: string, opts: { loadout?: Partial<Loadout>; difficulty?: DifficultyId; credits?: number } = {}) {
      const c = newCampaign(opts.difficulty ?? 'gunship')
      if (opts.loadout) Object.assign(c.loadout, opts.loadout)
      c.credits = opts.credits ?? c.credits
      const idx = ORDER.indexOf(id)
      c.next = idx >= 0 ? idx : 0
      c.completed = ORDER.slice(0, Math.max(0, idx))
      if (idx < 0) c.detour = id
      app.campaign = c
      app.launch()
      return c
    },
    autopilot(on = true, skill = 1) { const s = app.session; if (s) s.world.player.ai = on ? autopilot(skill) : null },
    god(on = true) { const s = app.session; if (s) s.world.god = on },
    /** Advance the simulation without rendering (headless fast-forward). */
    simulate(seconds: number, step = 1 / 60) {
      const s = app.session
      if (!s) return null
      const n = Math.ceil(seconds / step)
      for (let i = 0; i < n && s.state !== 'won' && s.state !== 'lost'; i++) s.update(step)
      return api.state()
    },
    state() {
      const s = app.session
      if (!s) return { screen: app.screen?.backdrop ?? null, credits: app.campaign?.credits ?? null }
      const ww = s.world
      return {
        mission: s.mission.id, state: s.state, time: +ww.time.toFixed(2), progress: +s.runner.progress.toFixed(3),
        hull: Math.round(ww.player.hull), shield: Math.round(ww.player.shield), energy: Math.round(ww.player.energy),
        enemies: ww.enemies.length, bullets: ww.bullets.count, shots: ww.shots.count, particles: ww.parts.count,
        kills: ww.stats.kills, credits: ww.stats.creditsEarned, boss: ww.boss ? ww.bossName : null, fps: Math.round(app.fps), updMs: +app.perf.update.toFixed(2), renMs: +app.perf.render.toFixed(2),
        secrets: ww.stats.secrets, flags: [...ww.flags],
      }
    },
    skipToBoss: () => skipToBoss(app),
    missionsAll: () => Object.keys(MISSIONS),
  }
  ;(window as unknown as { __emb: typeof api }).__emb = api
  console.info('[emberline] debug enabled: F1 god · F2 +10k · F3 kill all · F4 boss · F6 slowmo · F7 hitboxes · F8 fps · F9 +front lvl · F10 win')
}

function skipToBoss(app: App) {
  const s = app.session
  if (!s) return
  const steps = s.runner.L.steps
  const bossStep = steps.findIndex((st) => st.gate === 'flag')
  if (bossStep < 0) return
  const target = steps[bossStep].t - 4
  // fast-forward: drop earlier spawns, jump runner time
  const r = s.runner as unknown as { i: number; t: number }
  let i = r.i
  while (i < steps.length && steps[i].t < target - 3) i++
  r.i = i
  r.t = target - 3
  for (const e of s.world.enemies) e.gone = true
  s.world.scroll = 0
}
