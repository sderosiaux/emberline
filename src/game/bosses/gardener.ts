import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind, PickupKind } from '../entities'
import { bossDef, startBoss, partDown, alive } from './common'
import { enemySfx } from '../patterns'
import { PW, PH } from '../consts'
import { rand, TAU } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'
import { audio } from '../../audio/audio'

/**
 * THE GARDENER — not a Choir machine; something older that tends the garden.
 * It never aims. Every attack is a slow symmetric figure and the difficulty is
 * reading its shape. Each phase changes the pattern *language*:
 *   1 BLOOM   — six petals turn around it, each trailing a curling stream; the
 *               core breathes out rings that stop, then open into two.
 *   2 LATTICE — petals gone: straight lines only. Six-pointed stars that turn
 *               a step each volley, and a mirrored pair of sweeping streams.
 *   3 MURMUR  — below 40%: curving galaxy arms and a flock of songbirds.
 */

/** Boss scale for the wide field (art is painted at 1×). */
const S = 1.3
const R_PETAL = 109

bossDef({
  id: 'garden_gardener', hp: 13500, r: 57, scale: S, sprite: 'garden_core', explode: 'huge', score: 40000,
  update(e, w, dt) { gardenerUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const s = e.s
    const breathe = 1 + Math.sin(w.time * 1.3) * 0.03
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.35
    const g = ctx.createRadialGradient(e.x, e.y, 10, e.x, e.y, 220)
    g.addColorStop(0, 'rgba(255,240,200,0.6)')
    g.addColorStop(1, 'rgba(160,130,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(e.x, e.y, 220, 0, TAU); ctx.fill()
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    const ringAlpha = s.phase === 2 ? 1 : 0.8
    drawSprite(ctx, getSprite('garden_ring'), e.x, e.y, (s.ring ?? 0), S * breathe * (s.phase === 3 ? 0.85 : 1), ringAlpha)
    drawSprite(ctx, getSprite('garden_ring'), e.x, e.y, -(s.ring ?? 0) * 1.7, S * 0.72 * breathe, 0.6)
    drawSprite(ctx, getSprite('garden_core'), e.x, e.y, s.phase === 2 ? Math.round((s.ring ?? 0) * 6 / TAU) * TAU / 6 : Math.sin(w.time * 0.4) * 0.2, S * breathe, 1, e.flash)
  },
})

bossDef({
  id: 'garden_petal', hp: 1200, r: 29, scale: S, sprite: 'garden_petal', explode: 'medium', score: 3000,
  update(e, w, dt) {
    const root = e.parent!
    const a = (root.s.ring ?? 0) * 0.6 + e.s.slot * (TAU / 6)
    const r = R_PETAL + Math.sin(w.time * 1.3 + e.s.slot) * 8
    e.x = root.x + Math.cos(a) * r
    e.y = root.y + Math.sin(a) * r
    e.rot = a - Math.PI / 2
    e.s.ang = a
    if (root.s.intro) return
    // streams: petals take turns in alternating triads
    const active = Math.floor(w.time / 3) % 2 === e.s.slot % 2
    if (!active) return
    e.s.f = (e.s.f ?? 0) - dt * w.diff.fireRate
    if (e.s.f > 0) return
    e.s.f = 0.3
    const b = w.fire(e.x, e.y, a, 105, BulletKind.Ring, 10)
    if (b) { b.curve = 0.55; b.ttl = 7 }
  },
  drawBody(ctx, e) {
    // offset so the base sits toward the core and the tip points out
    const ox = Math.cos(e.s.ang ?? 0) * 18 * S, oy = Math.sin(e.s.ang ?? 0) * 18 * S
    drawSprite(ctx, getSprite('garden_petal'), e.x + ox * 0.3, e.y + oy * 0.3, e.rot, 0.9 * S, 1, e.flash)
  },
  onDeath(e, w) {
    partDown(w, e, 'medium')
    for (let i = 0; i < 16; i++) w.parts.spawn(P.Glow, e.x, e.y, rand(-160, 160), rand(-160, 160), rand(0.5, 1), 5, 1, i % 2 ? C.violet : C.gold, 2)
  },
})

function gardenerUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  s.ring = (s.ring ?? 0) + dt * (s.phase === 2 ? 0.15 : 0.35)
  if (s.intro) {
    e.y += (165 - e.y) * Math.min(1, dt * 0.6)
    if (Math.abs(e.y - 165) < 3) s.intro = 0
    return
  }
  const petals = alive(w.bossParts, 'petal')
  if (s.phase === 1 && petals.length === 0) {
    s.phase = 2
    e.armor = 1
    shift(w, e, 'you took its flowers. it does not mind. it has lines instead.')
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.4) {
    s.phase = 3
    shift(w, e, 'now it will sing. do not listen too closely.')
    summonFlock(w, e)
  }

  // movement: a slow lemniscate that widens as it wakes
  const amp = s.phase === 1 ? 105 : s.phase === 2 ? 180 : 60
  const tx = PW / 2 + Math.sin(s.time * 0.3) * amp
  const ty = 162 + Math.sin(s.time * 0.6) * (s.phase === 2 ? 25 : 12)
  e.x += (tx - e.x) * Math.min(1, dt * 0.8)
  e.y += (ty - e.y) * Math.min(1, dt * 0.8)

  // it never aims, and its mechanics don't either: fixed, symmetric places to read and use
  const raid = w.raid
  const tick = (k: string, first: number) => (s[k] = (s[k] ?? first) - dt * w.diff.fireRate * raid.rate)
  if (s.phase >= 2 && tick('offerT', 6) <= 0 && raid.ready()) {
    s.offerT = 16
    const side = (s.offerN = ((s.offerN ?? 0) + 1) % 3) - 1
    raid.begin(w, 'Offering', 0.8, (ww) => ww.raid.zone({ x: PW / 2 + side * PW * 0.3, y: PH * 0.72, r: 80, kind: 'soak', delay: 3.6, dmg: 38 }), { warn: 'stand in the light', tone: 'kick' })
  }
  if (s.phase === 3 && tick('fallT', 9) <= 0 && raid.ready()) {
    s.fallT = 14
    raid.begin(w, 'Petalfall', 1.0, (ww) => {
      const rot = (s.fallN = (s.fallN ?? 0) + 1) * (Math.PI / 6)
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * TAU
        ww.raid.zone({ x: PW / 2 + Math.cos(a) * 230, y: PH * 0.62 + Math.sin(a) * 150, r: 58, kind: 'pool', delay: 1.4, linger: 6, dmg: 30, tint: '190,150,255' })
      }
    }, { warn: 'petals fall', tone: 'kick' })
  }

  if (s.phase === 1) {
    s.bloomT = (s.bloomT ?? 2.5) - dt * w.diff.fireRate
    if (s.bloomT <= 0) { s.bloomT = 5.2; bloom(w, e.x, e.y, 18, rand(0, TAU)) }
  } else if (s.phase === 2) {
    s.starT = (s.starT ?? 1) - dt * w.diff.fireRate
    if (s.starT <= 0) {
      s.starT = 2.1
      s.starN = (s.starN ?? 0) + 1
      star(w, e.x, e.y, s.starN * (Math.PI / 18))
    }
    // mirrored sweeping streams
    s.mir = (s.mir ?? 0) + dt
    if (s.mir % 7 > 3.5) {
      s.mirF = (s.mirF ?? 0) - dt * w.diff.fireRate
      if (s.mirF <= 0) {
        s.mirF = 0.09
        const off = 0.35 + Math.abs(Math.sin(s.mir * 1.1)) * 0.9
        for (const sgn of [-1, 1]) w.fire(e.x + sgn * 52, e.y + 26, Math.PI / 2 + sgn * off, 170, BulletKind.Needle, 10)
      }
    }
  } else {
    // galaxy: four arms, alternating curl, gentle
    s.gal = (s.gal ?? 0) - dt * w.diff.fireRate
    s.galA = (s.galA ?? 0) + dt * 0.7
    const cyc = s.time % 9
    if (cyc < 5.5 && s.gal <= 0) {
      s.gal = 0.16
      for (let i = 0; i < 4; i++) {
        const a = s.galA + (i / 4) * TAU
        const b = w.fire(e.x, e.y, a, 120, BulletKind.Wave, 10)
        if (b) { b.curve = i % 2 ? 0.4 : -0.4; b.ttl = 7 }
      }
      enemySfx(w, e.x)
    }
    s.bloomT = (s.bloomT ?? 1) - dt * w.diff.fireRate
    if (cyc > 6 && s.bloomT <= 0) { s.bloomT = 3; bloom(w, e.x, e.y, 14, rand(0, TAU)) }
    s.flockT = (s.flockT ?? 12) - dt
    if (s.flockT <= 0) { s.flockT = 14; summonFlock(w, e) }
  }
}

function shift(w: World, e: Enemy, text: string) {
  if (!w.preview) audio.sfx('boss_phase')
  w.addShake(6)
  w.flashScreen = 0.3
  for (let i = 0; i < 3; i++) w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.8 + i * 0.3, 30, 300 + i * 80, i === 1 ? C.violet : C.gold)
  for (const b of w.bullets.items) if (b.active) { w.parts.spawn(P.Glow, b.x, b.y, 0, 0, 0.3, 8, 2, C.gold); w.bullets.kill(b) }
  w.emit({ type: 'radio', who: '???', text, tone: 'odd' })
}

/** Ring that slows to a stop, then each bullet opens into two curling petals. */
function bloom(w: World, x: number, y: number, n: number, off: number) {
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU
    const b = w.fire(x, y, a, 120, BulletKind.Orb, 10)
    if (!b) continue
    b.ax = -Math.cos(a) * 95; b.ay = -Math.sin(a) * 95
    b.ttl = 1.15
    b.popOnExpire = true
    b.onPop = (ww, bb) => {
      for (const sgn of [-1, 1]) {
        const nb = ww.fire(bb.x, bb.y, a + sgn * 0.5, 80, BulletKind.Ring, 10)
        if (nb) { nb.curve = sgn * 0.45; nb.ax = Math.cos(a) * 30; nb.ay = Math.sin(a) * 30; nb.maxSpeed = 150; nb.ttl = 7 }
      }
    }
  }
  w.parts.spawn(P.Ring, x, y, 0, 0, 0.5, 26, 156, C.gold)
  enemySfx(w, x, true)
}

/** Six-pointed star: six straight lines of bullets with staggered speeds. */
function star(w: World, x: number, y: number, rot: number) {
  for (let k = 0; k < 6; k++) {
    const a = rot + (k / 6) * TAU
    for (let j = 0; j < 5; j++) w.fire(x, y, a, 90 + j * 22, BulletKind.Shard, 10)
    // the hexagon's rim: a slower bullet halfway between arms
    w.fire(x, y, a + Math.PI / 6, 105, BulletKind.Orb, 10)
  }
  w.parts.spawn(P.Flash, x, y, 0, 0, 0.15, 20, 50, C.gold)
  enemySfx(w, x, true)
}

function summonFlock(w: World, e: Enemy) {
  const n = 12
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU
    const b = w.spawn('garden_songbird', e.x + Math.cos(a) * 78, e.y + Math.sin(a) * 78)
    b.s.orbit = 1
    b.s.oa = a
    b.parent = null
    b.data = e
  }
}

export function spawnGardener(w: World) {
  const e = w.spawn('garden_gardener', PW / 2, -190)
  e.s.intro = 1
  e.s.phase = 1
  e.armor = 0.25
  const parts: Enemy[] = []
  for (let i = 0; i < 6; i++) {
    const p = w.spawn('garden_petal', e.x, e.y, { parent: e, tag: 'petal' })
    p.s.slot = i
    parts.push(p)
  }
  e.onDeath = null
  startBoss(w, e, 'The Gardener', parts, false, 300)
  // startBoss owns root.onDeath; chain the gift after it
  const bossDeath = e.onDeath as ((ww: World, en: Enemy) => void) | null
  e.onDeath = (ww, en) => {
    bossDeath?.(ww, en)
    ww.emit({ type: 'radio', who: '???', text: 'there. it let you go. take this — it was always meant for you.', tone: 'odd' })
    ww.after(2.6, () => {
      ww.pickup(PickupKind.Core, en.x, en.y, 0, 'core_halo')
      ww.secret('gardener', 'The Gardener let you go')
    })
  }
  return e
}
