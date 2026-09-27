import type { World, Decor } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import type { Mover } from '../movers'
import { GroundMover } from '../movers'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { aimed, ring, missile, fan, enemySfx } from '../patterns'
import { explode, chainExplosion, sfxAt } from '../fx'
import { PW } from '../consts'
import { rand, TAU, clamp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * TIDEBREAKER — a leviathan Choir submarine. Phase 1: torpedo tubes, a missile
 * battery and the conning tower do the fighting; every so often it DIVES
 * (untouchable, only a shadow and a wake), seeds mines, calls gunboats and
 * breaches somewhere else. Kill the tower and the keel gives: the hull splits,
 * the core is exposed, and it can no longer dive. Under 35% it spins the sea
 * into a whirlpool of curving shots.
 */

/** Root sits on the core; the hull sprite is drawn this far above it. */
const HULL = -40
const HOME_Y = 245
const enum Mode { Intro, Up, Diving, Under, Rising }

const sub = (e: Enemy) => (e.parent ?? e).s.sub ?? 0

bossDef({
  id: 'm2_tidebreaker', hp: 4400, r: 60, sprite: 'm2_tide_hull', layer: 'ground', explode: 'large', score: 25000, z: -1,
  update(e, w, dt) { tideUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const s = e.s
    const k = s.sub ?? 0
    if (k > 0.02) {
      // wake + shadow while submerged
      drawSprite(ctx, getSprite('m2_tide_shadow'), e.x + 4, e.y + HULL + 8, 0, 1, Math.min(1, k * 1.3))
    }
    const a = 1 - k * 0.92
    if (a <= 0.03) return
    if ((s.phase ?? 1) >= 2) {
      const sp = (s.split ?? 0) * 16
      drawSprite(ctx, getSprite('m2_tide_hull_l'), e.x - sp, e.y + HULL, -sp * 0.002, 1, a, e.flash)
      drawSprite(ctx, getSprite('m2_tide_hull_r'), e.x + sp, e.y + HULL, sp * 0.002, 1, a, e.flash)
      // exposed core between the halves
      const pulse = 0.75 + 0.25 * Math.sin(w.time * 6)
      ctx.globalCompositeOperation = 'lighter'
      const g = ctx.createRadialGradient(e.x, e.y, 4, e.x, e.y, 70)
      g.addColorStop(0, `rgba(200,255,240,${0.5 * pulse})`)
      g.addColorStop(0.5, `rgba(60,200,180,${0.22 * pulse})`)
      g.addColorStop(1, 'rgba(0,80,90,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(e.x, e.y, 70, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      drawSprite(ctx, getSprite('m2_tide_core'), e.x, e.y, 0, 0.9 + 0.08 * pulse * (s.split ?? 0), a, e.flash)
    } else {
      drawSprite(ctx, getSprite('m2_tide_hull'), e.x, e.y + HULL, 0, 1, a, e.flash)
    }
  },
  onDeath(e, w) { sinkingWreck(w, e.x, e.y + HULL, (e.s.split ?? 0) * 16) },
})

bossDef({
  id: 'm2_tide_tower', hp: 1700, r: 24, sprite: 'm2_tide_tower', layer: 'ground', explode: 'large', score: 4000,
  update(e, w, dt) {
    if (!partActive(e)) return
    const ph = e.parent!.s.phase ?? 1
    e.s.f = (e.s.f ?? 1.2) - dt * w.diff.fireRate
    if (e.s.f <= 0) {
      e.s.f = 2.3
      e.s.n = (e.s.n ?? 0) + 1
      if (e.s.n % 3 === 0) fan(w, e.x, e.y + 40, Math.PI / 2, 9, 1.6, 150, BulletKind.Needle, 10)
      else aimed(w, e.x, e.y + 40, 205, 3, 0.16)
      if (w.diff.sharp && ph === 1) w.after(0.3, () => { if (!e.dead) aimed(w, e.x, e.y + 40, 230, 2, 0.1) })
    }
  },
  drawBody: (ctx, e) => drawPart(ctx, e, 'm2_tide_tower'),
  onDeath(e, w) {
    partDown(w, e)
    chainExplosion(w, e.x, e.y, 30, 6, 0.6, 'large')
  },
})

bossDef({
  id: 'm2_tide_tube', hp: 850, r: 20, sprite: 'm2_tide_tube', layer: 'ground', explode: 'medium', score: 2500,
  update(e, w, dt) {
    if (!partActive(e)) { e.s.charge = 0; return }
    const ph = e.parent!.s.phase ?? 1
    if (e.s.charge > 0) {
      e.s.charge -= dt
      if (Math.random() < 0.5) w.parts.spawn(P.Glow, e.x + rand(-8, 8), e.y + 22, 0, 30, 0.2, 5, 1, C.ice)
      if (e.s.charge <= 0) torpedoes(e, w, ph)
      return
    }
    e.s.f = (e.s.f ?? (e.ox < 0 ? 1.8 : 3.4)) - dt * w.diff.fireRate
    if (e.s.f <= 0) {
      e.s.f = ph >= 2 ? 3 : 3.8
      e.s.charge = 0.75
      e.s.ang = clamp(w.aim(e.x, e.y + 24, 200), Math.PI / 2 - 0.55, Math.PI / 2 + 0.55)
    }
  },
  drawBody: (ctx, e) => drawPart(ctx, e, 'm2_tide_tube'),
  draw(ctx, e, w) {
    // aim telegraph: two faint lanes where the torpedoes will run
    if (!(e.s.charge > 0)) return
    const a = e.s.ang, k = 1 - e.s.charge / 0.75
    ctx.strokeStyle = `rgba(190,240,255,${0.2 + 0.4 * k})`
    ctx.lineWidth = 1.5
    ctx.setLineDash([8, 8])
    ctx.lineDashOffset = -w.time * 60
    for (const s of [-1, 1]) {
      const x0 = e.x + s * 6, y0 = e.y + 24
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * 700, y0 + Math.sin(a) * 700); ctx.stroke()
    }
    ctx.setLineDash([])
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

bossDef({
  id: 'm2_tide_vls', hp: 1100, r: 26, sprite: 'm2_tide_vls', layer: 'ground', explode: 'medium', score: 3000,
  update(e, w, dt) {
    e.s.open = Math.max(0, (e.s.open ?? 0) - dt)
    if (!partActive(e)) return
    const ph = e.parent!.s.phase ?? 1
    e.s.f = (e.s.f ?? 2.6) - dt * w.diff.fireRate
    if (e.s.f <= 0) {
      e.s.f = ph >= 2 ? 4.2 : 5.2
      e.s.open = 1.2
      const n = ph >= 2 ? 6 : 4
      for (let i = 0; i < n; i++) {
        w.after(i * 0.16, () => {
          if (e.dead || !partActive(e)) return
          const side = i % 2 ? 1 : -1
          missile(w, e.x + side * 14, e.y, -Math.PI / 2 + side * (0.6 + (i >> 1) * 0.35), 125, 1.45, 8)
        })
      }
    }
  },
  drawBody(ctx, e) {
    drawPart(ctx, e, 'm2_tide_vls')
    if (e.s.open > 0 && sub(e) < 0.3) drawSprite(ctx, getSprite('m2_tide_vls_open'), e.x, e.y, 0, 1, Math.min(1, e.s.open * 3))
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

function partActive(e: Enemy) {
  const root = e.parent
  if (!root) return false
  const k = root.s.sub ?? 0
  e.hidden = k > 0.55
  return k < 0.12 && root.s.mode === Mode.Up
}

function drawPart(ctx: CanvasRenderingContext2D, e: Enemy, key: string) {
  const a = 1 - sub(e) * 1.6
  if (a <= 0.02) return
  drawSprite(ctx, getSprite(key), e.x, e.y, 0, 1, a, e.flash)
}

function torpedoes(e: Enemy, w: World, ph: number) {
  const a = e.s.ang
  for (const s of [-1, 1]) {
    const b = w.fire(e.x + s * 6, e.y + 24, a, 40, BulletKind.Missile, 16)
    if (!b) continue
    b.ax = Math.cos(a) * 300; b.ay = Math.sin(a) * 300
    b.maxSpeed = ph >= 2 ? 320 : 290
    b.hp = 10
    b.ttl = 5
  }
  for (let i = 0; i < 6; i++) w.parts.spawn(P.Smoke, e.x + rand(-8, 8), e.y + 24, rand(-30, 30), rand(20, 60), 0.6, 4, 12, C.ice, 1, true)
  enemySfx(w, e.x, true)
}

// ───────────────────────── root behaviour ─────────────────────────

function tideUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  if (s.mode === Mode.Intro) {
    e.y += (HOME_Y - e.y) * Math.min(1, dt * 0.7)
    wake(e, w, 1)
    if (Math.abs(e.y - HOME_Y) < 8) { s.mode = Mode.Rising; s.t = 2 }
    return
  }
  const parts = w.bossParts

  // phase transitions
  if (s.phase === 1 && alive(parts, 'tower').length === 0) {
    s.phase = 2
    e.armor = 1
    if (s.mode !== Mode.Up) { s.mode = Mode.Rising; s.t = 1 }
    phaseShift(w, 'THE KEEL BREAKS. THE DEEP LOOKS UP AT YOU.')
    chainExplosion(w, e.x, e.y, 40, 8, 0.8, 'large')
    e.r = 30
    for (let i = 0; i < 30; i++) w.parts.spawn(P.Smoke, e.x + rand(-10, 10), e.y + HULL + rand(-120, 160), rand(-80, 80), rand(-40, 40), 1.4, 8, 30, C.ice, 1)
    s.geyser = 3; s.pulse = 2
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.35) {
    s.phase = 3
    phaseShift(w, 'COME DOWN. EVERYTHING COMES DOWN.')
    s.whirl = 0; s.whirlDir = 1
  }
  if (s.phase >= 2) s.split = Math.min(1, (s.split ?? 0) + dt * 0.7)
  // auto-targeting (homing, arcs) should not waste itself on the armoured hull
  s.cloak = e.armor <= 0 ? 1 : 0

  // submerge state machine (only while the keel is whole)
  switch (s.mode) {
    case Mode.Up:
      s.t -= dt
      if (s.phase === 1 && s.t <= 0) {
        s.mode = Mode.Diving; s.t = 1.6
        if (!s.dove) { s.dove = 1; w.emit({ type: 'radio', who: 'KESTREL', text: "It's diving. Can't touch it down there." }) }
        sfxAt('enemy_laser_charge', e.x, 0.5, 0.5)
      }
      break
    case Mode.Diving:
      s.sub = Math.min(1, s.sub + dt / 1.6)
      foam(e, w, 0.8)
      if (s.sub >= 1) {
        s.mode = Mode.Under; s.t = 6
        s.tx = e.x < PW / 2 ? rand(PW * 0.58, PW - 110) : rand(110, PW * 0.42)
        underwaterCall(e, w)
      }
      break
    case Mode.Under:
      s.t -= dt
      e.x += clamp(s.tx - e.x, -75 * dt, 75 * dt)
      wake(e, w, 0.6)
      if (s.t <= 0) { s.mode = Mode.Rising; s.t = 1.3 }
      break
    case Mode.Rising:
      s.sub = Math.max(0, s.sub - dt / 1.3)
      foam(e, w, 1)
      if (s.sub < 0.45 && !s.breached) {
        s.breached = 1
        w.addShake(10)
        for (let i = 0; i < 3; i++) w.parts.spawn(P.Ring, e.x, e.y + HULL, 0, 0, 0.7 + i * 0.2, 40, 200 + i * 60, C.ice, 0, true)
        explode(w, e.x, e.y + HULL + 150, 'medium', true, C.ice, true)
      }
      if (s.sub <= 0) { s.mode = Mode.Up; s.t = 13; s.breached = 0 }
      break
  }
  for (const p of parts) if (p !== e && !p.dead) { p.x = e.x + p.ox; p.y = e.y + p.oy }

  if (s.mode !== Mode.Up) return

  // slow sway while surfaced; broken hull lurches toward the player later
  if (s.phase >= 3) e.x += clamp(clamp(w.player.x, 120, PW - 120) - e.x, -30 * dt, 30 * dt)
  else e.x = clamp(e.x + Math.cos(s.time * 0.4) * 14 * dt, 100, PW - 100)
  if (s.phase === 1) return
  if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x + rand(-12, 12), e.y + rand(-120, 100), 0, -20, 1, 5, 18, C.smokeLight, 0.5)

  // phase 2+: pressure pulses from the core + geysers around the player
  s.pulse -= dt * w.diff.fireRate
  if (s.pulse <= 0) {
    s.pulse = s.phase >= 3 ? 4.2 : 3.1
    s.pulseN = (s.pulseN ?? 0) + 1
    ring(w, e.x, e.y, s.phase >= 3 ? 12 : 16, 115, s.pulseN * 0.2, BulletKind.Big, 14)
  }
  s.geyser -= dt * w.diff.fireRate
  if (s.geyser <= 0) {
    s.geyser = s.phase >= 3 ? 6.5 : 4.8
    const px = w.player.x, py = w.player.y
    const spots: [number, number][] = [[px - 120, py - 150], [px + 120, py - 150], [px, py - 260]]
    for (const [x, y] of spots) geyser(w, clamp(x, 30, PW - 30), clamp(y, 260, 560))
  }
  if (s.phase >= 3) whirlpool(e, w, dt)
}

function whirlpool(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.whirl += dt
  const cyc = s.whirl % 5
  if (cyc < 0.05 && s.whirl > 1) s.whirlDir = -(s.whirlDir ?? 1)
  if (cyc > 3.3) return // gap: breathe
  s.wa = (s.wa ?? 0) + dt * 1.5 * s.whirlDir
  s.wt = (s.wt ?? 0) - dt * w.diff.fireRate
  if (s.wt > 0) return
  s.wt += 0.1
  for (let i = 0; i < 3; i++) {
    const a = s.wa + (i / 3) * TAU
    const b = w.fire(e.x + Math.cos(a) * 24, e.y + Math.sin(a) * 24, a, 125, BulletKind.Wave, 10)
    if (b) { b.curve = 0.5 * s.whirlDir; b.ttl = 7 }
  }
  enemySfx(w, e.x)
  s.aimT = (s.aimT ?? 2) - 0.1
  if (s.aimT <= 0) { s.aimT = 2.6; aimed(w, e.x, e.y + 30, 230, 3, 0.12, BulletKind.Needle, 12) }
}

/** Telegraphed water column: a ring of foam gathers, then bursts into a bullet ring. */
function geyser(w: World, x: number, y: number) {
  for (let i = 0; i < 4; i++) w.after(i * 0.25, () => w.parts.spawn(P.Ring, x, y, 0, 0, 0.45, 34, 8, C.ice, 0, true))
  w.after(1.15, () => {
    if (w.flags.has('boss_dead') || !w.boss || w.boss.dead) return
    for (let i = 0; i < 14; i++) w.parts.spawn(P.Smoke, x + rand(-10, 10), y + rand(-10, 10), rand(-60, 60), rand(-120, -20), 0.8, 6, 20, C.ice, 1.5)
    w.parts.spawn(P.Flash, x, y, 0, 0, 0.15, 14, 40, C.ice)
    const n = 10, off = rand(0, TAU)
    for (let i = 0; i < n; i++) {
      const b = w.fire(x, y, off + (i / n) * TAU, 105, BulletKind.Orb, 10)
      if (b) b.arm = 0.22
    }
    sfxAt('enemy_shot_heavy', x, 0.4, 0.7)
  })
}

/** While submerged: mines float up and gunboats come to cover the dive. */
function underwaterCall(e: Enemy, w: World) {
  const n = (e.s.dives = (e.s.dives ?? 0) + 1)
  const mines = 4 + Math.min(3, n)
  for (let i = 0; i < mines; i++) {
    w.after(0.3 + i * 0.35, () => {
      const x = 50 + ((i + 0.5) / mines) * (PW - 100) + rand(-20, 20)
      const m = w.spawn('mine', x, rand(90, 330), { mover: new RiseMover(18) })
      m.s.rise = 0
    })
  }
  for (const side of [-1, 1]) {
    w.after(1 + (side + 1) * 0.6, () => {
      const g = w.spawn('gunboat', side < 0 ? -30 : PW + 30, rand(160, 300), { mover: new GroundMover(-side * 55, 10) })
      g.rot = side < 0 ? -Math.PI / 2 : Math.PI / 2
    })
  }
}

/** Mine surfacing: fades in from the deep, then drifts with the current. */
class RiseMover implements Mover {
  constructor(private vy: number) {}
  update(e: Enemy, _w: World, dt: number) {
    e.s.rise = Math.min(1, (e.s.rise ?? 0) + dt * 1.4)
    e.visibleAlpha = 0.25 + 0.75 * e.s.rise
    e.scale = 0.5 + 0.5 * e.s.rise
    e.y += this.vy * dt
  }
}

function wake(e: Enemy, w: World, k: number) {
  if (Math.random() < 0.5 * k) w.parts.spawn(P.Smoke, e.x + rand(-40, 40), e.y + HULL + rand(-160, 160), 0, 12, 1.2, 5, 16, C.ice, 0.5, true)
  if (Math.random() < 0.06 * k) w.parts.spawn(P.Ring, e.x + rand(-20, 20), e.y + HULL + 180, 0, 0, 1.2, 10, 50, C.ice, 0, true)
}

function foam(e: Enemy, w: World, k: number) {
  for (let i = 0; i < 3; i++) if (Math.random() < k) {
    const side = Math.random() < 0.5 ? -1 : 1
    w.parts.spawn(P.Smoke, e.x + side * rand(40, 70), e.y + HULL + rand(-170, 170), side * rand(10, 50), rand(-20, 20), 1, 6, 22, C.ice, 1, true)
  }
}

/** Big multi-stage death: the two halves roll apart and go under, venting fire and steam. */
function sinkingWreck(w: World, x: number, y: number, split: number) {
  const mk = (sprite: string, dx: number): Decor => ({ sprite, x: x + dx, y, rot: 0, scale: 1, depth: 0, vx: 0, alpha: 1, above: false })
  const L = mk('m2_tide_hull_l', -split), R = mk('m2_tide_hull_r', split)
  w.decor.push(L, R)
  const t0 = w.time
  const tick = () => {
    const t = w.time - t0
    const k = clamp((t - 1.2) / 4, 0, 1)
    L.x = x - split - t * 10; R.x = x + split + t * 10
    L.rot = -k * 0.35; R.rot = k * 0.3
    L.scale = R.scale = 1 - k * 0.18
    L.alpha = R.alpha = 1 - k
    if (Math.random() < 0.6 && k < 0.9) w.parts.spawn(P.Smoke, x + rand(-80, 80), y + rand(-150, 150), rand(-20, 20), -30, 1.8, 10, 40, t > 2 ? C.ice : C.smokeDark, 0.4)
    if (Math.random() < 0.08 && k < 0.8) explode(w, x + rand(-60, 60), y + rand(-150, 150), 'medium', true, C.orange, true)
    if (t < 5.4) w.after(0.03, tick)
    else { L.alpha = R.alpha = 0; L.y = R.y = 9999 }
  }
  tick()
  w.after(3.2, () => { for (let i = 0; i < 4; i++) w.parts.spawn(P.Ring, x, y, 0, 0, 1.4 + i * 0.3, 60, 320 + i * 80, C.ice, 0, true) })
}

export function spawnTidebreaker(w: World) {
  const e = w.spawn('m2_tidebreaker', PW / 2, -260)
  e.s.mode = Mode.Intro
  e.s.phase = 1
  e.s.sub = 1
  e.armor = 0
  e.s.cloak = 1
  e.r = 1
  const parts: Enemy[] = []
  parts.push(w.spawn('m2_tide_vls', e.x, e.y - 150, { parent: e, ox: 0, oy: -150, tag: 'vls' }))
  parts.push(w.spawn('m2_tide_tower', e.x, e.y - 60, { parent: e, ox: 0, oy: -60, tag: 'tower' }))
  for (const ox of [-34, 34]) parts.push(w.spawn('m2_tide_tube', e.x + ox, e.y + 80, { parent: e, ox, oy: 80, tag: 'tube' }))
  for (const p of parts) p.hidden = true
  startBoss(w, e, 'Tidebreaker — leviathan submarine', parts)
  return e
}
