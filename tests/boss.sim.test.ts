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
    // no god mode: mechanics must be survivable by the autopilot; deaths are reported, not fatal
    w.hpScale = 1 + 0.22 * idx
    w.player.ai = autopilot(1)
    const L = new LevelScript(MISSIONS[id]); MISSIONS[id].script(L)
    const r = new LevelRunner(L, w)
    let t = 0, deaths = 0, raid = { ...w.raid.stats }, dmg0 = -1
    while (t < 900 && !w.flags.has('boss_dead')) {
      r.update(1 / 30); w.update(1 / 30); t += 1 / 30
      if (w.boss && dmg0 < 0) dmg0 = w.stats.damageTaken
      if (w.boss && !w.boss.dead) raid = { ...w.raid.stats }
      if (!w.player.alive || w.player.hull <= 0) { deaths++; w.player.hull = w.player.maxHull; w.player.alive = true; w.player.invuln = 2 }
    }
    const hit = dmg0 < 0 ? 0 : w.stats.damageTaken - dmg0
    process.stderr.write(`${id} ${name}: boss ${w.stats.bossTime.toFixed(0)}s (total ${t.toFixed(0)}s) dmg taken in fight ${hit.toFixed(0)} deaths ${deaths} kicks ${raid.kicks}/${raid.kicks + raid.kickMisses} soaks ${raid.soaks}/${raid.soaks + raid.soakMisses}\n`)
  }
}, 600_000)
