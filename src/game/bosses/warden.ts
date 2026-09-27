import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { aimed, spiral, ring } from '../patterns'
import { explode } from '../fx'
import { PW, PH } from '../consts'
import { rand, TAU, clamp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * WARDEN — the dock's defence core.
 * Phase 1: a turning ring of eight armour segments shields the core; shots
 *   only reach it through the gaps. Four ring nodes fire radial lasers that
 *   turn with the ring like lighthouse beams.
 * Phase 2 (nodes gone or core < 65%): the ring breaks. Surviving segments fly
 *   free as gun drones on wide orbits; the naked core starts spiralling.
 * Phase 3 (core < 35%): the core charges a massive beam down the column you
 *   are in — the telegraph locks a moment before it fires. Side-step.
 */

const Y0 = 175
const R_SEG = 94
const R_NODE = 140
/** The whole machine is painted small and drawn up-scaled. */
const K = 1.3

bossDef({
  id: 'm5_warden', hp: 24000, r: 46, sprite: 'm5_warden_core', explode: 'huge', score: 50000,
  update(e, w, dt) { wardenUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const s = e.s
    // beam telegraph: a wide column that brightens, then locks
    if (s.beamT > 0) {
      const k = 1 - s.beamT / BEAM_CHARGE
      const locked = s.beamT < BEAM_LOCK
      ctx.save()
      // normal blending: the dock hull is pale, additive fills vanish on it
      ctx.fillStyle = `rgba(200,20,100,${0.08 + 0.14 * k})`
      ctx.fillRect(s.beamX - BEAM_W / 2, e.y + 40, BEAM_W, PH)
      ctx.globalCompositeOperation = 'lighter'
      ctx.strokeStyle = `rgba(255,46,136,${locked ? 0.9 : 0.35 + 0.3 * k})`
      ctx.lineWidth = locked ? 2.5 : 1.5
      ctx.setLineDash(locked ? [] : [12, 8]); ctx.lineDashOffset = -w.time * 90
      ctx.beginPath()
      ctx.moveTo(s.beamX - BEAM_W / 2, e.y + 40); ctx.lineTo(s.beamX - BEAM_W / 2, PH)
      ctx.moveTo(s.beamX + BEAM_W / 2, e.y + 40); ctx.lineTo(s.beamX + BEAM_W / 2, PH)
      ctx.stroke()
      ctx.setLineDash([])
      const g = ctx.createRadialGradient(e.x, e.y + 30, 2, e.x, e.y + 30, 20 + k * 40)
      g.addColorStop(0, 'rgba(255,255,255,0.9)')
      g.addColorStop(0.4, `rgba(118,242,255,${0.5 * k})`)
      g.addColorStop(1, 'rgba(118,242,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, e.y + 30, 20 + k * 40, 0, TAU); ctx.fill()
      ctx.restore()
    }
    // dark backing so the machine reads against the pale hull
    const sh = ctx.createRadialGradient(e.x, e.y + 12, 20, e.x, e.y + 12, s.phase === 1 ? R_NODE + 30 : 90)
    sh.addColorStop(0, 'rgba(10,8,20,0.55)')
    sh.addColorStop(1, 'rgba(10,8,20,0)')
    ctx.fillStyle = sh
    ctx.beginPath(); ctx.arc(e.x, e.y + 12, s.phase === 1 ? R_NODE + 30 : 90, 0, TAU); ctx.fill()
    // ring track while the ring holds
    if (s.phase === 1) {
      ctx.strokeStyle = 'rgba(21,19,28,0.8)'; ctx.lineWidth = 6
      ctx.beginPath(); ctx.arc(e.x, e.y, R_SEG, 0, TAU); ctx.stroke()
      ctx.strokeStyle = 'rgba(118,242,255,0.25)'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(e.x, e.y, R_SEG, 0, TAU); ctx.stroke()
      ctx.strokeStyle = 'rgba(21,19,28,0.6)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(e.x, e.y, R_NODE, 0, TAU); ctx.stroke()
    }
    drawSprite(ctx, getSprite('m5_warden_core'), e.x, e.y, s.phase >= 2 ? w.time * 0.6 : 0, K, 1, e.flash)
  },
  onDeath(e, w) {
    for (let i = 0; i < 5; i++) w.after(i * 0.3, () => {
      const a = rand(0, TAU)
      explode(w, e.x + Math.cos(a) * 60, e.y + Math.sin(a) * 60, 'large')
    })
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU
      w.parts.spawn(P.Debris, e.x + Math.cos(a) * R_SEG, e.y + Math.sin(a) * R_SEG, Math.cos(a) * 320, Math.sin(a) * 320, 1.4, 7, 1, C.smokeLight, 0.8)
    }
    for (let k = 0; k < 3; k++) w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.7 + k * 0.3, 30, 300 + k * 120, k === 1 ? C.cyan : C.white)
  },
})

const BEAM_CHARGE = 2.0
const BEAM_LOCK = 0.75
const BEAM_W = 104

bossDef({
  id: 'm5_warden_seg', hp: 950, r: 19, sprite: 'm5_warden_seg', explode: 'medium', score: 1500,
  update(e, w, dt) { segUpdate(e, w, dt) },
  drawBody(ctx, e) {
    if (e.s.drone) {
      const a = e.s.face ?? 0
      drawSprite(ctx, getSprite('m5_drone_thrust'), e.x - Math.cos(a) * 20, e.y - Math.sin(a) * 20, a + Math.PI / 2, K, 0.8)
    }
    drawSprite(ctx, getSprite('m5_warden_seg'), e.x, e.y, (e.s.face ?? 0) + Math.PI / 2, K, 1, e.flash)
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

bossDef({
  id: 'm5_warden_node', hp: 1400, r: 17, sprite: 'm5_warden_node', explode: 'large', score: 2500,
  update(e, w, dt) {
    const root = e.parent!
    const a = (root.s.ring ?? 0) + e.s.slot * (TAU / 4) + TAU / 16
    e.x = root.x + Math.cos(a) * R_NODE
    e.y = root.y + Math.sin(a) * R_NODE
    e.s.face = a
    if (root.s.intro) return
    // one node at a time, only when facing into the playfield
    e.s.t = (e.s.t ?? 1.2 + e.s.slot * 1.6) - dt * w.diff.fireRate
    const facingDown = Math.sin(a) > 0.25
    if (e.s.t <= 0 && facingDown) {
      e.s.t = 6.4
      const warn = 1.0, life = 1.8
      w.laser(e.x, e.y, a, 760, 12, warn, life, e, root.s.spin)
    }
  },
  drawBody(ctx, e) { drawSprite(ctx, getSprite('m5_warden_node'), e.x, e.y, (e.s.face ?? 0) + Math.PI / 2, K, 1, e.flash) },
  onDeath(e, w) { partDown(w, e) },
})

function segUpdate(e: Enemy, w: World, dt: number) {
  const root = e.parent!
  const s = e.s
  if (!s.drone) {
    const a = (root.s.ring ?? 0) + s.slot * (TAU / 8)
    e.x = root.x + Math.cos(a) * R_SEG
    e.y = root.y + Math.sin(a) * R_SEG
    s.face = a
    if (root.s.intro) return
    s.f = (s.f ?? 1 + s.slot * 0.4) - dt * w.diff.fireRate
    if (s.f <= 0) {
      s.f = 2.5
      if (Math.sin(a) > 0.2 && e.y < w.player.y - 60) w.fire(e.x, e.y, a, 170, BulletKind.Orb, 10)
    }
    return
  }
  // free drone: wide wobbling orbit around the core, facing its motion
  s.oa += dt * (0.55 + (s.slot % 3) * 0.12) * (s.slot % 2 ? 1 : -1)
  const rr = s.orad + Math.sin(w.time * 1.3 + s.slot) * 30
  const tx = root.x + Math.cos(s.oa) * rr, ty = root.y + 40 + Math.sin(s.oa) * rr * 0.6
  // the world snaps parented parts onto the root each frame; drones keep their own position
  s.px += (tx - s.px) * Math.min(1, dt * 2.5)
  s.py += (ty - s.py) * Math.min(1, dt * 2.5)
  e.x = s.px; e.y = s.py
  s.face = Math.atan2(w.player.y - e.y, w.player.x - e.x)
  s.f = (s.f ?? 1 + s.slot * 0.5) - dt * w.diff.fireRate
  if (s.f <= 0) {
    s.f = 2.8
    if (e.y < w.player.y - 70) aimed(w, e.x, e.y, 200, 3, 0.12, BulletKind.Needle, 10)
  }
}

function breakRing(e: Enemy, w: World) {
  const segs = alive(w.bossParts, 'seg')
  phaseShift(w, 'THE RING WAS A KINDNESS. NOW YOU MEET ITS TEETH.')
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU)
    w.parts.spawn(P.Spark, e.x + Math.cos(a) * R_SEG, e.y + Math.sin(a) * R_SEG, Math.cos(a) * 300, Math.sin(a) * 300, 0.5, 2, 0.5, C.cyan, 2)
  }
  w.lasers.length = 0
  for (const n of alive(w.bossParts, 'node')) w.kill(n)
  let drones = segs
  // a stripped ring still sends out at least four
  const missing = Math.max(0, 4 - segs.length)
  for (let i = 0; i < missing; i++) {
    const d = w.spawn('m5_warden_seg', e.x, e.y, { parent: e, tag: 'seg', hp: 450 })
    d.bossPart = true; d.noCull = true
    w.bossParts.push(d)
    drones = [...drones, d]
  }
  drones.forEach((d, i) => {
    d.s.drone = 1
    d.s.px = d.x; d.s.py = d.y
    d.s.slot = i
    d.s.oa = (i / drones.length) * TAU
    d.s.orad = 150 + (i % 2) * 40
    d.s.f = 1.5 + i * 0.4
  })
}

function wardenUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  s.spin = s.phase === 1 ? 0.42 : 0
  s.ring = (s.ring ?? 0) + s.spin * dt
  if (s.intro) {
    e.y += (Y0 - e.y) * Math.min(1, dt * 0.8)
    if (Math.abs(e.y - Y0) < 3) s.intro = 0
    return
  }
  if (s.phase === 1 && (alive(w.bossParts, 'node').length === 0 || e.hp < e.maxHp * 0.65)) {
    s.phase = 2
    breakRing(e, w)
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.35) {
    s.phase = 3
    phaseShift(w, 'STAND STILL. IT WILL BE QUICK.')
    s.beamCd = 1.5
  }

  // movement: holds centre while the ring turns, drifts once broken, stops to charge
  if (!(s.beamT > 0)) {
    const tx = PW / 2 + (s.phase === 1 ? Math.sin(s.time * 0.4) * 40 : Math.sin(s.time * 0.5) * 110)
    e.x += clamp((tx - e.x) * 1.5, -70, 70) * dt
  }
  e.y += (Y0 + (s.phase >= 2 ? Math.sin(s.time * 0.7) * 20 : 0) - e.y) * Math.min(1, dt)

  if (s.phase === 1) {
    s.aimT = (s.aimT ?? 2) - dt * w.diff.fireRate
    if (s.aimT <= 0) { s.aimT = 2.6; aimed(w, e.x, e.y + 20, 210, 3, 0.18, BulletKind.Orb, 12) }
  } else {
    s.cyc = (s.cyc ?? 0) + dt
    if (s.cyc % 6 < 2.4 && !(s.beamT > 0)) spiral(w, e, dt, s.phase === 3 ? 10 : 12, s.phase === 3 ? 2 : 3, 1.7, 150)
    s.ringT = (s.ringT ?? 3) - dt * w.diff.fireRate
    if (s.ringT <= 0) { s.ringT = s.phase === 3 ? 5.5 : 4; ring(w, e.x, e.y, 18, 120, rand(0, TAU), BulletKind.Big, 14) }
  }

  if (s.phase === 3) {
    if (s.beamT > 0) {
      s.beamT -= dt
      if (s.beamT > BEAM_LOCK) s.beamX += clamp(w.player.x - s.beamX, -160 * dt, 160 * dt)
      else if (!s.beamLive) {
        // locked: the column becomes a real (still harmless) laser so it reads as one
        s.beamLive = 1
        w.laser(s.beamX, e.y + 40, Math.PI / 2, PH, BEAM_W, s.beamT, 1.3, null, 0)
      }
      if (s.beamT <= 0) {
        s.beamT = 0
        s.beamLive = 0
        w.addShake(14)
        w.flashScreen = 0.25
        for (let i = 0; i < 30; i++) w.parts.spawn(P.Spark, s.beamX + rand(-BEAM_W / 2, BEAM_W / 2), rand(e.y + 60, PH), rand(-80, 80), rand(-40, 40), 0.5, 2.5, 0.5, i % 2 ? C.white : C.magenta, 2)
        s.beamCd = 5.5
      }
    } else {
      s.beamCd -= dt * w.diff.fireRate
      if (s.beamCd <= 0) {
        s.beamT = BEAM_CHARGE
        s.beamX = clamp(w.player.x, BEAM_W / 2, PW - BEAM_W / 2)
        w.emit({ type: 'radio', who: 'KESTREL', text: s.beamSaid ? 'Again!' : 'It is charging something big. Move!' })
        s.beamSaid = 1
      }
    }
  }
}

export function spawnWarden(w: World) {
  const e = w.spawn('m5_warden', PW / 2, -180)
  e.s.intro = 1
  e.s.phase = 1
  const parts: Enemy[] = []
  for (let i = 0; i < 8; i++) {
    const p = w.spawn('m5_warden_seg', e.x, e.y, { parent: e, tag: 'seg' })
    p.s.slot = i
    parts.push(p)
  }
  for (let i = 0; i < 4; i++) {
    const p = w.spawn('m5_warden_node', e.x, e.y, { parent: e, tag: 'node' })
    p.s.slot = i
    parts.push(p)
  }
  startBoss(w, e, 'Warden — dock defence core', parts)
  return e
}
