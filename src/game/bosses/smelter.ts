import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { fan, ring, shell, missile, aimed, spiral } from '../patterns'
import { PW } from '../consts'

/** Boss scale for the wide field (art is painted at 1×). */
const S = 1.3
import { rand, TAU } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * SMELTER — a refinery crawler. Phase 1: its armoured furnace is shut; the two
 * flame arms and missile pods do the fighting. Kill both arms and the furnace
 * hatch jams open: the core becomes vulnerable but starts vomiting slag.
 */
bossDef({
  id: 'smelter', hp: 2600, r: 80, sprite: 'smelter_body', layer: 'ground', explode: 'large', score: 20000,
  update(e, w, dt) { smelterUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    drawSprite(ctx, getSprite('smelter_body'), e.x, e.y, 0, S, 1, e.flash)
    const open = e.s.phase >= 2
    const k = open ? 0.7 + 0.3 * Math.sin(w.time * 9) : 0
    if (open) {
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(e.x, e.y - 4 * S, 2, e.x, e.y - 4 * S, 34 * S)
      g.addColorStop(0, `rgba(255,250,220,${k})`)
      g.addColorStop(0.4, `rgba(255,150,40,${k * 0.9})`)
      g.addColorStop(1, 'rgba(255,60,0,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, e.y - 4 * S, 34 * S, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    } else drawSprite(ctx, getSprite('smelter_hatch'), e.x, e.y - 4 * S, 0, S, 1, e.flash)
  },
})

bossDef({
  id: 'smelter_arm', hp: 700, r: 34, scale: S, sprite: 'smelter_arm', layer: 'ground', explode: 'large', score: 3000,
  update(e, w) {
    const root = e.parent!
    if (root.s.intro) return
    e.rot = Math.sin(w.time * 1.3 + e.ox) * 0.35
    e.s.t = (e.s.t ?? (e.ox < 0 ? 0.6 : 1.7)) - w.frameDt * w.diff.fireRate
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
    if (e.parent!.s.intro) return
    e.s.t = (e.s.t ?? (e.ox < 0 ? 1 : 3)) - w.frameDt * w.diff.fireRate
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

  // body attacks
  s.shellT = (s.shellT ?? 2.5) - dt * w.diff.fireRate
  if (s.shellT <= 0) {
    s.shellT = s.phase === 1 ? 3.2 : 4
    shell(w, e.x, e.y - 40, w.player.x, w.player.y - 40, 190, 10)
  }
  if (s.phase >= 2) {
    s.slagT = (s.slagT ?? 1) - dt * w.diff.fireRate
    if (s.slagT <= 0) {
      s.slagT = s.phase === 3 ? 2.1 : 2.8
      ring(w, e.x, e.y, s.phase === 3 ? 18 : 14, 110, rand(0, TAU), BulletKind.Big, 16)
      for (let i = 0; i < 12; i++) w.parts.spawn(P.Fire, e.x, e.y, rand(-120, 120), rand(-120, 120), 0.5, 8, 20, 0, 2)
    }
    s.stream = (s.stream ?? 0) + dt
    if (s.stream % 5 < 1.6) spiral(w, e, dt, s.phase === 3 ? 16 : 11, 2, 2.4, 170)
    if (s.phase === 3) {
      s.burst = (s.burst ?? 1.5) - dt
      if (s.burst <= 0) { s.burst = 1.6; aimed(w, e.x, e.y + 30, 230, 3, 0.12, BulletKind.Needle, 12) }
      if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x + rand(-60, 60), e.y + rand(-50, 50), 0, -30, 1.2, 8, 26, C.smokeDark, 0.5)
    }
    s.darts = (s.darts ?? 6) - dt
    if (s.darts <= 0) {
      s.darts = 9
      for (let i = 0; i < 4; i++) w.spawn('seeker', e.x + (i - 1.5) * 40, e.y + 40)
    }
  }
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
  startBoss(w, e, 'Smelter — refinery crawler', parts)
  return e
}
