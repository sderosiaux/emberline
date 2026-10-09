import type { World, Decor } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { aimed, fan, ring, shell, missile } from '../patterns'
import { explode, chainExplosion, sfxAt } from '../fx'
import { PW, PH } from '../consts'
import { rand, TAU, clamp, angleDiff } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite, glowTexture } from '../../render/sprites'

/**
 * BASTION — a colony-siege crawler. Phase 1: four shield pylons beam into the
 * body (untouchable while any lives) and twin mortars shell the approach.
 * Phase 2: the blast doors open and a lance cannon sweeps a telegraphed beam
 * across the field while side ports ripple missiles. Phase 3: it stops
 * guarding and starts walking down the player's column, spraying rings.
 * Blackout secret: if the colony grid is already dead the pylons arrive cold.
 */

/** Boss scale for the wide field (art is painted at 1×). */
const S = 1.3
const HOME_Y = 140
const PADS: [number, number][] = [[-118 * S, -64 * S], [118 * S, -64 * S], [-118 * S, 56 * S], [118 * S, 56 * S]]
const MUZZLE = 132 * S

bossDef({
  id: 'm3_bastion', hp: 7600, r: 60, sprite: 'm3_bastion_body', layer: 'ground', explode: 'large', score: 30000, z: -1,
  update(e, w, dt) { bastionUpdate(e, w, dt) },
  drawBody(ctx, e) {
    const s = e.s
    drawSprite(ctx, getSprite('m3_bastion_body'), e.x, e.y, 0, S, 1, e.flash)
    for (const [ox, oy] of PADS) drawSprite(ctx, getSprite('m3_bastion_pylon_dead'), e.x + ox, e.y + oy, 0, S, 1)
    const open = s.open ?? 0
    if (open > 0) drawSprite(ctx, getSprite('m3_bastion_cannon'), e.x, e.y + (58 + open * 30) * S, 0, S, 1, e.flash)
    const d = open * 24
    drawSprite(ctx, getSprite('m3_bastion_door'), e.x - (13 + d) * S, e.y + 71 * S, 0, S, 1, e.flash)
    drawSprite(ctx, getSprite('m3_bastion_door'), e.x + (13 + d) * S, e.y + 71 * S, 0, S, 1, e.flash)
    // charging muzzle glow before a sweep
    if (s.charge > 0) {
      const k = 1 - s.charge / 1.3
      ctx.globalCompositeOperation = 'lighter'
      ctx.drawImage(glowTexture('#ff5aa5', 64, 0.2), e.x - 39 * k - 8, e.y + MUZZLE - 39 * k - 8, 78 * k + 16, 78 * k + 16)
      ctx.globalCompositeOperation = 'source-over'
    }
  },
  draw(ctx, e, w) {
    // shield dome while any pylon feeds it
    if ((e.s.phase ?? 1) !== 1 || e.s.intro) return
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(110,225,255,${0.35 + 0.15 * Math.sin(w.time * 5)})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.ellipse(e.x, e.y - 4 * S, 70 * S, 88 * S, 0, 0, TAU); ctx.stroke()
    ctx.fillStyle = `rgba(90,200,255,${0.06 + 0.03 * Math.sin(w.time * 3)})`
    ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  },
  onDeath(e, w) { collapse(w, e.x, e.y) },
})

bossDef({
  id: 'm3_bastion_pylon', hp: 800, r: 22, scale: S, sprite: 'm3_bastion_pylon', layer: 'ground', explode: 'medium', score: 2500,
  update(e, w, dt) {
    if (e.parent!.s.intro || w.raid.stunT > 0) return
    e.s.f = (e.s.f ?? 1 + e.id % 4) - dt * w.diff.fireRate * w.raid.rate
    if (e.s.f <= 0) {
      e.s.f = 3.6
      aimed(w, e.x, e.y, 175, 2, 0.2, BulletKind.Shard, 10)
    }
  },
  draw(ctx, e, w) {
    const root = e.parent
    if (!root || root.dead) return
    // feed beam into the body
    const k = 0.55 + 0.45 * Math.sin(w.time * 9 + e.id)
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(110,225,255,${0.35 * k})`
    ctx.lineWidth = 9
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(root.x, root.y - 6 * S); ctx.stroke()
    ctx.strokeStyle = `rgba(230,252,255,${0.7 * k})`
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  },
  onDeath(e, w) {
    partDown(w, e, 'medium')
    for (let i = 0; i < 10; i++) w.parts.spawn(P.Spark, e.x, e.y, rand(-200, 200), rand(-200, 200), 0.5, 2, 0.5, C.cyan, 3, true)
    const left = alive(w.bossParts, 'pylon').filter((p) => p !== e).length
    if (left > 0 && !w.preview) w.emit({ type: 'radio', who: 'KESTREL', text: left === 1 ? 'One pylon left.' : `Pylon down. ${left} to go.` })
  },
})

bossDef({
  id: 'm3_bastion_gun', hp: 1100, r: 23, scale: S, sprite: 'm3_bastion_gun', layer: 'ground', explode: 'medium', score: 3000,
  update(e, w, dt) {
    const root = e.parent!
    const want = Math.atan2(w.player.y - e.y, w.player.x - e.x)
    const cur = e.s.aim ?? Math.PI / 2
    e.s.aim = cur + clamp(angleDiff(cur, want), -1.2 * dt, 1.2 * dt)
    e.s.recoil = Math.max(0, (e.s.recoil ?? 0) - dt * 3)
    if (root.s.intro || w.raid.stunT > 0) return
    const ph = root.s.phase ?? 1
    e.s.f = (e.s.f ?? (e.ox < 0 ? 1.5 : 3.3)) - dt * w.diff.fireRate * w.raid.rate
    if (e.s.f <= 0) {
      e.s.f = ph >= 3 ? 2.8 : 3.6
      e.s.recoil = 1
      const tx = w.player.x + rand(-90, 90), ty = w.player.y - rand(40, 110)
      shell(w, e.x + Math.cos(e.s.aim) * 22 * S, e.y + Math.sin(e.s.aim) * 22 * S, tx, ty, 185, ph >= 3 ? 10 : 8)
      if (w.diff.sharp) w.after(0.35, () => { if (!e.dead) shell(w, e.x, e.y, tx + rand(-120, 120), ty - 50, 185, 6) })
      w.parts.spawn(P.Smoke, e.x, e.y + 20 * S, 0, 30, 0.8, 6, 20, C.smokeLight, 1, true)
    }
  },
  drawBody(ctx, e) {
    drawSprite(ctx, getSprite('m3_bastion_gun'), e.x, e.y, 0, S, 1, e.flash)
    const a = e.s.aim ?? Math.PI / 2, rc = (e.s.recoil ?? 0) * 5 * S
    drawSprite(ctx, getSprite('m3_bastion_gun_barrel'), e.x - Math.cos(a) * rc, e.y - Math.sin(a) * rc, a - Math.PI / 2, S, 1, e.flash)
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

function bastionUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  if (s.intro) {
    e.y += Math.min(46 * dt, HOME_Y - e.y)
    treadDust(e, w, 1)
    if (e.y >= HOME_Y - 0.5) {
      s.intro = 0
      if (s.blackout) {
        w.emit({ type: 'radio', who: 'HALLORAN', text: 'Its shield pylons are dark. It was drinking from the colony grid, and you cut the grid.' })
        w.secret('blackout', 'Colony grid blacked out')
      }
    }
    return
  }
  const parts = w.bossParts

  if (s.phase === 1 && alive(parts, 'pylon').length === 0) {
    s.phase = 2
    e.armor = 1
    s.laserT = 2.5
    phaseShift(w, s.blackout ? 'DARK. DARK. THEN WE WILL SING WITHOUT LIGHT.' : 'THE WALLS FALL. THE MOUTH OPENS.')
    w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.6, 40, 220, C.cyan)
  }
  if (s.phase === 2 && e.hp < e.maxHp * 0.35) {
    s.phase = 3
    phaseShift(w, 'IF THE WALL CANNOT HOLD, THE WALL WILL WALK.')
    s.ringT = 1; s.burstT = 2
  }
  if (s.phase >= 2) s.open = Math.min(1, (s.open ?? 0) + dt * 0.8)
  // auto-targeting (homing, arcs) should not waste itself on the shielded body
  s.cloak = e.armor <= 0 ? 1 : 0

  // movement: guard sway, then the walk
  if (s.phase >= 3) {
    const tx = clamp(w.player.x, 200, PW - 200)
    const vx = clamp(tx - e.x, -45, 45)
    e.x += vx * dt
    e.y = Math.min(HOME_Y + 40, e.y + 5 * dt)
    treadDust(e, w, Math.abs(vx) > 5 ? 1 : 0.3)
    if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x + rand(-78, 78), e.y + rand(-78, 78), 0, -30, 1.2, 8, 26, C.smokeDark, 0.5)
  } else {
    const tx = PW / 2 + Math.sin(s.time * 0.35) * 105
    const vx = clamp(tx - e.x, -30, 30)
    e.x += vx * dt
    treadDust(e, w, 0.3)
  }
  for (const p of parts) if (p !== e && !p.dead) { p.x = e.x + p.ox; p.y = e.y + p.oy }

  const raid = w.raid
  if (raid.stunT > 0) {
    if (Math.random() < 0.5) w.parts.spawn(P.Spark, e.x + rand(-60, 60) * S, e.y + rand(-50, 50) * S, rand(-120, 120), rand(-160, 40), 0.4, 2, 0.5, C.cyan, 3)
    return
  }
  const rate = w.diff.fireRate * raid.rate
  const tick = (k: string, first: number) => (s[k] = (s[k] ?? first) - dt * rate)

  // Frost Mortar: a grid of blasts around you (phases 1-2)
  if (s.phase <= 2 && tick('mortarT', 4) <= 0 && raid.ready()) {
    s.mortarT = 10
    raid.begin(w, 'Frost Mortar', 1.0, (ww) => frostMortar(ww), { warn: 'Frost Mortar — find the gap' })
  }

  // phase 1: the keep lobs slow fans over the shield; a pylon channels a shield surge
  if (s.phase === 1) {
    if (tick('fanT', 2) <= 0) { s.fanT = 4.4; fan(w, e.x, e.y + 20 * S, Math.PI / 2, 9, 1.5, 140, BulletKind.Orb, 10) }
    const pylons = alive(parts, 'pylon')
    if (pylons.length && tick('surgeT', 7) <= 0 && raid.ready()) {
      s.surgeT = 12
      const pick = pylons[Math.floor(Math.random() * pylons.length)]
      raid.begin(w, 'Shield Surge', 3.2, (ww) => shieldSurge(ww), { kick: { target: pick }, warn: 'Interrupt — burst the marked pylon!' })
    }
    return
  }

  // phase 2+: lance sweeps + missile ripples
  if (s.charge > 0) s.charge -= dt
  s.laserT -= dt * rate
  if (s.laserT <= 0 && (s.open ?? 0) >= 1 && raid.ready()) {
    s.laserT = s.phase >= 3 ? 10 : 7.5
    raid.begin(w, 'Lance Sweep', 1.3, () => {})
    lanceSweep(e, w)
  }
  if (tick('shellT', 8) <= 0 && raid.ready()) {
    s.shellT = 16
    const x = clamp(w.player.x + rand(-230, 230), 100, PW - 100), y = rand(PH * 0.55, PH * 0.8)
    raid.begin(w, 'Siege Shell', 0.8, (ww) => ww.raid.zone({ x, y, r: 80, kind: 'soak', delay: 3.4, dmg: 42 }), { warn: 'Siege Shell — soak it!' })
  }
  if (s.phase >= 3 && tick('tremorT', 3) <= 0 && raid.ready()) {
    s.tremorT = 8
    raid.begin(w, 'Tremor', 0.9, (ww) => tremor(ww, e), { warn: 'Tremor — sidestep the line' })
  }
  s.misT = (s.misT ?? 4) - dt * rate
  if (s.misT <= 0) {
    s.misT = s.phase >= 3 ? 6 : 4.5
    for (let i = 0; i < 4; i++) {
      w.after(i * 0.2, () => {
        if (e.dead) return
        const side = i % 2 ? 1 : -1
        missile(w, e.x + side * 78 * S, e.y + 20 * S, Math.PI / 2 + side * 1.1, 135, 1.5, 8)
      })
    }
  }
  if (s.phase === 2) {
    s.pulseT = (s.pulseT ?? 3) - dt * rate
    if (s.pulseT <= 0) { s.pulseT = 5; ring(w, e.x, e.y - 6 * S, 16, 120, rand(0, TAU)) }
  }
  if (s.phase >= 3) {
    s.ringT -= dt * rate
    if (s.ringT <= 0) {
      s.ringT = 2.5
      s.ringN = (s.ringN ?? 0) + 1
      ring(w, e.x, e.y - 6 * S, 18, 125, s.ringN * 0.17, s.ringN % 2 ? BulletKind.Orb : BulletKind.Ring, 10)
    }
    s.burstT -= dt * rate
    if (s.burstT <= 0) {
      s.burstT = 1.9
      aimed(w, e.x, e.y + MUZZLE - 10, 235, 5, 0.1, BulletKind.Needle, 12)
    }
  }
}

/** Staggered grid of blasts around the player, with one cell left open. */
function frostMortar(w: World) {
  const p = w.player
  const open = Math.floor(rand(0, 9))
  let k = 0
  for (let gy = -1; gy <= 1; gy++) for (let gx = -1; gx <= 1; gx++) {
    const i = k++
    if (i === open) continue
    const x = clamp(p.x + gx * 95, 40, PW - 40), y = clamp(p.y + gy * 80, PH * 0.35, PH - 30)
    w.raid.zone({ x, y, r: 54, kind: 'blast', delay: 1.5 + (i % 3) * 0.12, dmg: 20 })
  }
}

/** Failed Shield Surge: every living pylon recovers 40% and pulses a ring. */
function shieldSurge(w: World) {
  for (const p of alive(w.bossParts, 'pylon')) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4)
    ring(w, p.x, p.y, 12, 130, rand(0, TAU), BulletKind.Shard, 10)
    w.parts.spawn(P.Ring, p.x, p.y, 0, 0, 0.5, 10, 90, C.cyan)
  }
  w.flashScreen = Math.max(w.flashScreen, 0.25)
}

/** A line of ground blasts running from the crawler toward the player. */
function tremor(w: World, e: Enemy) {
  const ax = e.x, ay = e.y + 80 * S
  const a = Math.atan2(w.player.y - ay, w.player.x - ax)
  for (let i = 1; i <= 8; i++) {
    const d = i * 70
    const x = ax + Math.cos(a) * d, y = ay + Math.sin(a) * d
    if (y > PH + 20 || x < -20 || x > PW + 20) break
    w.raid.zone({ x, y, r: 46, kind: 'blast', delay: 1.0 + i * 0.12, dmg: 22 })
  }
}

/** Telegraphed sweep: the dashed line crosses the field first, then the beam follows. Far side of the arc is safe. */
function lanceSweep(e: Enemy, w: World) {
  const dir = w.player.x < e.x ? 1 : -1 // start on the side away from the player, sweep toward them
  const start = Math.PI / 2 - dir * 1.45
  const sweep = dir * 0.49
  e.s.charge = 1.3
  w.laser(e.x, e.y + MUZZLE, start, 1000, 22, 1.3, 2.5, e, sweep)
  sfxAt('boss_phase', e.x, 0.25, 1.6)
}

function treadDust(e: Enemy, w: World, k: number) {
  if (Math.random() < 0.5 * k) {
    const side = Math.random() < 0.5 ? -1 : 1
    w.parts.spawn(P.Smoke, e.x + side * 84 * S + rand(-14, 14), e.y + (Math.random() < 0.5 ? -20 : 90) * S, rand(-20, 20), 20, 1.1, 6, 20, C.ice, 1, true)
  }
}

/** Big collapse: the body sags into rubble under a column of dust and fire. */
function collapse(w: World, x: number, y: number) {
  const mk = (sprite: string, alpha: number): Decor => ({ sprite, x, y, rot: 0, scale: S, depth: 0, vx: 0, alpha, above: false })
  const rub = mk('m3_bastion_rubble', 0), body = mk('m3_bastion_body', 1)
  w.decor.push(rub, body)
  const t0 = w.time
  const tick = () => {
    const t = w.time - t0
    const k = clamp((t - 0.8) / 2, 0, 1)
    body.alpha = 1 - k
    body.scale = S * (1 - k * 0.08)
    body.x = x + (Math.random() - 0.5) * 6 * (1 - k)
    rub.alpha = k
    if (Math.random() < 0.7) w.parts.spawn(P.Smoke, x + rand(-156, 156), y + rand(-117, 117), rand(-30, 30), -20, 1.8, 12, 44, C.ice, 0.6, true)
    if (Math.random() < 0.1 && t < 2.6) explode(w, x + rand(-143, 143), y + rand(-117, 117), 'medium', true, C.orange, true)
    if (t < 3.2) w.after(0.03, tick)
    else body.y = 9999
  }
  tick()
  w.after(1.2, () => chainExplosion(w, x, y + 78, 117, 10, 1.1, 'large'))
  w.after(2, () => { for (let i = 0; i < 3; i++) w.parts.spawn(P.Ring, x, y, 0, 0, 1 + i * 0.3, 60, (300 + i * 90) * S, C.ice, 0, true) })
}

export function spawnBastion(w: World, blackout: boolean) {
  const e = w.spawn('m3_bastion', PW / 2, -190)
  e.s.intro = 1
  e.s.phase = 1
  e.s.blackout = blackout ? 1 : 0
  e.armor = 0
  e.s.cloak = 1
  const parts: Enemy[] = []
  for (const ox of [-62 * S, 62 * S]) parts.push(w.spawn('m3_bastion_gun', e.x + ox, e.y - 40 * S, { parent: e, ox, oy: -40 * S, tag: 'gun' }))
  if (!blackout) for (const [ox, oy] of PADS) parts.push(w.spawn('m3_bastion_pylon', e.x + ox, e.y + oy, { parent: e, ox, oy, tag: 'pylon' }))
  startBoss(w, e, 'Bastion — colony siege crawler', parts, false, 210)
  return e
}
