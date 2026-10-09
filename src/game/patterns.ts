import type { World } from './world'
import type { Enemy } from './entities'
import { BulletKind } from './entities'
import { TAU } from '../core/math'
import { PH, PW } from './consts'
import { sfxAt } from './fx'
import { P, C } from '../render/particles'
import { ARCADE } from './arcade'

/** Shared bullet vocabulary for enemies and bosses. */

export function onScreen(e: Enemy, margin = 0) {
  return e.y > margin && e.y < PH - margin && e.x > -10 && e.x < PW + 10
}

/** Enemies only shoot when visible and not below the player (fairness). */
export function canFire(w: World, e: Enemy) {
  return onScreen(e, 10) && e.y < w.player.y - 50 && w.player.alive && !e.hidden
}

const sfxGate = new WeakMap<World, number>()
export function enemySfx(w: World, x: number, heavy = false) {
  if (w.preview) return
  if (w.time - (sfxGate.get(w) ?? -1) < 0.05) return
  sfxGate.set(w, w.time)
  sfxAt(heavy ? 'enemy_shot_heavy' : 'enemy_shot', x, heavy ? 0.5 : 0.32)
}

function flash(w: World, x: number, y: number, big = false) {
  w.parts.spawn(P.Glow, x, y, 0, 0, 0.1, big ? 16 : 10, 3, C.magenta)
}

export function aimed(w: World, x: number, y: number, speed: number, count = 1, spread = 0.2, kind = BulletKind.Orb, dmg = 10) {
  const base = w.aim(x, y, speed)
  fan(w, x, y, base, count, spread * (count - 1), speed, kind, dmg)
}

/** Arcade turns patterns into denser danmaku; single aimed shots stay single. */
const dense = (w: World, n: number) => (w.arcade && n >= 3 ? Math.round(n * ARCADE.countMul) : n)

export function fan(w: World, x: number, y: number, ang: number, count: number, totalSpread: number, speed: number, kind = BulletKind.Orb, dmg = 10) {
  count = dense(w, count)
  for (let i = 0; i < count; i++) {
    const a = count === 1 ? ang : ang - totalSpread / 2 + (totalSpread * i) / (count - 1)
    w.fire(x, y, a, speed, kind, dmg)
  }
  flash(w, x, y, count > 3)
  enemySfx(w, x, kind === BulletKind.Big)
}

export function ring(w: World, x: number, y: number, n: number, speed: number, offset = 0, kind = BulletKind.Orb, dmg = 10) {
  n = dense(w, n)
  for (let i = 0; i < n; i++) w.fire(x, y, offset + (i / n) * TAU, speed, kind, dmg)
  flash(w, x, y, true)
  enemySfx(w, x, true)
}

/** Stream of bullets rotating around the emitter — call every frame with the enemy's state. */
export function spiral(w: World, e: Enemy, dt: number, rate: number, arms: number, spin: number, speed: number, kind = BulletKind.Orb) {
  e.s.spAng = (e.s.spAng ?? 0) + spin * dt
  e.s.spT = (e.s.spT ?? 0) - dt * w.diff.fireRate
  if (e.s.spT > 0) return
  e.s.spT += 1 / rate
  const a = dense(w, arms)
  for (let i = 0; i < a; i++) w.fire(e.x, e.y, e.s.spAng + (i / a) * TAU, speed, kind)
  enemySfx(w, e.x)
}

/** Slow shell that bursts into a ring when its fuse ends. */
export function shell(w: World, x: number, y: number, tx: number, ty: number, speed: number, burst: number, burstSpeed = 150) {
  const ang = Math.atan2(ty - y, tx - x)
  const d = Math.hypot(tx - x, ty - y)
  const b = w.fire(x, y, ang, speed, BulletKind.Bomb, 14)
  if (!b) return
  b.ttl = Math.max(0.5, d / (speed * w.diff.bulletSpeed))
  b.popOnExpire = true
  b.onPop = (ww, bb) => {
    ring(ww, bb.x, bb.y, burst, burstSpeed, Math.random() * TAU)
    ww.parts.spawn(P.Flash, bb.x, bb.y, 0, 0, 0.15, 10, 26, C.magenta)
  }
  enemySfx(w, x, true)
}

export function missile(w: World, x: number, y: number, ang: number, speed = 150, turn = 1.6, hp = 6) {
  const b = w.fire(x, y, ang, speed, BulletKind.Missile, 14)
  if (!b) return
  b.hp = hp
  b.homing = turn
  b.ttl = 5.5
  b.popOnExpire = true
  b.onPop = (ww, bb) => ww.parts.spawn(P.Glow, bb.x, bb.y, 0, 0, 0.2, 12, 3, C.orange)
  if (!w.preview) sfxAt('enemy_missile', x, 0.4)
}
