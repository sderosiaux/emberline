/** Opt-in (BOSS=m6): time-to-kill for one mission's boss with a tier-appropriate build and the autopilot. */
import { it } from 'vitest'
import { World } from '../src/game/world'
import { LevelScript, LevelRunner } from '../src/game/level'
import { DIFFICULTIES, type Loadout } from '../src/game/campaign'
import { MISSIONS, ORDER } from '../src/data/missions'
import { autopilot } from '../src/game/autopilot'

it.skipIf(!process.env.BOSS)('boss time-to-kill', () => {
  const id = process.env.BOSS!
  const idx = Math.max(0, ORDER.indexOf(id))
  const builds: Record<string, Loadout> = {
    pulse: { front: { id: 'pulse', level: 6 }, rear: null, podL: { id: 'wasp', level: 1 }, podR: { id: 'viper', level: 1 }, reactor: 'r3', shield: 's2', hull: 'h3', special: 'nova' },
    helix: { front: { id: 'helix', level: 7 }, rear: null, podL: { id: 'wasp', level: 1 }, podR: { id: 'viper', level: 1 }, reactor: 'r3', shield: 's1', hull: 'h1', special: 'nova' },
    bloom: { front: { id: 'bloom', level: 7 }, rear: null, podL: { id: 'wasp', level: 1 }, podR: { id: 'viper', level: 1 }, reactor: 'r2', shield: 's1', hull: 'h3', special: 'nova' },
  }
  for (const [name, l] of Object.entries(builds)) {
    const w = new World(l, DIFFICULTIES.gunship)
    w.god = true
    w.hpScale = 1 + 0.22 * idx
    w.player.ai = autopilot(1)
    const L = new LevelScript(MISSIONS[id]); MISSIONS[id].script(L)
    const r = new LevelRunner(L, w)
    let t = 0
    while (t < 900 && !w.flags.has('boss_dead')) { r.update(1 / 30); w.update(1 / 30); t += 1 / 30 }
    process.stderr.write(`${id} ${name}: boss ${w.stats.bossTime.toFixed(0)}s (total ${t.toFixed(0)}s)\n`)
  }
}, 600_000)
