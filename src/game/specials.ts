import type { Player } from './player'
import type { World } from './world'
import { P, C } from '../render/particles'
import { shoot } from './weapons'
import { audio } from '../audio/audio'
import { rand, TAU } from '../core/math'
import { explode } from './fx'

interface Nova { x: number; y: number; r: number; hit: Set<number> }
interface Well { x: number; y: number; t: number }

/** Transient special-ability state lives on the world so renderers can see it. */
export interface SpecialFx { nova: Nova | null; well: Well | null; swarmLeft: number; swarmCd: number }

const fx = new WeakMap<World, SpecialFx>()
export function specialFx(w: World): SpecialFx {
  let f = fx.get(w)
  if (!f) { f = { nova: null, well: null, swarmLeft: 0, swarmCd: 0 }; fx.set(w, f) }
  return f
}

export function triggerSpecial(p: Player, w: World, id: string) {
  const f = specialFx(w)
  p.specialKind = id
  switch (id) {
    case 'nova':
      f.nova = { x: p.x, y: p.y, r: 10, hit: new Set() }
      w.flashScreen = 0.35
      w.addShake(10)
      if (!w.preview && !w.arcade) audio.sfx('special_nova') // arcade plays its own bomb sound
      break
    case 'overclock':
      p.overclock = 7
      p.energy = p.maxEnergy
      if (!w.preview) audio.sfx('special_overclock')
      break
    case 'phase':
      p.phased = true
      p.specialActive = 3
      if (!w.preview) audio.sfx('special_phase')
      break
    case 'swarm':
      f.swarmLeft = 40
      if (!w.preview) audio.sfx('special_swarm')
      break
    case 'singularity':
      f.well = { x: p.x, y: Math.max(120, p.y - 230), t: 4.5 }
      if (!w.preview) audio.sfx('special_singularity')
      break
  }
}

export function updateSpecial(p: Player, w: World, dt: number) {
  const f = specialFx(w)
  if (p.specialActive > 0) {
    p.specialActive -= dt
    if (p.specialActive <= 0) { p.phased = false; p.invuln = 0.6 }
    if (p.phased && Math.random() < 0.8) w.parts.spawn(P.Glow, p.x + rand(-10, 10), p.y + rand(-12, 12), 0, 60, 0.3, 10, 2, C.violet)
  }
  if (f.nova) {
    const n = f.nova
    n.r += 900 * dt
    w.clearBullets(n.x, n.y, n.r, true)
    for (const e of w.enemies) {
      if (e.dead || n.hit.has(e.id)) continue
      if (Math.hypot(e.x - n.x, e.y - n.y) < n.r + e.r) { n.hit.add(e.id); w.damage(e, 180, e.x, e.y) }
    }
    if (n.r > 420) f.nova = null
  }
  if (f.swarmLeft > 0) {
    f.swarmCd -= dt
    while (f.swarmCd <= 0 && f.swarmLeft > 0) {
      f.swarmCd += 0.035
      f.swarmLeft--
      const side = f.swarmLeft % 2 ? -1 : 1
      shoot(w, p.x + side * 12, p.y, -Math.PI / 2 + side * rand(0.6, 1.6), rand(180, 300), 30, 'shot_missile', { r: 5, homing: 7, ttl: 2.6, splash: 26, splashDmg: 15, count: false })
    }
  }
  if (f.well) {
    const g = f.well
    g.t -= dt
    for (const b of w.bullets.items) {
      if (!b.active) continue
      const dx = g.x - b.x, dy = g.y - b.y, d = Math.hypot(dx, dy)
      if (d < 24) { w.bullets.kill(b); continue }
      if (d < 260) { const k = (1 - d / 260) * 1600 * dt; b.vx += (dx / d) * k; b.vy += (dy / d) * k }
    }
    for (const e of w.enemies) {
      if (e.dead || e.layer !== 'air' || e.parent || e.bossPart || e.maxHp > 1500 || e.noCull) continue
      const dx = g.x - e.x, dy = g.y - e.y, d = Math.hypot(dx, dy)
      if (d < 240 && d > 4) { const k = (1 - d / 240) * 260 * dt; e.x += (dx / d) * k; e.y += (dy / d) * k }
    }
    for (const e of w.enemies) {
      if (e.dead) continue
      if (Math.hypot(e.x - g.x, e.y - g.y) < 90 + e.r) w.damage(e, 160 * dt, e.x, e.y, true)
    }
    if (Math.random() < 0.9) {
      const a = Math.random() * TAU, r = rand(60, 140)
      w.parts.spawn(P.Spark, g.x + Math.cos(a) * r, g.y + Math.sin(a) * r, -Math.cos(a) * r * 2.5 - Math.sin(a) * 200, -Math.sin(a) * r * 2.5 + Math.cos(a) * 200, 0.35, 1.5, 0.5, C.violet)
    }
    if (g.t <= 0) {
      explode(w, g.x, g.y, 'large', false, C.violet)
      w.splash(g.x, g.y, 140, 120)
      f.well = null
    }
  }
}
