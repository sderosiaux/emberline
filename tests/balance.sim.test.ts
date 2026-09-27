/**
 * Campaign balance simulation (opt-in: BALANCE=1 npx vitest run tests/balance.sim.test.ts).
 * An autopilot with a greedy shopping policy plays the whole campaign without god mode,
 * so economy pacing and difficulty spikes show up as numbers instead of guesses.
 */
import { describe, it } from 'vitest'
import { World } from '../src/game/world'
import { LevelScript, LevelRunner } from '../src/game/level'
import { DIFFICULTIES, newCampaign, buy, upgrade, type Campaign, type DifficultyId } from '../src/game/campaign'
import { ITEM } from '../src/data/items'
import { MISSIONS, ORDER } from '../src/data/missions'
import { autopilot } from '../src/game/autopilot'
import { powerBudget } from '../src/game/power'

function shop(c: Campaign, style: string): Campaign {
  const tryDo = (f: (c: Campaign) => ReturnType<typeof buy>) => { const r = f(c); if (r.ok) { c = r.campaign; return true } return false }
  const reactors = ['r2', 'r3', 'r4', 'r5']
  const guns: Record<string, string[]> = { pulse: ['pulse'], spread: ['hail', 'arc', 'helix'], heavy: ['hornet', 'bloom', 'rail'] }
  for (let guard = 0; guard < 40; guard++) {
    const pb = powerBudget(c.loadout)
    let did = false
    // switch to the style's best available gun once affordable at a level at least as good
    const pref = guns[style].filter((g) => c.completed.length >= ITEM[g].unlock).pop()
    if (pref && c.loadout.front.id !== pref && c.loadout.front.level <= 3) did = tryDo((x) => buy(x, pref, 'front'))
    if (!did && pb.draw > pb.output * 0.95) {
      const nx = reactors.find((r) => ITEM[r].output! > ITEM[c.loadout.reactor].output! && c.completed.length >= ITEM[r].unlock)
      if (nx) did = tryDo((x) => buy(x, nx, 'reactor'))
    }
    if (!did) did = tryDo((x) => upgrade(x, 'front'))
    if (!did && !c.loadout.podL) did = tryDo((x) => buy(x, 'wasp', 'podL'))
    if (!did && !c.loadout.podR) did = tryDo((x) => buy(x, c.completed.length >= 1 ? 'viper' : 'wasp', 'podR'))
    const hulls = ['h2', 'h3', 'h4']
    const nh = hulls.find((h) => ITEM[h].hull! > ITEM[c.loadout.hull].hull! && c.completed.length >= ITEM[h].unlock)
    if (!did && nh && c.loadout.front.level >= 4) did = tryDo((x) => buy(x, nh, 'hull'))
    const shields = ['s2', 's4']
    const ns = shields.find((h) => ITEM[h].shieldCap! > ITEM[c.loadout.shield].shieldCap! && c.completed.length >= ITEM[h].unlock)
    if (!did && ns && c.loadout.front.level >= 5) did = tryDo((x) => buy(x, ns, 'shield'))
    if (!did && !c.loadout.rear) did = tryDo((x) => buy(x, 'flank', 'rear'))
    if (!did && c.loadout.rear) did = tryDo((x) => upgrade(x, 'rear'))
    if (!did) did = tryDo((x) => upgrade(x, 'podL')) || tryDo((x) => upgrade(x, 'podR'))
    if (!did) break
  }
  return c
}

function fly(c: Campaign, id: string, idx: number, diff: DifficultyId) {
  const m = MISSIONS[id]
  const w = new World(c.loadout, DIFFICULTIES[diff])
  w.hpScale = 1 + 0.22 * idx
  w.creditScale = 1 + 0.3 * idx
  w.scroll = m.scroll
  w.player.ai = autopilot(1)
  const L = new LevelScript(m)
  m.script(L)
  const r = new LevelRunner(L, w)
  let t = 0
  while (t < 700) {
    r.update(1 / 30); w.update(1 / 30); t += 1 / 30
    if (!w.player.alive) break
    if (r.done && !w.enemies.some((e) => e.layer === 'air' && !e.dead && !e.gone && !e.s.ignoreGate)) break
  }
  return { won: w.player.alive && r.done, t, hull: w.player.hull / w.player.maxHull, earned: w.stats.creditsEarned, progress: r.progress, boss: w.stats.bossTime, dmg: w.stats.damageTaken }
}

describe.skipIf(!process.env.BALANCE)('balance', () => {
  for (const style of ['pulse', 'spread', 'heavy']) {
    it(`campaign sim (${style})`, () => {
      const diff = (process.env.DIFF ?? 'gunship') as DifficultyId
      let c = newCampaign(diff)
      const log: string[] = []
      for (let i = 0; i < ORDER.length; i++) {
        const id = ORDER[i]
        c = shop(c, style)
        let res = fly(c, id, i, diff)
        let tries = 1
        while (!res.won && tries < 4) { res = fly(c, id, i, diff); tries++ }
        const pay = 1500 + 1000 * i
        const gain = (res.won ? res.earned + pay : 0)
        c = { ...c, credits: c.credits + gain, completed: [...c.completed, id], next: c.next + 1 }
        const l = c.loadout
        log.push(`${id} ${res.won ? 'WON ' : 'LOST'} tries=${tries} t=${res.t.toFixed(0)}s boss=${res.boss.toFixed(0)}s prog=${(res.progress * 100).toFixed(0)}% hull=${(res.hull * 100).toFixed(0)}% dmg=${res.dmg.toFixed(0)} +${gain} bank=${c.credits} | ${l.front.id}${l.front.level} ${l.rear?.id ?? '-'}${l.rear?.level ?? ''} ${l.podL?.id ?? '-'}/${l.podR?.id ?? '-'} ${l.reactor} ${l.shield} ${l.hull} E${powerBudget(l).draw.toFixed(0)}/${powerBudget(l).output}`)
      }
      process.stderr.write(`\n== ${style} (${diff}) ==\n${log.join('\n')}\n`)
    }, 600_000)
  }
})
