import type { World } from '../world'
import type { Enemy } from '../entities'
import type { EnemyDef } from '../enemy-def'
import { registerEnemy } from '../../data/enemies'
import { chainExplosion, explode } from '../fx'
import { audio } from '../../audio/audio'
import { PickupKind } from '../entities'
import { rand } from '../../core/math'
import { P, C } from '../../render/particles'

/** Register a boss-only enemy definition (defaults suited for boss parts). */
export function bossDef(d: Partial<EnemyDef> & Pick<EnemyDef, 'id' | 'hp' | 'r' | 'sprite'>): EnemyDef {
  const full: EnemyDef = {
    layer: 'air', score: 1000, credits: 0, charge: 10, explode: 'medium', contact: 0, noShadow: true, boss: true,
    ...d,
  }
  registerEnemy(full)
  return full
}

export interface BossCtl {
  root: Enemy
  parts: Enemy[]
  phase: number
  t: number
}

/**
 * Start a boss fight: marks parts for the HUD bar, locks them on screen,
 * plays the warning and switches music. When `root` dies the fight ends with a
 * chained destruction sequence and a credit shower.
 */
export function startBoss(w: World, root: Enemy, name: string, parts: Enemy[], finalBoss = false) {
  w.boss = root
  w.bossName = name
  w.bossParts = [root, ...parts]
  for (const e of w.bossParts) { e.bossPart = true; e.noCull = true }
  root.s.ignoreGate = 1
  w.emit({ type: 'boss', name })
  w.arcade?.nextSpell(w)
  if (!w.preview) audio.music.play(finalBoss ? 'final_boss' : 'boss', { fade: 1 })
  audio.music.setIntensity(3)
  const t0 = w.time
  const prior = root.onDeath
  root.onDeath = (ww, e) => {
    prior?.(ww, e)
    ww.arcade?.finishSpell(ww, false)
    ww.stats.bossTime = ww.time - t0
    for (const p of ww.bossParts) if (!p.dead && p !== e) ww.kill(p, false)
    for (const b of ww.bullets.items) if (b.active) { ww.parts.spawn(P.Glow, b.x, b.y, 0, 0, 0.3, 8, 2, C.magenta); ww.bullets.kill(b) }
    ww.lasers.length = 0
    chainExplosion(ww, e.x, e.y, e.r * 1.1, finalBoss ? 40 : 22, finalBoss ? 3.5 : 2.2, 'huge')
    ww.hitstop = 0.12
    ww.after(finalBoss ? 3.6 : 2.3, () => {
      for (let i = 0; i < 24; i++) ww.pickup(PickupKind.CreditBig, e.x + rand(-60, 60), e.y + rand(-40, 40), 40 + Math.round(ww.diff.creditMul * 20))
      ww.flags.add('boss_dead')
      ww.boss = null
      ww.emit({ type: 'bossDown' })
    })
  }
}

/** Part destroyed: crunchy feedback + boss-part sound. */
export function partDown(w: World, e: Enemy, size: 'medium' | 'large' = 'large') {
  explode(w, e.x, e.y, size)
  if (!w.preview) audio.sfx('boss_part')
  w.addShake(8)
}

export function phaseShift(w: World, text?: string) {
  if (!w.preview) audio.sfx('boss_phase')
  w.addShake(10)
  w.flashScreen = 0.25
  if (text) w.emit({ type: 'radio', who: 'CHOIR', text, tone: 'enemy' })
  w.arcade?.nextSpell(w)
}

/** Living non-root parts with a given tag. */
export const alive = (parts: Enemy[], tag?: string) => parts.filter((p) => !p.dead && (!tag || p.tag === tag))
