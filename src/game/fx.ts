import type { World } from './world'
import { P, C } from '../render/particles'
import { rand, TAU } from '../core/math'
import type { ExplosionSize } from './enemy-def'
import { audio } from '../audio/audio'
import { PW } from './consts'

const pan = (x: number) => (x / PW) * 2 - 1

export function sparks(w: World, x: number, y: number, n: number, col: number, speed = 260, life = 0.35, ground = false) {
  const p = w.parts
  n = Math.ceil(n * p.density)
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.65)
    p.spawn(P.Spark, x, y, Math.cos(a) * s, Math.sin(a) * s, life * rand(0.6, 1.2), rand(1, 2.2), 0.5, col, 4, ground)
  }
}

export function hitSpark(w: World, x: number, y: number, col: number = C.yellow) {
  const p = w.parts
  p.spawn(P.Glow, x, y, 0, 0, 0.09, 9, 3, col)
  for (let i = 0; i < 2; i++) {
    const a = -Math.PI / 2 + rand(-1.2, 1.2), s = rand(120, 260)
    p.spawn(P.Spark, x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.08, 0.16), 1.2, 0.5, col, 6)
  }
}

export function muzzle(w: World, x: number, y: number, col: number = C.yellow, size = 8) {
  w.parts.spawn(P.Glow, x, y, 0, -30, 0.06, size, size * 0.4, col)
}

const SIZES: Record<ExplosionSize, { r: number; fire: number; sp: number; deb: number; smoke: number; shake: number; sfx: 'expl_small' | 'expl_medium' | 'expl_large' | 'expl_huge' | null }> = {
  tiny: { r: 10, fire: 3, sp: 5, deb: 0, smoke: 1, shake: 0, sfx: null },
  small: { r: 16, fire: 6, sp: 10, deb: 3, smoke: 3, shake: 1.5, sfx: 'expl_small' },
  medium: { r: 28, fire: 12, sp: 18, deb: 8, smoke: 6, shake: 4, sfx: 'expl_medium' },
  large: { r: 48, fire: 22, sp: 30, deb: 16, smoke: 12, shake: 9, sfx: 'expl_large' },
  huge: { r: 90, fire: 40, sp: 60, deb: 30, smoke: 24, shake: 18, sfx: 'expl_huge' },
}

/**
 * Layered explosion: flash → fireball → sparks → debris → smoke → shockwave,
 * plus camera and sound. `ground` explosions stick to the scrolling terrain.
 */
export function explode(w: World, x: number, y: number, size: ExplosionSize, ground = false, tint: number = C.orange, silent = false) {
  const s = SIZES[size]
  const p = w.parts
  const d = p.density
  p.spawn(P.Flash, x, y, 0, 0, size === 'huge' ? 0.5 : 0.18, s.r * 2.2, s.r * 3, C.white, 0, ground)
  for (let i = 0; i < Math.ceil(s.fire * d); i++) {
    const a = Math.random() * TAU, rr = Math.random() * s.r * 0.6, sp = rand(20, 90) * (s.r / 20)
    p.spawn(P.Fire, x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * sp, Math.sin(a) * sp,
      rand(0.35, 0.7) * (0.8 + s.r / 80), s.r * rand(0.35, 0.6), s.r * rand(0.7, 1.1), 0, 3, ground)
  }
  for (let i = 0; i < Math.ceil(s.sp * d); i++) {
    const a = Math.random() * TAU, sp = rand(150, 520) * (0.6 + s.r / 60)
    p.spawn(P.Spark, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.25, 0.6), rand(1.2, 2.4), 0.5, i % 3 === 0 ? C.white : tint, 3.5, ground)
  }
  for (let i = 0; i < Math.ceil(s.deb * d); i++) {
    const a = Math.random() * TAU, sp = rand(60, 260) * (0.6 + s.r / 80)
    p.spawn(P.Debris, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.5, 1.2), rand(2, 5) * (0.7 + s.r / 60), 1, C.smokeDark, 2.2, ground)
  }
  for (let i = 0; i < Math.ceil(s.smoke * d); i++) {
    const a = Math.random() * TAU, rr = Math.random() * s.r * 0.5
    p.spawn(P.Smoke, x + Math.cos(a) * rr, y + Math.sin(a) * rr, Math.cos(a) * 25, Math.sin(a) * 25 - 10,
      rand(0.8, 1.6) * (0.8 + s.r / 90), s.r * 0.4, s.r * rand(0.9, 1.4), i % 2 ? C.smokeDark : C.smokeLight, 1.5, ground)
  }
  if (size !== 'tiny') p.spawn(P.Ring, x, y, 0, 0, 0.35 + s.r / 200, s.r * 0.3, s.r * 2.2, C.gold, 0, ground)
  if (size === 'large' || size === 'huge') {
    for (let i = 0; i < 6 * d; i++) {
      const a = Math.random() * TAU, sp = rand(200, 400)
      p.spawn(P.Ember, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.6, 1.2), 3, 1, C.orange, 2.5, ground)
    }
  }
  if (ground) w.addDecal(x, y, s.r * 0.9)
  w.addShake(s.shake)
  if (!silent && !w.preview && s.sfx) audio.sfx(s.sfx, { pan: pan(x), vol: 0.9, pitch: rand(0.9, 1.1) })
}

/** Big multi-stage destruction used for large ships and bosses. */
export function chainExplosion(w: World, x: number, y: number, radius: number, count: number, duration: number, final: ExplosionSize = 'large') {
  for (let i = 0; i < count; i++) {
    const t = (i / count) * duration
    w.after(t, () => {
      const a = Math.random() * TAU, rr = Math.random() * radius
      explode(w, x + Math.cos(a) * rr, y + Math.sin(a) * rr, i % 4 === 3 ? 'medium' : 'small', false, C.orange, i % 2 === 1)
    })
  }
  w.after(duration, () => {
    explode(w, x, y, final)
    if (final === 'huge') {
      w.flashScreen = 0.8
      for (let k = 0; k < 3; k++) w.parts.spawn(P.Ring, x, y, 0, 0, 0.8 + k * 0.25, 20, 380 + k * 120, k === 1 ? C.white : C.gold)
    }
  })
}

export function shieldRipple(w: World, x: number, y: number, r: number) {
  w.parts.spawn(P.Ring, x, y, 0, 0, 0.25, r * 0.8, r * 1.3, C.cyan)
}

export function sfxAt(name: Parameters<typeof audio.sfx>[0], x: number, vol = 1, pitch = 1) {
  audio.sfx(name, { pan: pan(x), vol, pitch })
}
