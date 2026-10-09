import type { World } from '../world'
import type { Enemy } from '../entities'
import { P, C } from '../../render/particles'
import { explode } from '../fx'
import { audio } from '../../audio/audio'
import { TAU, clamp } from '../../core/math'

/**
 * Dungeon-boss mechanics (WoW-style) shared by every boss: named casts with a cast bar,
 * interruptible casts ("kicks": land enough damage on a weak point before the bar fills),
 * ground zones to dodge, soak zones to stand in, pulls, raid warnings and an enrage timer.
 *
 * The rule the bosses follow: every big hit is announced (cast bar + warning + telegraph) and
 * has a counterplay that asks for a decision — move out, move in, or burst the weak point.
 */

export interface Kick {
  target: Enemy
  need: number
  dealt: number
}

export interface Cast {
  name: string
  time: number
  t: number
  kick: Kick | null
  done: (w: World) => void
  kicked?: (w: World) => void
}

export type ZoneKind = 'blast' | 'soak' | 'pool'

export interface Zone {
  x: number
  y: number
  r: number
  kind: ZoneKind
  /** Seconds until it resolves. */
  delay: number
  t: number
  dmg: number
  /** Pools linger and burn for this long after resolving. */
  linger: number
  live: boolean
  boom?: (w: World, z: Zone, inside: boolean) => void
}

interface Pull { x: number; y: number; force: number; left: number }

export interface CastOpts {
  /** Interruptible: damage `target` must take before the bar fills. Sized from the player's recent DPS. */
  kick?: { target: Enemy; seconds?: number }
  kicked?: (w: World) => void
  warn?: string
}

const DPS_WINDOW = 6

export class Raid {
  cast: Cast | null = null
  zones: Zone[] = []
  pulls: Pull[] = []
  /** Boss attack-rate multiplier (enrage raises it). */
  rate = 1
  enrageAt = 0
  enraged = false
  /** Boss can't act (interrupted). */
  stunT = 0
  /** Boss parts take extra damage (after a successful kick). */
  vulnT = 0
  /** Outcome counters (tests, balance sims). */
  stats = { kicks: 0, kickMisses: 0, soaks: 0, soakMisses: 0 }
  /** Recent damage dealt to boss parts, for sizing kicks to the player's actual firepower. */
  private hits: { t: number; d: number }[] = []

  reset() {
    this.cast = null; this.zones.length = 0; this.pulls.length = 0
    this.stats = { kicks: 0, kickMisses: 0, soaks: 0, soakMisses: 0 }
    this.rate = 1; this.enrageAt = 0; this.enraged = false; this.stunT = 0; this.vulnT = 0; this.hits.length = 0
  }

  /** Boss is free to start a new ability. */
  ready() { return !this.cast && this.stunT <= 0 }

  begin(w: World, name: string, time: number, done: (w: World) => void, o: CastOpts = {}) {
    let kick: Kick | null = null
    if (o.kick) {
      // a fair kick asks for most of what the player has been dealing, focused on one spot
      const need = Math.max(250, this.dps(w) * time * (o.kick.seconds ?? 0.7))
      kick = { target: o.kick.target, need: Math.round(need), dealt: 0 }
    }
    this.cast = { name, time, t: 0, kick, done, kicked: o.kicked }
    if (o.warn) warn(w, o.warn, kick ? 'kick' : 'danger')
    if (!w.preview) audio.sfx(kick ? 'cast_kick' : 'cast_start')
  }

  /** Called by World.damage for every hit that lands on an enemy. */
  onDamage(w: World, e: Enemy, d: number) {
    if (!e.bossPart) return
    this.hits.push({ t: w.time, d })
    const k = this.cast?.kick
    if (k && k.target === e) k.dealt += d
  }

  dmgMul(e: Enemy) { return e.bossPart && this.vulnT > 0 ? 1.5 : 1 }

  dps(w: World) {
    while (this.hits.length && this.hits[0].t < w.time - DPS_WINDOW) this.hits.shift()
    let s = 0
    for (const h of this.hits) s += h.d
    // early in a fight there is no history yet: assume a modest stream
    return Math.max(s / DPS_WINDOW, 120)
  }

  zone(z: Omit<Zone, 't' | 'live' | 'linger'> & { linger?: number }) {
    this.zones.push({ ...z, t: 0, live: false, linger: z.linger ?? 0 })
  }

  pull(x: number, y: number, force: number, dur: number) { this.pulls.push({ x, y, force, left: dur }) }

  update(w: World, dt: number) {
    if (this.stunT > 0) this.stunT -= dt
    if (this.vulnT > 0) this.vulnT -= dt
    if (!this.enraged && this.enrageAt > 0 && w.time >= this.enrageAt && w.boss) {
      this.enraged = true
      this.rate = 1.6
      warn(w, 'ENRAGED', 'danger')
      w.flashScreen = Math.max(w.flashScreen, 0.3)
      if (!w.preview) audio.sfx('raid_warning')
    }
    const c = this.cast
    if (c) {
      c.t += dt
      if (c.kick && c.kick.dealt >= c.kick.need) {
        this.cast = null
        this.stunT = 3
        this.vulnT = 6
        warn(w, 'INTERRUPTED', 'good')
        this.stats.kicks++
        const t = c.kick.target
        explode(w, t.x, t.y, 'medium', false, C.cyan, true)
        w.parts.spawn(P.Ring, t.x, t.y, 0, 0, 0.5, 20, 220, C.cyan)
        w.hitstop = Math.max(w.hitstop, 0.08)
        if (!w.preview) audio.sfx('interrupt')
        c.kicked?.(w)
      } else if (c.t >= c.time) {
        this.cast = null
        if (c.kick) this.stats.kickMisses++
        c.done(w)
      }
    }
    const p = w.player
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i]
      z.t += dt
      const inside = p.alive && (p.x - z.x) ** 2 + (p.y - z.y) ** 2 < (z.r + p.hitR) ** 2
      if (!z.live && z.t >= z.delay) {
        z.live = true
        resolve(w, z, inside)
        if (z.linger <= 0) { this.zones.splice(i, 1); continue }
      }
      if (z.live) {
        if (inside) p.hurt(z.dmg * dt, p.x, p.y, true)
        if (z.t >= z.delay + z.linger) this.zones.splice(i, 1)
      }
    }
    for (let i = this.pulls.length - 1; i >= 0; i--) {
      const q = this.pulls[i]
      q.left -= dt
      if (q.left <= 0) { this.pulls.splice(i, 1); continue }
      if (!p.alive) continue
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1
      const f = q.force * Math.min(1, d / 60)
      p.x += (dx / d) * f * dt
      p.y += (dy / d) * f * dt
      if (Math.random() < 0.5) w.parts.spawn(P.Spark, p.x + (Math.random() - 0.5) * 60, p.y + (Math.random() - 0.5) * 60, dx / d * 160, dy / d * 160, 0.3, 1.5, 0.5, C.cyan, 0)
    }
  }
}

function resolve(w: World, z: Zone, inside: boolean) {
  const p = w.player
  if (z.kind === 'soak') {
    if (inside) {
      p.hurt(z.dmg * 0.2, p.x, p.y)
      w.parts.spawn(P.Ring, z.x, z.y, 0, 0, 0.45, z.r, z.r * 1.6, C.yellow)
      warn(w, 'SOAKED', 'good')
      w.raid.stats.soaks++
      if (!w.preview) audio.sfx('soak')
    } else {
      // nobody stood in it: the whole field takes the hit
      p.hurt(z.dmg, p.x, p.y)
      w.flashScreen = Math.max(w.flashScreen, 0.55)
      w.addShake(14)
      warn(w, 'MISSED THE SOAK', 'danger')
      w.raid.stats.soakMisses++
      if (!w.preview) audio.sfx('zone_boom')
    }
    explode(w, z.x, z.y, 'large', false, C.yellow, true)
  } else {
    if (inside && z.kind === 'blast') p.hurt(z.dmg, p.x, p.y)
    explode(w, z.x, z.y, z.r > 70 ? 'large' : 'medium', false, z.kind === 'pool' ? C.magenta : C.orange, true)
    w.addShake(z.r > 70 ? 6 : 3)
    if (!w.preview) audio.sfx('zone_boom', { vol: 0.6 })
  }
  z.boom?.(w, z, inside)
}

export type WarnTone = 'danger' | 'kick' | 'good'
export function warn(w: World, text: string, tone: WarnTone = 'danger') { w.emit({ type: 'warn', text, tone }) }

/** World-space telegraphs, drawn on the ground under units. */
export function drawZones(c: CanvasRenderingContext2D, w: World) {
  const r = w.raid
  for (const z of r.zones) {
    const k = clamp(z.t / z.delay, 0, 1)
    const col = z.kind === 'soak' ? '255,206,60' : z.kind === 'pool' ? '255,60,140' : '255,90,40'
    c.save()
    if (z.live) {
      // burning pool
      const fl = 0.55 + 0.15 * Math.sin(w.time * 9 + z.x)
      const g = c.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r)
      g.addColorStop(0, `rgba(${col},${fl})`)
      g.addColorStop(0.8, `rgba(${col},${fl * 0.6})`)
      g.addColorStop(1, `rgba(${col},0)`)
      c.globalCompositeOperation = 'lighter'
      c.fillStyle = g
      c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill()
    } else {
      // telegraph: faint disc, a rim, and an inner disc growing to the rim as it resolves
      c.fillStyle = `rgba(${col},${0.1 + 0.08 * k})`
      c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill()
      c.fillStyle = `rgba(${col},${0.22 + 0.2 * k})`
      c.beginPath(); c.arc(z.x, z.y, z.r * k, 0, TAU); c.fill()
      c.lineWidth = 2.5
      c.strokeStyle = `rgba(${col},${0.6 + 0.4 * Math.sin(w.time * 14) * k})`
      c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.stroke()
      if (z.kind === 'soak') {
        // chevrons pointing in: "stand here"
        c.fillStyle = `rgba(${col},0.9)`
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + w.time * 0.8, rr = z.r + 14 - 6 * Math.sin(w.time * 6)
          const x = z.x + Math.cos(a) * rr, y = z.y + Math.sin(a) * rr
          c.save(); c.translate(x, y); c.rotate(a + Math.PI)
          c.beginPath(); c.moveTo(8, 0); c.lineTo(-5, -7); c.lineTo(-5, 7); c.closePath(); c.fill()
          c.restore()
        }
      }
    }
    c.restore()
  }
}

/** Mechanics that must read over the boss itself: the kick reticle and pull wells. */
export function drawMechanicsOver(c: CanvasRenderingContext2D, w: World) {
  const r = w.raid
  // kick target: pulsing reticle on the weak point while an interruptible cast runs
  const kick = r.cast?.kick
  if (kick && !kick.target.dead) {
    const t = kick.target, rr = t.r * t.scale + 16 + 4 * Math.sin(w.time * 12)
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = 'rgba(80,220,255,0.9)'
    c.lineWidth = 3
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + w.time * 2
      c.beginPath(); c.arc(t.x, t.y, rr, a, a + 0.9); c.stroke()
    }
    c.restore()
  }
  // pull wells
  for (const q of r.pulls) {
    c.save()
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const ph = ((w.time * 1.4 + i / 3) % 1)
      c.strokeStyle = `rgba(120,230,255,${0.5 * ph})`
      c.lineWidth = 2
      c.beginPath(); c.arc(q.x, q.y, 30 + (1 - ph) * 220, 0, TAU); c.stroke()
    }
    c.restore()
  }
}
