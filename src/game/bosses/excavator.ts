import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind, PickupKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { ring } from '../patterns'
import { aimed, fan, spiral } from '../patterns'
import { LineMover } from '../movers'
import { explode } from '../fx'
import { PW, PH } from '../consts'
import { rand, TAU, clamp, easeInOutSine, lerp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * EXCAVATOR — a strip-mining machine that eats asteroids. Raid-style kit (see raid.ts):
 * Phase 1 (arms up): Drill Sweep (telegraphed wedge swings), Seismic Charges (ground blasts
 *   dropped on your position: keep moving), the maw spits rock.
 * Phase 2 (both arms gone, core exposed): Core Overload — interruptible: burst the core
 *   before the bar fills or eat a shockwave; Cutting Beam sweeps half the field; Ore Meteor is a
 *   soak: stand in the gold circle or the whole field takes the impact.
 * Phase 3 (core < 40%): Gravity Tractor drags you toward the molten maw while it hurls the
 *   asteroids it pulled in. Enrages after three minutes.
 */

/** Boss scale for the wide field (art is painted at 1×). */
const S = 1.3
/** Mount points on the painted hull (logical px from its centre). */
const SHOULDER_X = 113, SHOULDER_Y = -3, CORE_Y = -3, MAW_Y = 77
const Y0 = 142
const ARM_REST = 228
/** Kept short of the bottom edge: under the swing's reach is the radial escape. */
const ARM_REACH = 420
const ARM_W = 24
/** Seconds the drill bit glows before its tip cannon fires. */
const TIP_CHARGE = 0.5
/** Drill art scale, and the share of its length (from the top) reused as boom sections. */
const DRILL_SCALE = S * 1.15, BOOM_FRAC = 0.32

bossDef({
  id: 'm4_excavator', hp: 15500, r: 75, scale: S, sprite: 'm4_exc_body', explode: 'huge', score: 30000,
  update(e, w, dt) { excUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const stun = w.raid.stunT > 0
    drawSprite(ctx, getSprite('m4_exc_body'), e.x + (stun ? rand(-1.5, 1.5) : 0), e.y, 0, S, 1, e.flash)
    const cy = e.y + CORE_Y * S
    if (e.s.phase >= 2) {
      // the iris is blown open: the molten core shows, flaring while it charges an overload
      const charge = w.raid.cast?.kick?.target === e ? w.raid.cast.t / w.raid.cast.time : 0
      drawSprite(ctx, getSprite('m4_exc_core'), e.x, cy, w.time * 0.6, S * (0.92 + charge * 0.12), 1, e.flash)
      const k = 0.4 + 0.25 * Math.sin(w.time * 7) + charge * 0.3
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(e.x, cy, 2, e.x, cy, (34 + charge * 16) * S)
      g.addColorStop(0, `rgba(255,252,230,${Math.min(1, k)})`)
      g.addColorStop(0.35, `rgba(255,170,60,${Math.min(1, k) * 0.7})`)
      g.addColorStop(1, 'rgba(255,90,20,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, cy, (34 + charge * 16) * S, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    // laser wedge telegraph
    if (e.s.wedgeT > 0) wedge(ctx, e.x, e.y + 30 * S, e.s.wedgeA0, e.s.wedgeA1, 900, e.s.wedgeT)
    // tractor beams toward captured rocks
    const rocks = (e.data as Enemy[] | null) ?? []
    ctx.globalCompositeOperation = 'lighter'
    for (const r of rocks) {
      if (r.dead || r.gone || (r.mover as TractorMover).stage > 1) continue
      ctx.strokeStyle = `rgba(118,242,255,${0.25 + 0.15 * Math.sin(w.time * 20 + r.id)})`
      ctx.lineWidth = 3
      ctx.setLineDash([6, 5]); ctx.lineDashOffset = w.time * 60
      ctx.beginPath(); ctx.moveTo(e.x, e.y + MAW_Y * S); ctx.lineTo(r.x, r.y); ctx.stroke()
      ctx.setLineDash([])
    }
    ctx.globalCompositeOperation = 'source-over'
  },
  onDeath(e, w) {
    // the machine comes apart: shoulders, maw, hoppers, then the core
    const pts: [number, number, number][] = [[-118, -8, 0.2], [118, -8, 0.5], [0, 100, 0.8], [-56, 60, 1.1], [56, 60, 1.3]]
    for (const [dx, dy, t] of pts) w.after(t, () => {
      explode(w, e.x + dx * S, e.y + dy * S, 'large')
      for (let i = 0; i < 14; i++) w.parts.spawn(P.Debris, e.x + dx * S, e.y + dy * S, rand(-260, 260), rand(-220, 200), rand(0.8, 1.6), rand(4, 9), 1, C.smokeLight, 1.5)
    })
    w.after(1.6, () => { for (let i = 0; i < 10; i++) w.pickup(PickupKind.CreditBig, e.x + rand(-100, 100), e.y + rand(-60, 60), 60) })
  },
})

bossDef({
  id: 'm4_exc_arm', hp: 3300, r: 31, scale: S, sprite: 'm4_exc_shoulder', explode: 'large', score: 5000,
  init(e) { e.s.len = ARM_REST; e.s.state = 0 },
  update(e, w, dt) { armUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const s = e.s
    if (s.state === 1) wedge(ctx, s.sx, s.sy, s.a0, s.a1, ARM_REACH + 20, clamp(s.t / 1.1, 0, 1), true)
    // telescoping boom: the drill head keeps its proportions with its tip at the reach; when the
    // reach is longer than the art, armoured boom sections (cut from the top of the art) fill the
    // gap back to the shoulder; anything behind the hub is clipped
    const sp = getSprite('m4_exc_drill')
    const dw = sp.w * DRILL_SCALE, dh = sp.h * DRILL_SCALE
    ctx.save()
    ctx.translate(s.sx, s.sy)
    ctx.rotate(s.ang - Math.PI / 2)
    ctx.beginPath(); ctx.rect(-dw, 0, dw * 2, s.len + 12); ctx.clip()
    // spinning bit: a sub-pixel shimmy sells the rotation without a second frame
    if (s.state === 2) ctx.translate(Math.sin(w.time * 90) * 1.2, 0)
    const top = s.len - dh
    const segSrc = sp.img.height * BOOM_FRAC, segH = dh * BOOM_FRAC
    const draw = (img: HTMLCanvasElement) => {
      for (let y = top - segH; y > -segH; y -= segH) ctx.drawImage(img, 0, 0, img.width, segSrc, -dw / 2, y, dw, segH)
      ctx.drawImage(img, -dw / 2, top, dw, dh)
    }
    draw(sp.img)
    if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash); draw(sp.flash); ctx.globalAlpha = 1 }
    ctx.restore()
    if (s.state === 2) {
      // grinding sparks at the bit
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,200,120,0.6)'
      const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
      ctx.beginPath(); ctx.arc(tx, ty, (9 + Math.random() * 4) * S, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    // tip cannon tell: the bit glows hotter while it charges, then flashes on the shot
    const glow = Math.max(s.charge ?? 0, (s.muzzle ?? 0) / 0.14)
    if (glow > 0) {
      s.muzzle = Math.max(0, (s.muzzle ?? 0) - w.frameDt)
      const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
      const r = (10 + glow * 16) * S
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, r)
      g.addColorStop(0, `rgba(255,245,210,${0.9 * glow})`)
      g.addColorStop(0.4, `rgba(255,150,50,${0.6 * glow})`)
      g.addColorStop(1, 'rgba(255,80,20,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(tx, ty, r, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
    drawSprite(ctx, getSprite('m4_exc_shoulder'), s.sx, s.sy, w.time * (s.state === 2 ? 6 : 0.5), S, 1, e.flash)
  },
  onDeath(e, w) {
    partDown(w, e)
    const s = e.s
    for (let k = 0.3; k <= 1; k += 0.35) explode(w, s.sx + Math.cos(s.ang) * s.len * k, s.sy + Math.sin(s.ang) * s.len * k, 'medium', false, C.orange, true)
  },
})

bossDef({
  id: 'm4_exc_maw', hp: 2300, r: 39, scale: S, sprite: 'm4_exc_maw', explode: 'large', score: 4000,
  update(e, w, dt) {
    const root = e.parent!
    if (root.s.intro || w.raid.stunT > 0) return
    const rate = w.diff.fireRate * w.raid.rate
    e.s.jaw = Math.max(0, (e.s.jaw ?? 0) - dt * 3)
    e.s.spit = (e.s.spit ?? 2.2) - dt * rate
    if (e.s.spit <= 0) {
      e.s.spit = root.s.phase === 1 ? 3.6 : 4.4
      e.s.jaw = 1
      const n = root.s.phase === 1 ? 3 : 2
      for (let i = 0; i < n; i++) {
        const a = Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + rand(-0.06, 0.06)
        const r = w.spawn('rock_m', e.x, e.y + 20 * S, { mover: new LineMover(Math.cos(a) * 160, Math.sin(a) * 160) })
        r.s.ignoreGate = 1
      }
      for (let i = 0; i < 10; i++) w.parts.spawn(P.Debris, e.x + rand(-26, 26), e.y + 24 * S, rand(-120, 120), rand(60, 240), rand(0.4, 0.8), rand(2, 4), 1, C.smokeLight, 2)
      w.addShake(3)
    }
    e.s.chew = (e.s.chew ?? 1.2) - dt * rate
    if (e.s.chew <= 0) {
      e.s.chew = 2.8
      aimed(w, e.x, e.y + 24 * S, 250, w.diff.sharp ? 7 : 5, 0.12, BulletKind.Shard, 10)
    }
  },
  drawBody(ctx, e) {
    const j = e.s.jaw ?? 0
    drawSprite(ctx, getSprite('m4_exc_maw'), e.x + (j > 0 ? rand(-2, 2) : 0), e.y + j * 5, 0, S, 1, e.flash)
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
  if (root.s.intro || (w.raid.stunT > 0 && s.state === 0)) { s.ang = lerp(s.ang ?? rest, rest, Math.min(1, dt * 3)); placeArm(e); return }
  if (s.state === 0) {
    s.ang = lerp(s.ang, rest, Math.min(1, dt * 3))
    s.len = lerp(s.len, ARM_REST, Math.min(1, dt * 3))
    // tip cannon between swings
    s.f = (s.f ?? 1.5 + (side > 0 ? 1 : 0)) - dt * w.diff.fireRate * w.raid.rate
    // the bit heats up before it fires, so the shots visibly come from the drill
    s.charge = s.f < TIP_CHARGE ? 1 - s.f / TIP_CHARGE : 0
    if (s.f <= 0) {
      s.f = 2.4
      s.charge = 0
      const tx = s.sx + Math.cos(s.ang) * s.len, ty = s.sy + Math.sin(s.ang) * s.len
      if (ty < w.player.y - 60) {
        aimed(w, tx, ty, 190, 3, 0.2, BulletKind.Orb, 10)
        s.muzzle = 0.14
        for (let i = 0; i < 6; i++) w.parts.spawn(P.Spark, tx, ty, Math.cos(s.ang) * 200 + rand(-90, 90), Math.sin(s.ang) * 200 + rand(-90, 90), 0.25, 2, 0.5, C.orange, 3)
      }
    }
  } else if (s.state === 1) {
    s.charge = 0
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
    if (Math.random() < 0.6) w.parts.spawn(P.Smoke, e.x + rand(-120, 120), e.y - 120, rand(-20, 20), -40, 1, 8, 20, C.smokeDark, 0.5)
    return
  }
  const parts = w.bossParts
  const arms = alive(parts, 'arm')
  const ty = s.phase === 3 ? Y0 + 17 : Y0
  const tx = PW / 2 + Math.sin(s.time * 0.35) * (s.phase === 1 ? 90 : 135)
  e.x += clamp((tx - e.x) * 1.2, -70, 70) * dt
  e.y += (ty - e.y) * Math.min(1, dt)
  if (s.wedgeT > 0) s.wedgeT = Math.max(0, s.wedgeT - dt)

  // phase transitions
  if (s.phase === 1 && arms.length === 0) {
    s.phase = 2
    e.armor = 1
    phaseShift(w, 'YOU BROKE ITS HANDS. IT STILL HAS A MOUTH.')
    explode(w, e.x, e.y + 4 * S, 'large')
    for (let i = 0; i < 20; i++) w.parts.spawn(P.Debris, e.x, e.y + 4 * S, rand(-300, 300), rand(-200, 300), rand(0.6, 1.2), rand(4, 8), 1, C.smokeLight, 1.2)
    s.laserT = 1.8
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.4) {
    s.phase = 3
    phaseShift(w, 'THE BELT IS OURS. EVERY STONE OF IT.')
    s.pullT = 1
  }

  const raid = w.raid
  if (raid.stunT > 0) {
    // interrupted: the machine stalls, sparking
    if (Math.random() < 0.5) w.parts.spawn(P.Spark, e.x + rand(-60, 60) * S, e.y + rand(-40, 40) * S, rand(-120, 120), rand(-160, 40), 0.4, 2, 0.5, C.cyan, 3)
    return
  }
  const rate = w.diff.fireRate * raid.rate
  const tick = (k: string, first: number) => (s[k] = (s[k] ?? first) - dt * rate)
  const maw = () => ({ x: e.x, y: e.y + MAW_Y * S })

  if (s.phase === 1) {
    // arms take turns; a lone arm swings more often
    if (tick('swingT', 2.5) <= 0 && raid.ready() && arms.every((a) => a.s.state === 0)) {
      const pickSide = arms.length === 1 ? arms[0] : arms[(s.swingN = ((s.swingN ?? 0) + 1) % 2)]
      startSwing(pickSide, arms.length === 1 ? 1.0 : 1.2)
      raid.begin(w, 'Drill Sweep', 1.1, () => {})
      s.swingT = arms.length === 1 ? 3.2 : 4.0
    }
    if (tick('seisT', 6) <= 0 && raid.ready()) {
      s.seisT = 10
      raid.begin(w, 'Seismic Charges', 1.0, (ww) => seismic(ww, 4), { warn: 'Seismic Charges — keep moving' })
    }
  } else {
    if (tick('kickT', 3) <= 0 && raid.ready()) {
      s.kickT = s.phase === 3 ? 13 : 15
      raid.begin(w, 'Core Overload', 3.6, (ww) => overload(ww, e), { kick: { target: e }, warn: 'Interrupt — burst the core!' })
    }
    if (tick('laserT', 6) <= 0 && raid.ready()) {
      s.laserT = s.phase === 3 ? 7 : 6
      s.lside = s.lside === 1 ? -1 : 1
      const warn = 1.1, life = 1.3
      // lethal sector: from the far edge toward the centre, stopping short of it
      const aFar = s.lside > 0 ? 0.3 : Math.PI - 0.3
      const aNear = s.lside > 0 ? 1.38 : Math.PI - 1.38
      const sweep = (aNear - aFar) / life
      raid.begin(w, 'Cutting Beam', warn, () => {})
      w.laser(e.x, e.y + 30 * S, aFar - sweep * warn, 900, 16, warn, life, e, sweep)
      s.wedgeA0 = aFar; s.wedgeA1 = aNear; s.wedgeT = warn + life
    }
    if (tick('soakT', 8) <= 0 && raid.ready()) {
      s.soakT = 17
      const x = clamp(w.player.x + rand(-220, 220), 110, PW - 110), y = rand(PH * 0.55, PH * 0.78)
      raid.begin(w, 'Ore Meteor', 0.8, (ww) => ww.raid.zone({ x, y, r: 78, kind: 'soak', delay: 3.4, dmg: 40, boom: meteorDebris }), { warn: 'Ore Meteor — soak it!' })
    }
    // rock storm
    s.stormT = (s.stormT ?? 0.5) - dt * raid.rate
    if (s.stormT <= 0) {
      s.stormT = s.phase === 3 ? 1.0 : 0.7
      const id = Math.random() < 0.3 ? 'rock_m' : 'rock_s'
      const r = w.spawn(id, rand(30, PW - 30), -30, { mover: new LineMover(rand(-30, 30), rand(100, 150)) })
      r.s.ignoreGate = 1
    }
    if (s.phase === 2) {
      s.spin = (s.spin ?? 0) + dt
      if (s.spin % 6 < 2) spiral(w, e, dt, 11, 3, 1.6, 150)
    }
  }

  if (s.phase === 3) {
    // desperation: tractor asteroids in, hurl them, and drag the ship toward the maw
    if (tick('pullT', 1) <= 0) {
      s.pullT = 9
      const rocks: Enemy[] = []
      const spots: [number, number][] = [[-50, 40], [PW + 50, 60], [PW / 2 + rand(-180, 180), -60]]
      spots.forEach(([x, y], i) => {
        const r = w.spawn('rock_l', x, y, { mover: new TractorMover(e, (i - 1) * 195, 140 + (i === 1 ? 20 : 0), 0.9 + i * 0.55) })
        r.s.ignoreGate = 1
        r.noCull = true
        rocks.push(r)
      })
      e.data = rocks
      if (!s.pullSaid) w.emit({ type: 'radio', who: 'KESTREL', text: 'It is pulling rocks in. Break them before it throws them.' })
      s.pullSaid = 1
    }
    if (tick('tractorT', 4) <= 0 && raid.ready()) {
      s.tractorT = 15
      raid.begin(w, 'Gravity Tractor', 1.2, (ww) => {
        const m = maw()
        ww.raid.pull(m.x, m.y + 30, 135, 4.5)
        ww.raid.zone({ x: m.x, y: m.y + 20, r: 70, kind: 'pool', delay: 0.4, linger: 4.4, dmg: 45 })
      }, { warn: 'Gravity Tractor — fly away!' })
    }
    if (tick('fanT', 2) <= 0) {
      s.fanT = 2.4
      fan(w, e.x, e.y + 40 * S, Math.PI / 2, 11, 1.6, 170, BulletKind.Orb, 10)
    }
  }
}

/** Ground charges dropped on the player's position one after another. */
function seismic(w: World, n: number) {
  for (let i = 0; i < n; i++) w.after(i * 0.5, () => {
    const p = w.player
    w.raid.zone({ x: p.x, y: p.y, r: 62, kind: 'blast', delay: 1.3, dmg: 20, boom: (ww, z) => ring(ww, z.x, z.y, 8, 130, Math.random(), BulletKind.Shard, 8) })
  })
}

/** Failed kick: the core vents in three shockwave rings, each with a gap to thread. */
function overload(w: World, e: Enemy) {
  const cy = e.y + CORE_Y * S
  w.flashScreen = Math.max(w.flashScreen, 0.45)
  w.addShake(16)
  w.player.hurt(14, w.player.x, w.player.y)
  for (let k = 0; k < 3; k++) w.after(k * 0.4, () => {
    const gap = Math.atan2(w.player.y - cy, w.player.x - e.x) + rand(-0.5, 0.5)
    const n = 34
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU
      if (Math.abs(Math.atan2(Math.sin(a - gap), Math.cos(a - gap))) < 0.32) continue
      w.fire(e.x, cy, a, 175 + k * 25, BulletKind.Orb, 12)
    }
  })
  explode(w, e.x, cy, 'large', false, C.orange, true)
}

function meteorDebris(w: World, z: { x: number; y: number }) {
  for (let i = 0; i < 18; i++) w.parts.spawn(P.Debris, z.x, z.y, rand(-260, 260), rand(-260, 120), rand(0.6, 1.2), rand(4, 8), 1, C.smokeLight, 1.4)
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
  const e = w.spawn('m4_excavator', PW / 2, -210)
  e.s.intro = 1
  e.s.phase = 1
  e.armor = 0
  const parts: Enemy[] = []
  for (const ox of [-SHOULDER_X * S, SHOULDER_X * S]) parts.push(w.spawn('m4_exc_arm', e.x + ox, e.y + SHOULDER_Y * S, { parent: e, ox, oy: SHOULDER_Y * S, tag: 'arm' }))
  parts.push(w.spawn('m4_exc_maw', e.x, e.y + MAW_Y * S, { parent: e, ox: 0, oy: MAW_Y * S, tag: 'maw' }))
  startBoss(w, e, 'Excavator — belt strip-miner', parts, false, 180)
  return e
}
