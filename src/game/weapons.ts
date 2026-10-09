import type { World } from './world'
import type { Player } from './player'
import type { Enemy } from './entities'
import { Shot } from './entities'
import { PW, PH } from './consts'
import { angleDiff, clamp, rand, TAU } from '../core/math'
import { P, C } from '../render/particles'
import { explode, muzzle, sparks } from './fx'
import { audio, type SfxName } from '../audio/audio'
import { modShot, fireRateMul } from './perks'

/** Behaviour tags interpreted on hit / expiry. */
export const enum ShotKind { Normal, Bloom, Mine, Shatter, Chorus, Lantern, BloomShard, Flame }

const UP = -Math.PI / 2
const DEG = Math.PI / 180

interface ShotOpts {
  r?: number; pierce?: number; ttl?: number; homing?: number; splash?: number; splashDmg?: number
  kind?: ShotKind; kindData?: number; spin?: number; scale?: number; ricochet?: number; count?: boolean; trail?: number
}

export function shoot(w: World, x: number, y: number, ang: number, speed: number, dmg: number, sprite: string, o: ShotOpts = {}): Shot | null {
  const s = w.shots.spawn()
  if (!s) return null
  s.reset()
  s.x = x; s.y = y
  s.vx = Math.cos(ang) * speed; s.vy = Math.sin(ang) * speed
  s.speed = speed
  s.dmg = dmg
  s.sprite = sprite
  s.rot = ang + Math.PI / 2
  s.r = o.r ?? 4
  s.pierce = o.pierce ?? 0
  s.ttl = o.ttl ?? 1.4
  s.homing = o.homing ?? 0
  s.splash = o.splash ?? 0
  s.splashDmg = o.splashDmg ?? 0
  s.kind = o.kind ?? ShotKind.Normal
  s.kindData = o.kindData ?? 0
  s.spin = o.spin ?? 0
  s.scale = o.scale ?? 1
  s.ricochet = o.ricochet ?? 0
  s.trail = o.trail ?? 0
  s.waveBaseX = x
  if (w.arcade && o.count !== false) modShot(w, s)
  if (o.count !== false && !w.preview) w.stats.shotsFired++
  else s.counted = true // uncounted shots (shrapnel, pods' extras) must not count as hits either
  return s
}

// ───────────────────────── shot callbacks ─────────────────────────

export function steerShot(w: World, s: Shot, dt: number) {
  if (s.age < 0.08) return
  if (!s.target || s.target.dead || s.target.gone || s.target.hidden) {
    s.target = w.nearest(s.x, s.y - 120, 520, (e) => e.y < s.y + 60)
  }
  const sp = Math.min(s.speed * 1.9, Math.hypot(s.vx, s.vy) + 1400 * dt)
  const cur = Math.atan2(s.vy, s.vx)
  let na = cur
  if (s.target) {
    const want = Math.atan2(s.target.y - s.y, s.target.x - s.x)
    na = cur + clamp(angleDiff(cur, want), -s.homing * dt, s.homing * dt)
  } else {
    na = cur + clamp(angleDiff(cur, UP), -s.homing * 0.5 * dt, s.homing * 0.5 * dt)
  }
  s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp
  s.rot = na + Math.PI / 2
  if (Math.random() < 0.6) w.parts.spawn(P.Smoke, s.x, s.y, 0, 0, 0.35, 2, 5, C.smokeLight, 0)
}

export function onShotHit(w: World, s: Shot, e: Enemy) {
  if (s.splash > 0) {
    w.splash(s.x, s.y, s.splash, s.splashDmg, e)
    explode(w, s.x, s.y, 'tiny', false, C.orange, true)
  }
  switch (s.kind) {
    case ShotKind.Bloom: bloomBurst(w, s); s.pierce = 0; break
    case ShotKind.Chorus:
      if (s.kindData >= 1) { w.splash(e.x, e.y, 30, 8, e); w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.25, 6, 34, C.violet) }
      break
    case ShotKind.Lantern: w.parts.spawn(P.Flash, s.x, s.y, 0, 0, 0.15, 20, 30, C.gold); break
  }
  if (s.kind === ShotKind.Flame) e.s.burn = Math.max(e.s.burn ?? 0, 0.6)
}

export function onShotExpire(w: World, s: Shot) {
  switch (s.kind) {
    case ShotKind.Bloom: bloomBurst(w, s); break
    case ShotKind.Shatter:
      for (const d of [-0.5, 0.5]) shoot(w, s.x, s.y, Math.atan2(s.vy, s.vx) + d, 380, 4, 'shot_pellet', { ttl: 0.18, r: 3, count: false })
      break
    case ShotKind.BloomShard:
      w.splash(s.x, s.y, 24, 8)
      w.parts.spawn(P.Glow, s.x, s.y, 0, 0, 0.2, 14, 4, C.orange)
      break
    case ShotKind.Lantern:
      if (s.kindData >= 3) { w.splash(s.x, s.y, 70, 60); explode(w, s.x, s.y, 'medium', false, C.gold) }
      break
  }
}

function bloomBurst(w: World, s: Shot) {
  const n = s.kindData & 0xff
  const pierce = (s.kindData >> 8) & 1
  const chain = (s.kindData >> 9) & 1
  const splashR = (s.kindData >> 10) & 0xff
  w.splash(s.x, s.y, splashR, 18)
  w.parts.spawn(P.Flash, s.x, s.y, 0, 0, 0.14, 12, splashR, C.orange)
  w.parts.spawn(P.Ring, s.x, s.y, 0, 0, 0.22, 6, splashR, C.gold)
  const off = Math.random() * TAU
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU
    shoot(w, s.x, s.y, a, 380, 7, 'shot_shard', { ttl: 0.32, r: 3, pierce, count: false, kind: chain ? ShotKind.BloomShard : ShotKind.Normal })
  }
  if (!w.preview) audio.sfx('shot_bloom', { vol: 0.25, pitch: 1.4 })
}

// ───────────────────────── front guns ─────────────────────────

export abstract class Gun {
  cd = 0
  abstract readonly sfx: SfxName
  sfxVol = 0.35
  /** Damage multiplier normalising guns: a new gun at level 1 should beat the starter at the level players own by then. */
  mult = 1
  constructor(public level: number, protected p: Player, protected w: World) {}
  abstract interval(): number
  abstract cost(): number
  abstract volley(x: number, y: number, power: number): void
  stop?(): void

  protected mirrors() { return this.p.pods.filter((q) => q.id === 'mirror') as MirrorPod[] }

  update(dt: number, firing: boolean) {
    const rate = (this.p.overclock > 0 ? 2 : 1) * fireRateMul(this.w)
    if (!firing) { this.cd = Math.max(0, this.cd - dt * rate); return }
    this.cd -= dt * rate
    let guard = 0
    while (this.cd <= 0 && guard++ < 3) {
      const mirrors = this.mirrors()
      const cost = this.cost() * (1 + 0.3 * mirrors.length)
      if (!this.p.useEnergy(cost)) { this.cd = 0.04; break }
      this.volley(this.p.x, this.p.y - 18, this.mult)
      for (const m of mirrors) this.volley(m.x, m.y - 8, m.echo * this.mult)
      this.cd += this.interval()
      if (!this.w.preview) audio.sfx(this.sfx, { vol: this.sfxVol, pan: (this.p.x / PW) * 2 - 1, pitch: rand(0.95, 1.05) })
    }
  }
}

class Pulse extends Gun {
  readonly sfx = 'shot_pulse' as const
  interval() { return this.level >= 7 ? 1 / 11 : 1 / 9 }
  cost() { return [2, 3, 4, 5, 6, 7, 7, 9][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level, w = this.w
    // arcade focus: the whole battery tightens into a concentrated stream and hits harder
    const f = w.arcade && this.p.focus ? 0.3 : 1
    const fd = f < 1 ? 1.3 : 1
    const b = (dx: number, deg: number, dmg: number, heavy = false, pierce = 0) =>
      shoot(w, x + dx * f, y, UP + deg * DEG * f * 0.6, 980, dmg * pw * fd, heavy ? 'shot_pulse_heavy' : 'shot_pulse', { r: heavy ? 5 : 4, pierce })
    const allPierce = L >= 7 ? 1 : 0
    if (L === 1) b(0, 0, 7)
    else if (L === 2) { b(-6, 0, 6); b(6, 0, 6) }
    else if (L === 3) { b(0, 0, 6); b(-10, 0, 6); b(10, 0, 6) }
    else if (L === 4) { b(0, 0, 6); b(-10, 0, 6); b(10, 0, 6); b(-8, -7, 5); b(8, 7, 5) }
    else {
      if (L === 8) {
        for (const dx of [-5, 5]) shoot(w, x + dx, y - 4, UP, 1050, 12 * pw, 'shot_lance', { r: 6, pierce: 3, splash: 22, splashDmg: 10 * pw })
      } else { b(-5, 0, 9, true, 1); b(5, 0, 9, true, 1) }
      b(-14, 0, L >= 6 ? 7 : 6, false, allPierce); b(14, 0, L >= 6 ? 7 : 6, false, allPierce)
      if (L >= 6) { b(-24, 0, 6, false, allPierce); b(24, 0, 6, false, allPierce) }
      const dg = L >= 6 ? 12 : 8
      b(-10, -dg, 6, false, allPierce); b(10, dg, 6, false, allPierce)
      if (L >= 7) { b(-12, -25, 6, false, 1); b(12, 25, 6, false, 1) }
    }
    muzzle(w, x, y, C.yellow, 6 + L)
  }
}

class Hail extends Gun {
  mult = 1.4
  readonly sfx = 'shot_scatter' as const
  sfxVol = 0.4
  interval() { return this.level >= 4 ? 0.22 : 0.25 }
  cost() { return [7, 8, 9, 10, 11, 13, 15, 17][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level, w = this.w
    const n = [5, 6, 7, 7, 8, 10, 10, 12][L - 1]
    // arcade focus narrows the fan into a shotgun choke
    const spread = [40, 46, 50, 50, 52, 60, 60, 64][L - 1] * DEG * (w.arcade && this.p.focus ? 0.4 : 1)
    const dmg = (L >= 3 ? 7 : 6) * pw
    const ttl = L >= 4 ? 0.48 : 0.36
    for (let i = 0; i < n; i++) {
      const a = UP - spread / 2 + (spread * i) / (n - 1) + rand(-0.03, 0.03)
      shoot(w, x, y, a, rand(760, 880), dmg, 'shot_pellet', {
        r: 4, ttl: ttl * rand(0.9, 1.05), pierce: L >= 5 ? 1 : 0, kind: L >= 8 ? ShotKind.Shatter : ShotKind.Normal,
      })
    }
    if (L >= 7) shoot(w, x, y - 4, UP, 900, 30 * pw, 'shot_slug', { r: 7, pierce: 2, ttl: 0.6 })
    muzzle(w, x, y, C.orange, 14)
    sparks(w, x, y - 6, 3, C.yellow, 200, 0.12)
  }
}

class Hornet extends Gun {
  mult = 1.7
  readonly sfx = 'shot_missile' as const
  sfxVol = 0.3
  private side = 1
  interval() { return this.level >= 8 ? 0.32 : this.level >= 4 ? 0.36 : 0.42 }
  cost() { return [7, 8, 10, 10, 13, 14, 17, 20][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level, w = this.w
    const n = [2, 3, 4, 4, 6, 6, 8, 10][L - 1]
    const dmg = (L >= 6 ? 13 : 11) * pw
    const splash = L >= 6 ? 30 : L >= 3 ? 22 : 0
    const sd = (L >= 6 ? 9 : 6) * pw
    for (let i = 0; i < n; i++) {
      this.side = -this.side
      const spreadDeg = 25 + (i >> 1) * 14
      // arcade focus launches the swarm straight ahead instead of fanning out
      const a = UP + this.side * spreadDeg * DEG * 2.2 * (w.arcade && this.p.focus ? 0.25 : 1)
      shoot(w, x + this.side * 8, y + 6, a, 260, dmg, 'shot_missile', { r: 4, homing: 7, ttl: 2.2, splash, splashDmg: sd })
    }
  }
}

class Arc extends Gun {
  mult = 2
  readonly sfx = 'shot_arc' as const
  sfxVol = 0.28
  interval() { return this.level >= 6 ? 1 / 7 : 1 / 6 }
  cost() { return [5, 6, 7, 8, 9, 10, 12, 14][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level, w = this.w
    const range = L >= 6 ? 330 : L >= 3 ? 265 : 230
    const chains = L >= 8 ? 5 : L >= 5 ? 3 : L >= 2 ? 2 : 1
    const prim = L >= 7 ? 3 : L >= 4 ? 2 : 1
    const dmg = [10, 10, 12, 12, 13, 14, 15, 17][L - 1] * pw
    const hit = new Set<number>()
    const cands = w.enemies.filter((e) => !e.dead && !e.hidden && !e.s.civilian && !e.s.cloak && e.armor > 0 && !w.isShielded(e) && e.y > -10 && e.y < y + 50 && (e.x - x) ** 2 + (e.y - y) ** 2 < range * range)
    cands.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2))
    let fired = 0
    // Primaries prefer distinct targets but stack on the nearest when there are few (boss fights).
    const order: Enemy[] = []
    for (const e of cands) if (order.length < prim) order.push(e)
    for (let k = 0; order.length && order.length < prim && k < prim; k++) order.push(order[k % order.length])
    for (const first of order) {
      if (fired >= prim) break
      hit.delete(first.id)
      fired++
      let fx = x, fy = y, cur: Enemy | null = first
      for (let c = 0; c <= chains && cur; c++) {
        hit.add(cur.id)
        this.bolt(fx, fy, cur.x, cur.y, c === 0 ? 2.4 : 1.6)
        w.damage(cur, dmg * (c === 0 ? 1 : 0.8), cur.x, cur.y)
        if (L >= 8) cur.cd += 0.12
        fx = cur.x; fy = cur.y
        const from: Enemy = cur
        cur = w.nearest(fx, fy, 125, (e) => !hit.has(e.id) && e !== from)
      }
    }
    if (fired === 0) {
      const tx = x + rand(-30, 30), ty = y - rand(70, 110)
      this.bolt(x, y, tx, ty, 1.2)
    } else if (!w.preview) w.stats.shotsHit++
    if (!w.preview) w.stats.shotsFired++
    muzzle(w, x, y, C.cyan, 10)
  }
  private bolt(x0: number, y0: number, x1: number, y1: number, width: number) {
    const pts: number[] = [x0, y0]
    const segs = Math.max(3, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 18))
    for (let i = 1; i < segs; i++) {
      const t = i / segs
      pts.push(x0 + (x1 - x0) * t + rand(-9, 9), y0 + (y1 - y0) * t + rand(-9, 9))
    }
    pts.push(x1, y1)
    this.w.line(pts, '#e8fdff', '#39c8ff', width, 0.09)
    this.w.parts.spawn(P.Glow, x1, y1, 0, 0, 0.12, 12, 4, C.cyan)
  }
}

class Bloom extends Gun {
  mult = 1.7
  readonly sfx = 'shot_bloom' as const
  sfxVol = 0.45
  interval() { return this.level >= 7 ? 0.38 : 0.45 }
  cost() { return [9, 10, 13, 14, 15, 19, 21, 24][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level
    const shards = [6, 8, 8, 10, 10, 10, 12, 12][L - 1]
    const splashR = L >= 4 ? 52 : 40
    const data = shards | ((L >= 5 ? 1 : 0) << 8) | ((L >= 8 ? 1 : 0) << 9) | (splashR << 10)
    const angs = L >= 6 ? [0, -9, 9] : L >= 3 ? [-7, 7] : [0]
    for (const d of angs) {
      shoot(this.w, x, y, UP + d * DEG, 440, 14 * pw, 'shot_bloom', { r: 6, ttl: 0.8 + rand(-0.04, 0.04), kind: ShotKind.Bloom, kindData: data, spin: 8 })
    }
    muzzle(this.w, x, y, C.orange, 14)
  }
}

class Helix extends Gun {
  mult = 2
  readonly sfx = 'shot_helix' as const
  sfxVol = 0.25
  private phase = 0
  interval() { return this.level >= 6 ? 0.12 : 0.14 }
  cost() { return [4, 5, 6, 7, 9, 10, 11, 13][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level, w = this.w
    const dmg = (L >= 6 ? 8 : L >= 2 ? 7 : 6) * pw
    const pierce = L >= 7 ? 99 : L >= 4 ? 3 : 2
    const amp1 = L >= 2 ? 24 : 16
    const strand = (amp: number, ph: number, freq: number) => {
      const s = shoot(w, x, y, UP, 640, dmg, 'shot_helix_seg', { r: 5, pierce, ttl: 1.3, scale: 0.8 })
      if (s) { s.wave = amp; s.waveFreq = freq; s.kindData = ph + this.phase }
    }
    strand(amp1, 0, 13); strand(amp1, Math.PI, 13)
    if (L >= 3) shoot(w, x, y, UP, 700, dmg, 'shot_helix_seg', { r: 5, pierce, ttl: 1.3, scale: 0.8 })
    if (L >= 5) {
      const amp2 = L >= 8 ? 82 : 46
      strand(amp2, Math.PI / 2, 7); strand(amp2, -Math.PI / 2, 7)
      if (L >= 8) { strand(amp2 * 0.62, 0, 9); strand(amp2 * 0.62, Math.PI, 9) }
    }
    muzzle(w, x, y, C.green, 8)
  }
}

class Rail extends Gun {
  mult = 1.5
  readonly sfx = 'shot_rail' as const
  sfxVol = 0.5
  scars: { x: number; t: number; pw: number }[] = []
  interval() { return this.level >= 6 ? 0.38 : this.level >= 3 ? 0.45 : 0.55 }
  cost() { return [18, 20, 22, 30, 32, 34, 44, 48][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level
    const dmg = (L >= 8 ? 95 : L >= 5 ? 85 : L >= 2 ? 70 : 55) * pw
    const xs = L >= 7 ? [-12, 0, 12] : L >= 4 ? [-9, 9] : [0]
    let any = false
    for (const dx of xs) any = this.rail(x + dx, y, dmg, L) || any
    this.w.addShake(1.5)
    if (!this.w.preview) { this.w.stats.shotsFired++; if (any) this.w.stats.shotsHit++ }
  }
  private rail(x: number, y: number, dmg: number, L: number): boolean {
    const w = this.w
    let any = false
    for (const e of w.enemies) {
      if (e.dead || e.hidden || e.y > y || e.y < -e.r) continue
      if (Math.abs(e.x - x) < e.r + 4) {
        w.damage(e, dmg, x, e.y)
        any = true
        if (L >= 5) { w.splash(x, e.y, 34, 20, e); w.parts.spawn(P.Ring, x, e.y, 0, 0, 0.2, 4, 36, C.cyan) }
      }
    }
    w.line([x, y, x, -20], '#e8fbff', '#1f7fd6', 4.2, 0.2)
    w.parts.spawn(P.Flash, x, y, 0, 0, 0.1, 14, 22, C.cyan)
    for (let i = 0; i < 8; i++) w.parts.spawn(P.Spark, x, y - rand(0, PH), rand(-60, 60), rand(-30, 30), 0.2, 1.2, 0.5, C.cyan)
    if (L >= 8) this.scars.push({ x, t: 0.4, pw: dmg / 95 })
    return any
  }
  update(dt: number, firing: boolean) {
    super.update(dt, firing)
    for (let i = this.scars.length - 1; i >= 0; i--) {
      const s = this.scars[i]
      s.t -= dt
      if (s.t <= 0) { this.scars.splice(i, 1); continue }
      for (const e of this.w.enemies) if (!e.dead && e.y < this.p.y && Math.abs(e.x - s.x) < e.r + 3) this.w.damage(e, 70 * s.pw * dt, s.x, e.y, true)
      if (Math.random() < 0.5) this.w.line([s.x, rand(0, this.p.y), s.x + rand(-3, 3), rand(0, this.p.y)], '#bff6ff', '#2aa9ff', 1, 0.05)
    }
  }
}

class Chorus extends Gun {
  mult = 2.4
  readonly sfx = 'shot_helix' as const
  sfxVol = 0.3
  interval() { return this.level >= 6 ? 0.32 : 0.4 }
  cost() { return [8, 9, 11, 12, 15, 16, 18, 22][this.level - 1] }
  volley(x: number, y: number, pw: number) {
    const L = this.level
    const angs = L >= 8 ? [-24, -12, 0, 12, 24] : L >= 5 ? [-14, 0, 14] : L >= 3 ? [-10, 10] : [0]
    const maxR = L >= 7 ? 70 : L >= 2 ? 50 : 40
    for (const d of angs) {
      const s = shoot(this.w, x, y, UP + d * DEG, 380, 16 * pw, 'shot_chorus', { r: 8, pierce: 99, ttl: 1.3, kind: ShotKind.Chorus, kindData: L >= 4 ? 1 : 0 })
      if (s) s.spin = maxR // reused as max radius; grown in onUpdate hook below
    }
    muzzle(this.w, x, y, C.violet, 12)
  }
  update(dt: number, firing: boolean) {
    super.update(dt, firing)
    for (const s of this.w.shots.items) {
      if (!s.active || s.kind !== ShotKind.Chorus) continue
      const maxR = s.spin
      s.r = 8 + (maxR - 8) * Math.min(1, s.age / 1.0)
      s.scale = s.r / 8
      s.rot = 0
      if (s.lastHit.length > 6) s.lastHit.shift()
    }
  }
}

/** Continuous beam. Drains energy per second instead of per shot. */
class Sunline extends Gun {
  mult = 2
  readonly sfx = 'shot_pulse' as const
  private loop: ReturnType<typeof audio.loop> | null = null
  on = false
  flicker = 0
  beams: { x: number; y: number; ang: number; len: number; width: number }[] = []
  interval() { return 1 }
  cost() { return 0 }
  volley() {}
  drain() { return [22, 26, 32, 38, 50, 58, 64, 75][this.level - 1] }
  update(dt: number, firing: boolean) {
    const L = this.level, p = this.p, w = this.w
    this.beams.length = 0
    const mirrors = this.mirrors()
    const need = this.drain() * (1 + 0.3 * mirrors.length) * dt
    const can = firing && p.useEnergy(need)
    if (!can) {
      this.on = false
      if (this.loop) { this.loop.stop(); this.loop = null }
      return
    }
    this.on = true
    if (!this.loop && !w.preview) this.loop = audio.loop('beam', { vol: 0.35, pitch: 0.8 + L * 0.06 })
    const width = L >= 8 ? 20 : L >= 6 ? 14 : L >= 3 ? 9 : 6
    const dps = [80, 100, 125, 150, 150, 190, 190, 250][L - 1] * this.mult
    const pierce = L >= 5
    this.fire(p.x, p.y - 20, UP, width, dps, pierce, dt, L >= 8)
    if (L >= 5) {
      const subD = (L >= 7 ? 60 : 45) * this.mult
      const ang = L >= 7 ? 8 * DEG : 0
      this.fire(p.x - 20, p.y - 10, UP - ang, 5, subD, true, dt, false)
      this.fire(p.x + 20, p.y - 10, UP + ang, 5, subD, true, dt, false)
    }
    for (const m of mirrors) this.fire(m.x, m.y - 8, UP, Math.max(4, width * 0.5), dps * m.echo, pierce, dt, false)
  }
  private fire(x: number, y: number, ang: number, width: number, dps: number, pierce: boolean, dt: number, burn: boolean) {
    const w = this.w
    const dx = Math.cos(ang), dy = Math.sin(ang)
    let len = y + 30
    let block: Enemy | null = null
    const hits: Enemy[] = []
    for (const e of w.enemies) {
      if (e.dead || e.hidden) continue
      const ex = e.x - x, ey = e.y - y
      const t = ex * dx + ey * dy
      if (t < 0 || t > len + e.r) continue
      const perp = Math.abs(ex * dy - ey * dx)
      if (perp > e.r + width / 2) continue
      if (e.y < -e.r) continue
      if (pierce) hits.push(e)
      else if (t - e.r * 0.5 < len) { len = Math.max(0, t - e.r * 0.5); block = e }
    }
    if (!pierce && block) hits.push(block)
    for (const e of hits) {
      w.damage(e, dps * dt, e.x + rand(-4, 4), e.y + e.r * 0.5, true)
      if (burn) e.s.burn = 1.5
      if (Math.random() < 0.35) w.parts.spawn(P.Spark, e.x + rand(-e.r, e.r) * 0.4, e.y + e.r * 0.4, rand(-200, 200), rand(40, 200), 0.2, 1.5, 0.5, C.yellow)
    }
    this.beams.push({ x, y, ang, len, width })
  }
  stop() { this.loop?.stop(); this.loop = null }
}

const FRONT: Record<string, new (l: number, p: Player, w: World) => Gun> = {
  pulse: Pulse, hail: Hail, hornet: Hornet, arc: Arc, bloom: Bloom, helix: Helix, sunline: Sunline, rail: Rail, chorus: Chorus,
}

export function createFront(id: string, level: number, p: Player, w: World): Gun {
  const G = FRONT[id]
  if (!G) throw new Error(`Unknown front weapon ${id}`)
  return new G(level, p, w)
}
export { Sunline }

// ───────────────────────── rear guns ─────────────────────────

export abstract class RearGun {
  cd = 0
  constructor(public level: number, protected p: Player, protected w: World) {}
  abstract interval(): number
  abstract cost(): number
  abstract volley(): void
  /** Auto weapons fire without the trigger. */
  auto = false
  update(dt: number, firing: boolean) {
    const rate = this.p.overclock > 0 ? 2 : 1
    this.cd -= dt * rate
    if (!firing && !this.auto) { this.cd = Math.max(this.cd, 0); return }
    if (this.cd > 0) return
    if (!this.p.useEnergy(this.cost())) { this.cd = 0.05; return }
    this.volley()
    this.cd += this.interval()
  }
}

const DOWN = Math.PI / 2

class Stinger extends RearGun {
  interval() { return 0.14 }
  cost() { return [2, 3, 4, 4, 6][this.level - 1] }
  volley() {
    const L = this.level, { x, y } = this.p, w = this.w
    const pierce = L >= 4 ? 1 : 0
    const b = (dx: number, deg: number) => shoot(w, x + dx, y + 16, DOWN + deg * DEG, 820, 6, 'shot_pulse', { r: 4, pierce, count: false })
    if (L === 1) b(0, 0)
    else { b(-5, 0); b(5, 0) }
    if (L >= 5) b(0, 0)
    if (L >= 3) { b(-6, 20); b(6, -20) }
    if (L >= 5) { b(-8, 38); b(8, -38) }
  }
}

class Flank extends RearGun {
  interval() { return this.level >= 4 ? 0.22 : 0.3 }
  cost() { return [3, 4, 6, 6, 9][this.level - 1] }
  volley() {
    const L = this.level, { x, y } = this.p, w = this.w
    const pierce = L >= 5 ? 1 : 0
    for (const side of [-1, 1]) {
      const base = side < 0 ? Math.PI : 0
      const angs = L >= 5 ? [0, -22, 18, -45] : L >= 3 ? [0, -25, 20] : L >= 2 ? [0, -30] : [0]
      for (const d of angs) shoot(w, x + side * 14, y, base + side * d * DEG, 760, 7, 'shot_pulse', { r: 4, pierce, count: false })
    }
  }
}

class Mines extends RearGun {
  interval() { return this.level >= 4 ? 0.65 : 0.95 }
  cost() { return [8, 9, 12, 12, 14][this.level - 1] }
  volley() {
    const L = this.level
    const xs = L >= 3 ? [-14, 14] : [0]
    for (const dx of xs) {
      const s = shoot(this.w, this.p.x + dx, this.p.y + 18, DOWN, 40, 0, 'shot_mine', { r: 34, ttl: 6, kind: ShotKind.Mine, kindData: L, count: false })
      if (s) s.spin = 2
    }
    if (!this.w.preview) audio.sfx('shot_mine', { vol: 0.35 })
  }
  update(dt: number, firing: boolean) {
    super.update(dt, firing)
    const w = this.w
    for (const s of w.shots.items) {
      if (!s.active || s.kind !== ShotKind.Mine) continue
      s.vy = w.scroll * 0.4 + 20
      s.vx *= 0.96
      const trig = w.nearest(s.x, s.y, 36)
      if (trig || s.age > 5.8) {
        const L = s.kindData
        const r = L >= 2 ? 70 : 60, dmg = L >= 2 ? 60 : 45
        w.splash(s.x, s.y, r, dmg)
        explode(w, s.x, s.y, 'small', false, C.orange)
        if (L >= 5) for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + 0.4, cx = s.x + Math.cos(a) * 50, cy = s.y + Math.sin(a) * 50
          w.after(0.12 + i * 0.05, () => { w.splash(cx, cy, 36, 25); explode(w, cx, cy, 'tiny', false, C.orange, true) })
        }
        w.shots.kill(s)
      }
    }
  }
}

class Burner extends RearGun {
  interval() { return 0.04 }
  cost() { return 1.1 }
  volley() {
    const L = this.level, { x, y } = this.p, w = this.w
    const ttl = L >= 5 ? 0.46 : L >= 2 ? 0.34 : 0.24
    const dmg = L >= 5 ? 5 : L >= 4 ? 4 : 3
    const spread = L >= 5 ? 22 : 15
    shoot(w, x + rand(-3, 3), y + 20, DOWN + rand(-spread, spread) * DEG, rand(380, 460), dmg, 'shot_flame', { r: 8, pierce: 99, ttl, kind: ShotKind.Flame, count: false, spin: rand(-6, 6) })
    if (L >= 3 && Math.random() < 0.5) {
      const side = Math.random() < 0.5 ? -1 : 1
      shoot(w, x + side * 14, y + 4, (side < 0 ? Math.PI : 0) + rand(-10, 10) * DEG, 360, dmg, 'shot_flame', { r: 7, pierce: 99, ttl: ttl * 0.6, kind: ShotKind.Flame, count: false })
    }
  }
}

class Halo extends RearGun {
  auto = true
  pulses: { r: number; max: number; hit: Set<number> }[] = []
  interval() { return this.level >= 3 ? 1.0 : 1.3 }
  cost() { return 14 }
  volley() {
    this.pulses.push({ r: 20, max: this.level >= 2 ? 140 : 110, hit: new Set() })
    if (this.level >= 5) this.w.after(0.2, () => this.pulses.push({ r: 20, max: 140, hit: new Set() }))
  }
  update(dt: number, firing: boolean) {
    super.update(dt, firing)
    const { x, y } = this.p, w = this.w
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const q = this.pulses[i]
      q.r += 420 * dt
      if (q.r >= q.max) { this.pulses.splice(i, 1); continue }
      for (const e of w.enemies) {
        if (e.dead || q.hit.has(e.id)) continue
        const d = Math.hypot(e.x - x, e.y - y)
        if (Math.abs(d - q.r) < e.r + 8) { q.hit.add(e.id); w.damage(e, 30, e.x, e.y) }
      }
      if (this.level >= 4) for (const b of w.bullets.items) {
        if (!b.active || b.r > 5) continue
        const d = Math.hypot(b.x - x, b.y - y)
        if (Math.abs(d - q.r) < 8) { w.bullets.kill(b); w.parts.spawn(P.Glow, b.x, b.y, 0, 0, 0.2, 7, 2, C.violet) }
      }
    }
  }
}

const REAR: Record<string, new (l: number, p: Player, w: World) => RearGun> = { stinger: Stinger, flank: Flank, mines: Mines, burner: Burner, halo: Halo }
export function createRear(id: string, level: number, p: Player, w: World): RearGun {
  const G = REAR[id]
  if (!G) throw new Error(`Unknown rear weapon ${id}`)
  return new G(level, p, w)
}
export { Halo }

// ───────────────────────── pods ─────────────────────────

export abstract class Pod {
  x: number
  y: number
  cd = 0
  abstract readonly id: string
  constructor(public level: number, public side: -1 | 1, protected p: Player, protected w: World) {
    this.x = p.x + side * 34
    this.y = p.y + 10
  }
  follow(dt: number) {
    const tight = this.w.arcade && this.p.focus
    const tx = this.p.x + this.side * (tight ? 15 : 34), ty = this.p.y + (tight ? -16 : 8)
    const k = 1 - Math.exp(-dt * 14)
    this.x += (tx - this.x) * k
    this.y += (ty - this.y) * k
  }
  update(dt: number, _firing: boolean) { this.follow(dt) }
}

class Wasp extends Pod {
  readonly id = 'wasp'
  update(dt: number, firing: boolean) {
    this.follow(dt)
    this.cd -= dt * (this.p.overclock > 0 ? 2 : 1)
    if (!firing || this.cd > 0) return
    if (!this.p.useEnergy(1)) return
    const L = this.level
    const dmg = L >= 2 ? 5 : 4
    if (L >= 3) { shoot(this.w, this.x - 3, this.y - 8, UP, 900, dmg, 'shot_drone', { r: 3 }); shoot(this.w, this.x + 3, this.y - 8, UP, 900, dmg, 'shot_drone', { r: 3 }) }
    else shoot(this.w, this.x, this.y - 8, UP, 900, dmg, 'shot_drone', { r: 3 })
    this.cd = L >= 2 ? 0.12 : 0.16
    if (!this.w.preview && Math.random() < 0.5) audio.sfx('shot_drone', { vol: 0.15 })
  }
}

class Viper extends Pod {
  readonly id = 'viper'
  update(dt: number, firing: boolean) {
    this.follow(dt)
    this.cd -= dt * (this.p.overclock > 0 ? 2 : 1)
    if (!firing || this.cd > 0) return
    if (!this.p.useEnergy(6)) return
    const n = this.level >= 3 ? 2 : 1
    for (let i = 0; i < n; i++) shoot(this.w, this.x, this.y - 6, UP + this.side * (0.5 + i * 0.4), 240, 22, 'shot_viper', { r: 5, homing: 6, ttl: 2.4, splash: 20, splashDmg: 10 })
    this.cd = this.level >= 2 ? 0.8 : 1.1
    if (!this.w.preview) audio.sfx('shot_missile', { vol: 0.3, pitch: 0.8 })
  }
}

class Aegis extends Pod {
  readonly id = 'aegis'
  ang: number
  pulseCd = 0
  constructor(level: number, side: -1 | 1, p: Player, w: World) {
    super(level, side, p, w)
    this.ang = side < 0 ? Math.PI : 0
  }
  get r() { return this.level >= 2 ? 12 : 9 }
  update(dt: number) {
    this.ang += dt * (this.level >= 2 ? 4.2 : 3)
    this.x = this.p.x + Math.cos(this.ang) * 46
    this.y = this.p.y + Math.sin(this.ang) * 46
    if (this.pulseCd > 0) this.pulseCd -= dt
    const me = this
    this.p.blockers.push({
      x: this.x, y: this.y, r: this.r,
      onBlock() {
        if (me.level >= 3 && me.pulseCd <= 0) {
          me.pulseCd = 0.3
          me.w.splash(me.x, me.y, 40, 20)
          me.w.parts.spawn(P.Ring, me.x, me.y, 0, 0, 0.2, 6, 40, C.cyan)
        }
      },
    })
    const dps = this.level >= 2 ? 160 : 120
    for (const e of this.w.enemies) {
      if (e.dead || e.hidden) continue
      if ((e.x - this.x) ** 2 + (e.y - this.y) ** 2 < (e.r + this.r) ** 2) this.w.damage(e, dps * dt, this.x, this.y, true)
    }
  }
}

class Spark extends Pod {
  readonly id = 'spark'
  update(dt: number) {
    this.follow(dt)
    this.cd -= dt
    if (this.cd > 0) return
    const range = this.level >= 2 ? 175 : 135
    const t = this.w.nearest(this.x, this.y, range)
    if (!t) { this.cd = 0.1; return }
    if (!this.p.useEnergy(2)) return
    this.cd = 0.3
    const dmg = this.level >= 2 ? 12 : 9
    zap(this.w, this.x, this.y, t.x, t.y)
    this.w.damage(t, dmg, t.x, t.y)
    if (this.level >= 3) {
      const t2 = this.w.nearest(t.x, t.y, 120, (e) => e !== t)
      if (t2) { zap(this.w, t.x, t.y, t2.x, t2.y); this.w.damage(t2, dmg * 0.8, t2.x, t2.y) }
    }
    if (!this.w.preview && Math.random() < 0.5) audio.sfx('shot_arc', { vol: 0.12, pitch: 1.5 })
  }
}

function zap(w: World, x0: number, y0: number, x1: number, y1: number) {
  const pts = [x0, y0]
  for (let i = 1; i < 4; i++) { const t = i / 4; pts.push(x0 + (x1 - x0) * t + rand(-6, 6), y0 + (y1 - y0) * t + rand(-6, 6)) }
  pts.push(x1, y1)
  w.line(pts, '#f2fff0', '#7dff8a', 1.2, 0.08)
}

class Lantern extends Pod {
  readonly id = 'lantern'
  charge = 0
  get need() { return 1.6 }
  update(dt: number, firing: boolean) {
    this.follow(dt)
    if (firing) this.charge = Math.min(this.need, this.charge + dt * (this.p.overclock > 0 ? 2 : 1))
    if (this.charge >= this.need && this.p.useEnergy(22)) {
      this.charge = 0
      const L = this.level
      const dmg = L >= 3 ? 170 : L >= 2 ? 130 : 90
      shoot(this.w, this.x, this.y - 10, UP, 520, dmg, 'shot_lantern', { r: 12, pierce: 99, ttl: 1.4, kind: ShotKind.Lantern, kindData: L })
      this.w.parts.spawn(P.Flash, this.x, this.y - 10, 0, 0, 0.15, 16, 30, C.gold)
      if (!this.w.preview) audio.sfx('shot_rail', { vol: 0.3, pitch: 0.7 })
    }
  }
}

export class MirrorPod extends Pod {
  readonly id = 'mirror'
  get echo() { return [0.35, 0.45, 0.55][this.level - 1] }
}

const PODS: Record<string, new (l: number, s: -1 | 1, p: Player, w: World) => Pod> = {
  wasp: Wasp, viper: Viper, aegis: Aegis, spark: Spark, lantern: Lantern, mirror: MirrorPod,
}
export function createPod(id: string, level: number, side: -1 | 1, p: Player, w: World): Pod {
  const G = PODS[id]
  if (!G) throw new Error(`Unknown pod ${id}`)
  return new G(level, side, p, w)
}
export { Aegis, Lantern }

/** Damage-over-time from burning (Sunline L8, Backburner). Called by the world each frame. */
export function tickBurn(w: World, e: Enemy, dt: number) {
  const b = e.s.burn
  if (!b || b <= 0) return
  e.s.burn = b - dt
  w.damage(e, 30 * dt, e.x, e.y, true)
  if (Math.random() < 0.3) w.parts.spawn(P.Fire, e.x + rand(-e.r, e.r) * 0.6, e.y + rand(-e.r, e.r) * 0.6, 0, -20, 0.4, 4, 9, 0, 1)
}
