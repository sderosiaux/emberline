import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind, PickupKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { aimed, fan, shell, spiral } from '../patterns'
import { LineMover } from '../movers'
import { explode } from '../fx'
import { PW, PH } from '../consts'
import { rand, TAU, clamp, easeInOutSine, lerp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * EXCAVATOR — a strip-mining machine that eats asteroids.
 * Phase 1: the core hides behind a shutter; two drill arms take turns sweeping
 *   across the screen (telegraphed wedge, then a spinning drill you must not
 *   touch) while the grinder maw spits rock.
 * Phase 2 (both arms gone): the shutter blows, the core sweeps a cutting laser
 *   over one half of the screen at a time, and a rock storm falls.
 * Phase 3 (core < 40%): it tractors big asteroids in from the belt, holds them
 *   and hurls them at you — shoot them while they hang.
 */

const Y0 = 150
const ARM_REST = 190
const ARM_REACH = 400
const ARM_W = 17

bossDef({
  id: 'm4_excavator', hp: 11000, r: 58, sprite: 'm4_exc_body', explode: 'huge', score: 30000,
  update(e, w, dt) { excUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    drawSprite(ctx, getSprite('m4_exc_body'), e.x, e.y, 0, 1, 1, e.flash)
    const cy = e.y + 4
    if (e.s.phase >= 2) {
      const k = 0.65 + 0.35 * Math.sin(w.time * 7)
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(e.x, cy, 2, e.x, cy, 30)
      g.addColorStop(0, `rgba(255,252,230,${k})`)
      g.addColorStop(0.35, `rgba(255,190,70,${k * 0.9})`)
      g.addColorStop(1, 'rgba(255,90,20,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, cy, 30, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    } else drawSprite(ctx, getSprite('m4_exc_shutter'), e.x, cy, 0, 1, 1, e.flash)
    // laser wedge telegraph
    if (e.s.wedgeT > 0) wedge(ctx, e.x, e.y + 30, e.s.wedgeA0, e.s.wedgeA1, 640, e.s.wedgeT)
    // tractor beams toward captured rocks
    const rocks = (e.data as Enemy[] | null) ?? []
    ctx.globalCompositeOperation = 'lighter'
    for (const r of rocks) {
      if (r.dead || r.gone || (r.mover as TractorMover).stage > 1) continue
      ctx.strokeStyle = `rgba(118,242,255,${0.25 + 0.15 * Math.sin(w.time * 20 + r.id)})`
      ctx.lineWidth = 3
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = w.time * 60
      ctx.beginPath(); ctx.moveTo(e.x, cy); ctx.lineTo(r.x, r.y); ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.globalCompositeOperation = 'source-over'
  },
  onDeath(e, w) {
    // the machine comes apart: shoulders, maw, hoppers, then the core
    const pts: [number, number, number][] = [[-118, -8, 0.2], [118, -8, 0.5], [0, 100, 0.8], [-56, 60, 1.1], [56, 60, 1.3]]
    for (const [dx, dy, t] of pts) w.after(t, () => {
      explode(w, e.x + dx, e.y + dy, 'large')
      for (let i = 0; i < 14; i++) w.parts.spawn(P.Debris, e.x + dx, e.y + dy, rand(-260, 260), rand(-220, 200), rand(0.8, 1.6), rand(4, 9), 1, C.smokeLight, 1.5)
    })
    w.after(1.6, () => { for (let i = 0; i < 10; i++) w.pickup(PickupKind.CreditBig, e.x + rand(-80, 80), e.y + rand(-50, 50), 60) })
  },
})

bossDef({
  id: 'm4_exc_arm', hp: 2400, r: 24, sprite: 'm4_exc_shoulder', explode: 'large', score: 5000,
  init(e) { e.s.len = ARM_REST; e.s.state = 0 },
  update(e, w, dt) { armUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const s = e.s
    if (s.state === 1) wedge(ctx, s.sx, s.sy, s.a0, s.a1, ARM_REACH + 20, clamp(s.t / 1.1, 0, 1), true)
    const spin = s.state === 2 || Math.floor(w.time * 12) % 2 === 0
    const sp = getSprite(spin && Math.floor(w.time * 30) % 2 ? 'm4_exc_drill_b' : 'm4_exc_drill_a')
    ctx.save()
    ctx.translate(s.sx, s.sy)
    ctx.rotate(s.ang - Math.PI / 2)
    ctx.drawImage(sp.img, -sp.w / 2, -10, sp.w, s.len + 10)
    if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash); ctx.drawImage(sp.flash, -sp.w / 2, -10, sp.w, s.len + 10); ctx.globalAlpha = 1 }
    ctx.restore()
    if (s.state === 2) {
      // grinding sparks at the bit
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,200,120,0.6)'
      const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
      ctx.beginPath(); ctx.arc(tx, ty, 9 + Math.random() * 4, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    drawSprite(ctx, getSprite('m4_exc_shoulder'), s.sx, s.sy, w.time * (s.state === 2 ? 6 : 0.5), 1, 1, e.flash)
  },
  onDeath(e, w) {
    partDown(w, e)
    const s = e.s
    for (let k = 0.3; k <= 1; k += 0.35) explode(w, s.sx + Math.cos(s.ang) * s.len * k, s.sy + Math.sin(s.ang) * s.len * k, 'medium', false, C.orange, true)
  },
})

bossDef({
  id: 'm4_exc_maw', hp: 2000, r: 30, sprite: 'm4_exc_maw', explode: 'large', score: 4000,
  update(e, w, dt) {
    const root = e.parent!
    if (root.s.intro) return
    e.s.jaw = Math.max(0, (e.s.jaw ?? 0) - dt * 3)
    e.s.spit = (e.s.spit ?? 2.2) - dt * w.diff.fireRate
    if (e.s.spit <= 0) {
      e.s.spit = root.s.phase === 1 ? 3.6 : 4.4
      e.s.jaw = 1
      const n = root.s.phase === 1 ? 3 : 2
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + rand(-0.06, 0.06)
        const r = w.spawn('rock_m', e.x, e.y + 20, { mover: new LineMover(Math.cos(a) * 150, Math.sin(a) * 150) })
        r.s.ignoreGate = 1
      }
      for (let i = 0; i < 10; i++) w.parts.spawn(P.Debris, e.x + rand(-20, 20), e.y + 24, rand(-120, 120), rand(60, 240), rand(0.4, 0.8), rand(2, 4), 1, C.smokeLight, 2)
      w.addShake(3)
    }
    e.s.chew = (e.s.chew ?? 1.2) - dt * w.diff.fireRate
    if (e.s.chew <= 0) {
      e.s.chew = 3.6
      aimed(w, e.x, e.y + 24, 230, w.diff.sharp ? 5 : 3, 0.14, BulletKind.Shard, 10)
    }
  },
  drawBody(ctx, e) {
    const j = e.s.jaw ?? 0
    drawSprite(ctx, getSprite('m4_exc_maw'), e.x + (j > 0 ? rand(-1.5, 1.5) : 0), e.y + j * 4, 0, 1, 1, e.flash)
  },
  onDeath(e, w) { partDown(w, e) },
})

/** Filled sector preview for sweeps: faint fill that sharpens as the attack nears. */
function wedge(ctx: CanvasRenderingContext2D, x: number, y: number, a0: number, a1: number, r: number, k: number, arc = false) {
  const lo = Math.min(a0, a1), hi = Math.max(a0, a1)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = `rgba(255,46,136,${0.03 + 0.07 * k})`
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, lo, hi); ctx.closePath(); ctx.fill()
  ctx.strokeStyle = `rgba(255,46,136,${0.3 + 0.5 * k})`
  ctx.lineWidth = 1.5
  ctx.setLineDash([8, 7])
  ctx.beginPath()
  if (arc) ctx.arc(x, y, r, lo, hi)
  ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

// ───────────────────────── arms ─────────────────────────

function armUpdate(e: Enemy, w: World, dt: number) {
  const root = e.parent!
  const s = e.s
  const side = e.ox < 0 ? -1 : 1
  s.sx = root.x + e.ox; s.sy = root.y + e.oy
  // rest pose: hanging down and outward, swaying
  const rest = Math.PI / 2 - side * (0.42 + Math.sin(w.time * 1.1 + side) * 0.08)
  if (root.s.intro) { s.ang = rest; placeArm(e); return }
  if (s.state === 0) {
    s.ang = lerp(s.ang, rest, Math.min(1, dt * 3))
    s.len = lerp(s.len, ARM_REST, Math.min(1, dt * 3))
    // tip cannon between swings
    s.f = (s.f ?? 1.5 + (side > 0 ? 1 : 0)) - dt * w.diff.fireRate
    if (s.f <= 0) {
      s.f = 2.4
      const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
      if (ty < w.player.y - 60) aimed(w, tx, ty, 190, 3, 0.2, BulletKind.Orb, 10)
    }
  } else if (s.state === 1) {
    // wind-up: pull back outward while the wedge shows the swing
    s.t += dt
    s.ang = lerp(s.ang, s.a0, Math.min(1, dt * 5))
    s.len = lerp(s.len, ARM_REST * 0.8, Math.min(1, dt * 4))
    if (Math.random() < 0.5) w.parts.spawn(P.Spark, s.sx + Math.cos(s.ang) * s.len, s.sy + Math.sin(s.ang) * s.len, rand(-80, 80), rand(-80, 80), 0.25, 2, 0.5, C.orange, 3)
    if (s.t >= 1.1) { s.state = 2; s.t = 0 }
  } else if (s.state === 2) {
    s.t += dt
    const k = easeInOutSine(clamp(s.t / s.dur, 0, 1))
    s.ang = lerp(s.a0, s.a1, k)
    s.len = lerp(ARM_REST * 0.8, ARM_REACH, Math.min(1, s.t * 3))
    hurtAlongArm(e, w, dt)
    const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
    for (let i = 0; i < 2; i++) w.parts.spawn(P.Spark, tx, ty, rand(-240, 240), rand(-240, 240), rand(0.2, 0.4), 2, 0.5, i ? C.yellow : C.orange, 3)
    w.addShake(0.6)
    if (s.t >= s.dur) { s.state = 0; s.t = 0 }
  }
  placeArm(e)
}

/** The hit circle rides along the boom so shots aimed at the arm connect. */
function placeArm(e: Enemy) {
  const s = e.s
  e.x = s.sx + Math.cos(s.ang) * s.len * 0.42
  e.y = s.sy + Math.sin(s.ang) * s.len * 0.42
}

function hurtAlongArm(e: Enemy, w: World, dt: number) {
  const p = w.player
  if (!p.alive || p.phased) return
  const s = e.s
  const ex = Math.cos(s.ang), ey = Math.sin(s.ang)
  const px = p.x - s.sx, py = p.y - s.sy
  const t = clamp(px * ex + py * ey, 0, s.len)
  const cx = px - ex * t, cy = py - ey * t
  const wr = ARM_W + p.hitR
  if (cx * cx + cy * cy < wr * wr) p.hurt(25 * w.diff.damageTaken * dt * 6, p.x, p.y, true)
}

function startSwing(arm: Enemy, dur: number) {
  const side = arm.ox < 0 ? -1 : 1
  const s = arm.s
  s.state = 1; s.t = 0; s.dur = dur
  // wind-up points outward (slightly above horizontal), swing crosses under the body
  s.a0 = side < 0 ? Math.PI - 0.1 : 0.1
  s.a1 = Math.PI / 2 + side * 0.62
}

// ───────────────────────── body ─────────────────────────

function excUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  if (s.intro) {
    e.y += (Y0 - e.y) * Math.min(1, dt * 0.8)
    if (Math.abs(e.y - Y0) < 3) s.intro = 0
    if (Math.random() < 0.6) w.parts.spawn(P.Smoke, e.x + rand(-90, 90), e.y - 90, rand(-20, 20), -40, 1, 8, 20, C.smokeDark, 0.5)
    return
  }
  const parts = w.bossParts
  const arms = alive(parts, 'arm')
  const ty = s.phase === 3 ? Y0 + 20 : Y0
  const tx = PW / 2 + Math.sin(s.time * 0.35) * (s.phase === 1 ? 60 : 90)
  e.x += clamp((tx - e.x) * 1.2, -50, 50) * dt
  e.y += (ty - e.y) * Math.min(1, dt)
  if (s.wedgeT > 0) s.wedgeT = Math.max(0, s.wedgeT - dt)

  // phase transitions
  if (s.phase === 1 && arms.length === 0) {
    s.phase = 2
    e.armor = 1
    phaseShift(w, 'YOU BROKE ITS HANDS. IT STILL HAS A MOUTH.')
    explode(w, e.x, e.y + 4, 'large')
    for (let i = 0; i < 20; i++) w.parts.spawn(P.Debris, e.x, e.y + 4, rand(-300, 300), rand(-200, 300), rand(0.6, 1.2), rand(4, 8), 1, C.smokeLight, 1.2)
    s.laserT = 1.8
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.4) {
    s.phase = 3
    phaseShift(w, 'THE BELT IS OURS. EVERY STONE OF IT.')
    s.pullT = 1
  }

  if (s.phase === 1) {
    // arms take turns; a lone arm swings more often
    s.swingT = (s.swingT ?? 2.5) - dt * w.diff.fireRate
    if (s.swingT <= 0 && arms.every((a) => a.s.state === 0)) {
      const pickSide = arms.length === 1 ? arms[0] : arms[(s.swingN = ((s.swingN ?? 0) + 1) % 2)]
      startSwing(pickSide, arms.length === 1 ? 1.0 : 1.25)
      s.swingT = arms.length === 1 ? 3.4 : 4.4
    }
    s.shellT = (s.shellT ?? 3) - dt * w.diff.fireRate
    if (s.shellT <= 0) {
      s.shellT = 4.2
      const hx = e.x + (Math.random() < 0.5 ? -56 : 56)
      shell(w, hx, e.y + 60, w.player.x + rand(-40, 40), Math.min(w.player.y - 90, e.y + 330), 170, 10, 130)
    }
  } else {
    // core cutting laser: one half of the screen at a time, wedge-telegraphed
    s.laserT = (s.laserT ?? 2) - dt * w.diff.fireRate
    if (s.laserT <= 0) {
      s.laserT = s.phase === 3 ? 5.2 : 4.2
      s.lside = s.lside === 1 ? -1 : 1
      const warn = 1.1, life = 1.3
      // lethal sector: from the far edge toward the centre, stopping short of it
      const aFar = s.lside > 0 ? 0.3 : Math.PI - 0.3
      const aNear = s.lside > 0 ? 1.38 : Math.PI - 1.38
      const sweep = (aNear - aFar) / life
      w.laser(e.x, e.y + 30, aFar - sweep * warn, 900, 16, warn, life, e, sweep)
      s.wedgeA0 = aFar; s.wedgeA1 = aNear; s.wedgeT = warn + life
    }
    // rock storm
    s.stormT = (s.stormT ?? 0.5) - dt
    if (s.stormT <= 0) {
      s.stormT = s.phase === 3 ? 1.3 : 0.9
      const id = Math.random() < 0.3 ? 'rock_m' : 'rock_s'
      const r = w.spawn(id, rand(30, PW - 30), -30, { mover: new LineMover(rand(-30, 30), rand(90, 140)) })
      r.s.ignoreGate = 1
    }
    if (s.phase === 2) {
      s.spin = (s.spin ?? 0) + dt
      if (s.spin % 6 < 2) spiral(w, e, dt, 9, 3, 1.6, 140)
    }
  }

  if (s.phase === 3) {
    // desperation: tractor asteroids in, hurl them
    s.pullT = (s.pullT ?? 1) - dt * w.diff.fireRate
    if (s.pullT <= 0) {
      s.pullT = 6.5
      const rocks: Enemy[] = []
      const spots: [number, number][] = [[-50, 40], [PW + 50, 60], [PW / 2 + rand(-120, 120), -60]]
      spots.forEach(([x, y], i) => {
        const r = w.spawn('rock_l', x, y, { mover: new TractorMover(e, (i - 1) * 150, 110 + (i === 1 ? 20 : 0), 0.9 + i * 0.55) })
        r.s.ignoreGate = 1
        r.noCull = true
        rocks.push(r)
      })
      e.data = rocks
      w.emit({ type: 'radio', who: 'KESTREL', text: 'It is pulling rocks in. Break them before it throws them.' })
      s.pullSaid = 1
    }
    s.fanT = (s.fanT ?? 2) - dt * w.diff.fireRate
    if (s.fanT <= 0) {
      s.fanT = 2.6
      fan(w, e.x, e.y + 40, Math.PI / 2, 7, 1.3, 150, BulletKind.Orb, 10)
    }
  }
}

/** Pulled toward an anchor below the boss, held, then flung at the player. */
class TractorMover {
  stage = 0
  t = 0
  constructor(private root: Enemy, private dx: number, private dy: number, private hold: number) {}
  update(e: Enemy, w: World, dt: number) {
    if (this.stage === 0 || this.stage === 1) {
      if (this.root.dead) { this.fling(e, w); return }
      const tx = this.root.x + this.dx, ty = this.root.y + this.dy
      const k = Math.min(1, dt * (this.stage === 0 ? 1.6 : 6))
      e.x += (tx - e.x) * k
      e.y += (ty - e.y) * k
      e.s.spin = (e.s.spin ?? 0) * 0.98
      if (this.stage === 0 && Math.hypot(tx - e.x, ty - e.y) < 14) { this.stage = 1; this.t = 0 }
      if (this.stage === 1) {
        this.t += dt
        e.x += rand(-1.5, 1.5)
        if (this.t >= this.hold) this.fling(e, w)
      }
    } else {
      e.x += e.vx * dt; e.y += e.vy * dt
      if (e.y > PH + 80 || e.y < -120 || e.x < -120 || e.x > PW + 120) e.gone = true
    }
  }
  private fling(e: Enemy, w: World) {
    this.stage = 2
    const a = Math.atan2(w.player.y - e.y, w.player.x - e.x)
    const sp = 300 * w.diff.bulletSpeed
    e.vx = Math.cos(a) * sp; e.vy = Math.sin(a) * sp
    e.s.spin = 4
    for (let i = 0; i < 8; i++) w.parts.spawn(P.Spark, e.x, e.y, -e.vx * rand(0.3, 0.8), -e.vy * rand(0.3, 0.8), 0.3, 2, 0.5, C.cyan, 3)
  }
}

export function spawnExcavator(w: World) {
  const e = w.spawn('m4_excavator', PW / 2, -170)
  e.s.intro = 1
  e.s.phase = 1
  e.armor = 0
  const parts: Enemy[] = []
  for (const ox of [-118, 118]) parts.push(w.spawn('m4_exc_arm', e.x + ox, e.y - 8, { parent: e, ox, oy: -8, tag: 'arm' }))
  parts.push(w.spawn('m4_exc_maw', e.x, e.y + 104, { parent: e, ox: 0, oy: 104, tag: 'maw' }))
  startBoss(w, e, 'Excavator — belt strip-miner', parts)
  return e
}
