import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { fan, ring, shell, missile, aimed, spiral } from '../patterns'
import { PW, PH } from '../consts'
import { rand, TAU, clamp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'
import { hasPainted } from '../../render/painted-art'
import { explode } from '../fx'

/** Boss scale for the wide field (art is painted at 1×). */
const S = 1.3
/** Furnace centre on the hull (logical px from its centre). */
const FURNACE_Y = -4

/**
 * SMELTER — a refinery crawler, and the first boss: its kit teaches the raid vocabulary.
 * Phase 1 (furnace shut): flame arms and missile pods fight; Slag Pour leaves burning pools
 *   where you stand (get out of the fire).
 * Phase 2 (both arms gone, furnace jammed open): Furnace Blast is the first interruptible
 *   cast (burst the furnace); Molten Rain drops blasts across the field; slag rings and spirals.
 * Phase 3 (core < 35%): it stalks your column and calls seekers. Enrages after 2:30.
 */
bossDef({
  id: 'smelter', hp: 2600, r: 80, sprite: 'smelter_body', layer: 'ground', explode: 'large', score: 20000,
  update(e, w, dt) { smelterUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const stun = w.raid.stunT > 0
    drawSprite(ctx, getSprite('smelter_body'), e.x + (stun ? rand(-1.5, 1.5) : 0), e.y, 0, S, 1, e.flash)
    const fy = e.y + FURNACE_Y * S
    const open = e.s.phase >= 2
    if (open) {
      const charge = w.raid.cast?.kick?.target === e ? w.raid.cast.t / w.raid.cast.time : 0
      if (hasPainted('smelter_core')) drawSprite(ctx, getSprite('smelter_core'), e.x, fy, 0, S * (1 + charge * 0.08), 1, e.flash)
      const k = 0.45 + 0.25 * Math.sin(w.time * 9) + charge * 0.3
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(e.x, fy, 2, e.x, fy, (34 + charge * 14) * S)
      g.addColorStop(0, `rgba(255,250,220,${Math.min(1, k)})`)
      g.addColorStop(0.4, `rgba(255,150,40,${Math.min(1, k) * 0.7})`)
      g.addColorStop(1, 'rgba(255,60,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, fy, (34 + charge * 14) * S, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    } else if (!hasPainted('smelter_body')) drawSprite(ctx, getSprite('smelter_hatch'), e.x, fy, 0, S, 1, e.flash)
  },
})

bossDef({
  id: 'smelter_arm', hp: 700, r: 34, scale: S, sprite: 'smelter_arm', layer: 'ground', explode: 'large', score: 3000,
  update(e, w) {
    const root = e.parent!
    if (root.s.intro || w.raid.stunT > 0) return
    e.rot = Math.sin(w.time * 1.3 + e.ox) * 0.35
    e.s.t = (e.s.t ?? (e.ox < 0 ? 0.6 : 1.7)) - w.frameDt * w.diff.fireRate * w.raid.rate
    if (e.s.t <= 0) {
      e.s.t = 2.3
      const a = Math.PI / 2 + e.rot
      fan(w, e.x, e.y + 46, a, 9, 1.1, 175, BulletKind.Orb, 12)
      if (w.diff.sharp) w.after(0.25, () => { if (!e.dead) fan(w, e.x, e.y + 46, a, 8, 0.9, 205) })
      for (let i = 0; i < 6; i++) w.parts.spawn(P.Fire, e.x, e.y + 40, rand(-60, 60), rand(80, 200), 0.3, 6, 14, 0, 2)
    }
  },
  onDeath(e, w) { partDown(w, e) },
})

bossDef({
  id: 'smelter_pod', hp: 350, r: 23, scale: S, sprite: 'smelter_pod', layer: 'ground', explode: 'medium', score: 1500,
  update(e, w) {
    if (e.parent!.s.intro || w.raid.stunT > 0) return
    e.s.t = (e.s.t ?? (e.ox < 0 ? 1 : 3)) - w.frameDt * w.diff.fireRate * w.raid.rate
    if (e.s.t <= 0) { e.s.t = 4.2; missile(w, e.x, e.y, -Math.PI / 2 + (e.ox < 0 ? -0.5 : 0.5), 140, 1.6, 8) }
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

function smelterUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  // entrance
  if (s.intro) {
    e.y += (150 - e.y) * Math.min(1, dt * 0.9)
    if (Math.abs(e.y - 150) < 3) s.intro = 0
    dust(e, w)
    return
  }
  const parts = w.bossParts
  const arms = alive(parts, 'arm')
  // movement: sway, later stalk the player's column
  const targetX = s.phase >= 2 ? w.player.x * 0.6 + PW * 0.2 : PW / 2 + Math.sin(s.time * 0.45) * 220
  const vx = Math.max(-90, Math.min(90, (targetX - e.x) * 1.2))
  e.x += vx * dt
  for (const p of parts) if (p !== e && !p.dead) { p.x = e.x + p.ox; p.y = e.y + p.oy }
  if (Math.abs(vx) > 5) dust(e, w)

  if (s.phase === 1 && arms.length === 0) {
    s.phase = 2
    e.armor = 1
    phaseShift(w, 'THE FURNACE REMEMBERS YOUR SHAPE.')
    ring(w, e.x, e.y, 24, 150)
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.35) {
    s.phase = 3
    phaseShift(w)
  }

  const raid = w.raid
  if (raid.stunT > 0) {
    if (Math.random() < 0.5) w.parts.spawn(P.Spark, e.x + rand(-50, 50) * S, e.y + rand(-40, 40) * S, rand(-120, 120), rand(-160, 40), 0.4, 2, 0.5, C.cyan, 3)
    return
  }
  const rate = w.diff.fireRate * raid.rate
  const tick = (k: string, first: number) => (s[k] = (s[k] ?? first) - dt * rate)

  // mortar shells
  if (tick('shellT', 2.5) <= 0) {
    s.shellT = s.phase === 1 ? 3.2 : 4
    shell(w, e.x, e.y - 40, w.player.x, w.player.y - 40, 190, 10)
  }
  // Slag Pour: burning pools where you are (all phases; the teaching mechanic)
  if (tick('pourT', 5) <= 0 && raid.ready()) {
    s.pourT = s.phase === 1 ? 9 : 12
    raid.begin(w, 'Slag Pour', 1.2, (ww) => {
      const p = ww.player
      for (let i = 0; i < (s.phase === 1 ? 2 : 3); i++) ww.after(i * 0.45, () => {
        ww.raid.zone({ x: clamp(p.x + rand(-30, 30), 40, PW - 40), y: clamp(p.y + rand(-20, 20), PH * 0.4, PH - 30), r: 54, kind: 'pool', delay: 1.1, linger: 5, dmg: 30, tint: '255,120,30' })
      })
    }, { warn: 'Slag Pour — get out of the fire' })
  }
  if (s.phase >= 2) {
    if (tick('kickT', 3) <= 0 && raid.ready()) {
      s.kickT = s.phase === 3 ? 12 : 14
      raid.begin(w, 'Furnace Blast', 3.4, (ww) => furnaceBlast(ww, e), { kick: { target: e }, warn: 'Interrupt — burst the furnace!' })
    }
    if (tick('rainT', 7) <= 0 && raid.ready()) {
      s.rainT = 11
      raid.begin(w, 'Molten Rain', 1.0, (ww) => {
        for (let i = 0; i < 5; i++) ww.raid.zone({ x: rand(60, PW - 60), y: rand(PH * 0.4, PH - 50), r: 58, kind: 'blast', delay: 1.6 + i * 0.15, dmg: 22 })
      }, { warn: 'Molten Rain' })
    }
    if (tick('slagT', 1) <= 0) {
      s.slagT = s.phase === 3 ? 2.1 : 2.8
      ring(w, e.x, e.y, s.phase === 3 ? 18 : 14, 110, rand(0, TAU), BulletKind.Big, 16)
      for (let i = 0; i < 12; i++) w.parts.spawn(P.Fire, e.x, e.y, rand(-120, 120), rand(-120, 120), 0.5, 8, 20, 0, 2)
    }
    s.stream = (s.stream ?? 0) + dt
    if (s.stream % 5 < 1.6) spiral(w, e, dt, s.phase === 3 ? 16 : 11, 2, 2.4, 170)
    if (s.phase === 3) {
      if (tick('burst', 1.5) <= 0) { s.burst = 1.6; aimed(w, e.x, e.y + 30, 230, 3, 0.12, BulletKind.Needle, 12) }
      if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x + rand(-60, 60), e.y + rand(-50, 50), 0, -30, 1.2, 8, 26, C.smokeDark, 0.5)
    }
    if (tick('darts', 6) <= 0) {
      s.darts = 9
      for (let i = 0; i < 4; i++) w.spawn('seeker', e.x + (i - 1.5) * 40, e.y + 40)
    }
  }
}

/** Failed kick: the furnace vents: two rings of slag with a gap, and a heat wave across the field. */
function furnaceBlast(w: World, e: Enemy) {
  const fy = e.y + FURNACE_Y * S
  w.flashScreen = Math.max(w.flashScreen, 0.4)
  w.addShake(12)
  w.player.hurt(12, w.player.x, w.player.y)
  explode(w, e.x, fy, 'large', false, C.orange, true)
  for (let k = 0; k < 2; k++) w.after(k * 0.45, () => {
    const gap = Math.atan2(w.player.y - fy, w.player.x - e.x) + rand(-0.4, 0.4)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU
      if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.34) continue
      w.fire(e.x, fy, a, 160 + k * 30, BulletKind.Big, 14)
    }
  })
}

function dust(e: Enemy, w: World) {
  if (Math.random() < 0.5) {
    const side = Math.random() < 0.5 ? -1 : 1
    w.parts.spawn(P.Smoke, e.x + side * 88 * S + rand(-8, 8), e.y + 70 * S, rand(-20, 20), 20, 1, 6, 18, C.smokeLight, 1, true)
  }
}

export function spawnSmelter(w: World) {
  const e = w.spawn('smelter', PW / 2, -150)
  e.s.intro = 1
  e.s.phase = 1
  e.armor = 0
  const parts: Enemy[] = []
  for (const ox of [-92 * S, 92 * S]) parts.push(w.spawn('smelter_arm', e.x + ox, e.y + 30 * S, { parent: e, ox, oy: 30 * S, tag: 'arm' }))
  for (const ox of [-58 * S, 58 * S]) parts.push(w.spawn('smelter_pod', e.x + ox, e.y - 52 * S, { parent: e, ox, oy: -52 * S, tag: 'pod' }))
  startBoss(w, e, 'Smelter — refinery crawler', parts, false, 150)
  return e
}
