import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { registerEnemy } from '../../data/enemies'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { aimed, fan, missile, ring, spiral, canFire } from '../patterns'
import { explode, sparks } from '../fx'
import { LineMover } from '../movers'
import { PW, PH } from '../consts'
import { rand, TAU, clamp } from '../../core/math'
import { P, C } from '../../render/particles'
import { glowTexture, drawSprite, getSprite } from '../../render/sprites'

// ───────────────────────── shared helpers (used by m6/m7 too) ─────────────────────────

/**
 * A draw-only effect entity: parked far off-field so it can never be hit,
 * targeted or culled, but its draw/update callbacks run every frame in the
 * ground layer. Used for set-piece visuals (sinking wrecks, dormant hulks, the
 * Heart's eye) that must animate but must not behave like enemies.
 */
export interface Fx {
  update?(w: World, dt: number, fx: Enemy): void
  draw(ctx: CanvasRenderingContext2D, w: World, fx: Enemy): void
}
registerEnemy({
  id: 'm6_fx', hp: 1, r: 0, sprite: 'm6_debris_s', layer: 'ground', score: 0, credits: 0, charge: 0, explode: 'tiny', contact: 0, noShadow: true, boss: true,
  init(e) { e.noCull = true; e.armor = 0; e.s.ignoreGate = 1; e.s.civilian = 1 },
  update(e, w, dt) { e.x = -5000; e.y = -5000; (e.data as Fx).update?.(w, dt, e) },
  drawBody(ctx, e, w) { (e.data as Fx).draw(ctx, w, e) },
})
export function spawnFx(w: World, fx: Fx) {
  return w.spawn('m6_fx', -5000, -5000, { data: fx })
}

/**
 * Keeps the timeline's air gate() closed until a world flag is set. Used instead
 * of until() for mid-mission waits so debug skip-to-boss (which jumps to the
 * first flag wait) still lands on the real boss.
 */
registerEnemy({
  id: 'm6_hold', hp: 1, r: 0, sprite: 'm6_debris_s', layer: 'air', score: 0, credits: 0, charge: 0, explode: 'tiny', contact: 0, noShadow: true, boss: true,
  init(e) { e.noCull = true; e.armor = 0; e.s.civilian = 1; e.hidden = true },
  update(e, w) { e.x = -5000; e.y = -5000; if (w.flags.has(e.data as string)) e.gone = true },
})
export function holdUntil(w: World, flag: string) { w.spawn('m6_hold', -5000, -5000, { data: flag }) }

/** Drifting hull debris: slow, spinning, shootable, hurts on contact. */
for (const [id, sprite, hp, r] of [['m6_debris', 'm6_debris_m', 70, 18], ['m6_debris_s', 'm6_debris_s', 35, 13], ['m6_debris_l', 'm6_debris_l', 140, 25]] as const) {
  registerEnemy({
    id, hp, r, sprite, layer: 'air', score: 60, credits: 6, charge: 2, explode: 'small', contact: 25,
    init(e) { e.s.spin = rand(-1.4, 1.4); e.rot = rand(0, TAU); e.s.ignoreGate = 1 },
    update(e, w) {
      e.rot += e.s.spin * w.frameDt
      if (Math.random() < 0.05) w.parts.spawn(P.Spark, e.x + rand(-8, 8), e.y + rand(-8, 8), rand(-60, 60), rand(-60, 60), 0.3, 1.5, 0.5, C.orange, 2)
      if (e.y > PH + 60) e.gone = true
    },
    onDeath(e, w) {
      for (let i = 0; i < 10; i++) w.parts.spawn(P.Debris, e.x, e.y, rand(-200, 200), rand(-200, 200), rand(0.5, 1), rand(2, 6), 1, C.smokeLight, 2)
    },
  })
}

export function dropDebris(w: World, x: number, y: number, size: 'm6_debris' | 'm6_debris_s' | 'm6_debris_l' = 'm6_debris', vy = rand(45, 75)) {
  const e = w.spawn(size, x, y, { mover: new LineMover(rand(-35, 35), vy) })
  e.noCull = true
  return e
}

// ───────────────────────── REVENANT ─────────────────────────

/**
 * REVENANT — a dreadnought stitched from the graveyard. Its engines keep it
 * swinging across the field; kill them and it lists and slows, but the bow
 * clamshell opens on a spinal beam. Break the bow and the bridge itself is
 * exposed for the last stand. It sheds hull plates as debris the whole time.
 */
const ROOT_Y = 232

type Base = { bx: number; by: number }

bossDef({
  id: 'm6_revenant', hp: 8500, r: 36, sprite: 'm6_rev_hull', explode: 'large', score: 30000,
  update(e, w, dt) { revenantUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const list = e.s.list ?? 0
    ctx.save()
    ctx.translate(e.x, e.y)
    ctx.rotate(list)
    drawSprite(ctx, getSprite('m6_rev_spars'), 0, -80, 0, 1, 1, 0)
    drawSprite(ctx, getSprite('m6_rev_hull'), 0, 20, 0, 1, 1, e.flash)
    // bridge eye: dark while armoured, burning when exposed
    const open = e.armor > 0
    const k = open ? 0.75 + 0.25 * Math.sin(w.time * 10) : 0.25 + 0.1 * Math.sin(w.time * 2)
    ctx.globalCompositeOperation = 'lighter'
    const rr = open ? 34 : 18
    ctx.globalAlpha = k
    ctx.drawImage(glowTexture('#ff2e88', 64, 0.3), -rr, -rr, rr * 2, rr * 2)
    ctx.drawImage(glowTexture('#fff0f7', 64, 0.2), -rr * 0.4, -rr * 0.4, rr * 0.8, rr * 0.8)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.restore()
  },
})

bossDef({
  id: 'm6_rev_engine', hp: 2600, r: 26, sprite: 'm6_rev_engine', explode: 'large', score: 4000,
  update(e, w) {
    if (e.parent!.s.intro || e.parent!.s.dying) return
    if (Math.random() < 0.7) w.parts.spawn(P.Smoke, e.x + rand(-8, 8), e.y - 34, rand(-10, 10), -110, 0.45, 6, 16, C.violet, 0.5)
    if (!canFire(w, e)) return
    e.s.t = (e.s.t ?? (e.ox < 0 ? 1.2 : 3.2)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) {
      e.s.t = 3.4
      // stern flak: slow heavy orbs raining down with wide gaps
      fan(w, e.x, e.y + 30, Math.PI / 2 + (e.ox < 0 ? 0.25 : -0.25), 7, 1.5, 125, BulletKind.Big, 14)
    }
  },
  onDeath(e, w) { partDown(w, e) },
})

bossDef({
  id: 'm6_rev_missile', hp: 2000, r: 24, sprite: 'm6_rev_missile', explode: 'large', score: 3000,
  update(e, w) {
    const root = e.parent!
    if (root.s.intro || root.s.dying) return
    e.s.t = (e.s.t ?? (e.ox < 0 ? 2 : 4.5)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) {
      e.s.t = root.s.phase === 3 ? 4.2 : 5.6
      const side = e.ox < 0 ? -1 : 1
      for (let i = 0; i < 4; i++) w.after(i * 0.16, () => { if (!e.dead) missile(w, e.x + (i - 1.5) * 9, e.y, -Math.PI / 2 + side * (0.5 + i * 0.25), 150, 1.6, 10) })
    }
  },
  onDeath(e, w) { partDown(w, e); dropDebris(w, e.x, e.y, 'm6_debris_s') },
})

/** Stitched-on armour plates: point-defence nests that fall off as debris. */
bossDef({
  id: 'm6_rev_plate', hp: 900, r: 26, sprite: 'm6_rev_plate', explode: 'medium', score: 2000,
  update(e, w) {
    const root = e.parent!
    if (root.s.intro || root.s.dying || !canFire(w, e)) return
    e.s.t = (e.s.t ?? rand(1, 3)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) { e.s.t = 2.6; aimed(w, e.x, e.y, 180, 3, 0.25, BulletKind.Shard, 9) }
  },
  onDeath(e, w) {
    partDown(w, e, 'medium')
    dropDebris(w, e.x, e.y, 'm6_debris_l', 60)
    sparks(w, e.x, e.y, 20, C.orange, 300, 0.5)
  },
})

bossDef({
  id: 'm6_rev_turret', hp: 900, r: 17, sprite: 'm6_turret', explode: 'medium', score: 1500,
  update(e, w) {
    const root = e.parent!
    const want = Math.atan2(w.player.y - e.y, w.player.x - e.x)
    e.s.aim = want
    if (root.s.intro || root.s.dying || !canFire(w, e)) return
    e.s.t = (e.s.t ?? rand(0.8, 2.4)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) {
      e.s.t = root.s.phase === 3 ? 1.6 : 2.1
      e.s.burst = 4; e.s.bt = 0
    }
    if (e.s.burst > 0) {
      e.s.bt -= w.frameDt
      if (e.s.bt <= 0) { e.s.burst--; e.s.bt = 0.14; w.fire(e.x + Math.cos(want) * 16, e.y + Math.sin(want) * 16, want, 225, BulletKind.Needle, 11) }
    }
  },
  drawBody(ctx, e) {
    drawSprite(ctx, getSprite('m6_turret'), e.x, e.y, e.rot, 1, 1, e.flash)
    drawSprite(ctx, getSprite('m6_barrel'), e.x, e.y, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, 1, 1, e.flash)
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

bossDef({
  id: 'm6_rev_bow', hp: 5000, r: 34, sprite: 'm6_rev_bow', explode: 'large', score: 6000,
  update(e, w) { bowUpdate(e, w) },
  drawBody(ctx, e, w) {
    drawSprite(ctx, getSprite('m6_rev_bow'), e.x, e.y, e.rot, 1, 1, e.flash)
    const open = e.armor > 0
    if (!open) return
    // clamshell open: molten slit down the spine, muzzle glow while charging
    const charge = e.s.charge ?? 0
    ctx.save()
    ctx.translate(e.x, e.y); ctx.rotate(e.rot)
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,46,136,${0.6 + 0.3 * Math.sin(w.time * 12)})`
    ctx.lineWidth = 5
    ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, 36); ctx.stroke()
    ctx.strokeStyle = '#fff0f7'; ctx.lineWidth = 1.6; ctx.stroke()
    const r = 10 + charge * 26
    const g = ctx.createRadialGradient(0, 40, 1, 0, 40, r)
    g.addColorStop(0, `rgba(255,255,255,${0.5 + charge * 0.5})`)
    g.addColorStop(0.4, `rgba(255,46,136,${0.4 + charge * 0.5})`)
    g.addColorStop(1, 'rgba(255,46,136,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(0, 40, r, 0, TAU); ctx.fill()
    ctx.restore()
  },
  onDeath(e, w) {
    partDown(w, e)
    for (let i = 0; i < 2; i++) dropDebris(w, e.x + rand(-30, 30), e.y, 'm6_debris')
  },
})

function bowUpdate(e: Enemy, w: World) {
  const root = e.parent!
  if (root.s.intro || root.s.dying || e.armor <= 0) return
  const dt = w.frameDt
  e.s.cyc = (e.s.cyc ?? 1.5) - dt * w.diff.fireRate
  if (e.s.state === 1) {
    // charging the beam
    e.s.charge = Math.min(1, (e.s.charge ?? 0) + dt / 1.3)
    if (Math.random() < 0.6) w.parts.spawn(P.Glow, e.x + rand(-40, 40), e.y + 40 + rand(-30, 30), 0, 0, 0.25, 6, 1, C.magenta)
    return
  }
  e.s.charge = Math.max(0, (e.s.charge ?? 0) - dt * 2)
  if (e.s.cyc > 0) {
    e.s.fanT = (e.s.fanT ?? 1) - dt * w.diff.fireRate
    if (e.s.fanT <= 0 && canFire(w, e)) {
      e.s.fanT = 1.3
      fan(w, e.x, e.y + 44, Math.PI / 2 + Math.sin(w.time) * 0.3, 11, 1.8, 150, BulletKind.Big, 14)
    }
    return
  }
  // BEAM: aim now, fire after a long telegraph, slow sweep toward the side the player is on
  e.s.cyc = 6.2
  e.s.state = 1
  e.s.charge = 0
  const mx = e.x - Math.sin(e.rot) * 44, my = e.y + Math.cos(e.rot) * 44
  const ang = Math.atan2(w.player.y - my, w.player.x - mx)
  const sweep = (w.player.x > mx ? 1 : -1) * -0.1
  w.laser(mx, my, ang, 900, 34, 1.3, 1.7, e, sweep)
  if (!e.s.warned) w.emit({ type: 'radio', who: 'KESTREL', text: 'Bow is glowing. Beam!' })
  e.s.warned = 1
  w.after(1.3, () => {
    if (e.dead) return
    e.s.state = 0
    w.addShake(10)
    // a spray of sparks along the beam line helps sell the impact
    for (let i = 0; i < 20; i++) {
      const d = rand(40, 600)
      w.parts.spawn(P.Spark, mx + Math.cos(ang) * d, my + Math.sin(ang) * d, rand(-150, 150), rand(-150, 150), 0.4, 2, 0.5, C.magenta, 3)
    }
  })
}

function revenantUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  const parts = w.bossParts
  // keep parts glued to the (listing) hull
  const list = s.list ?? 0
  const cs = Math.cos(list), sn = Math.sin(list)
  for (const p of parts) {
    if (p === e || p.dead) continue
    const b = p.data as Base
    p.ox = b.bx * cs - b.by * sn
    p.oy = b.bx * sn + b.by * cs
    p.rot = list
    p.x = e.x + p.ox; p.y = e.y + p.oy
  }

  if (s.intro) {
    e.y += (ROOT_Y - e.y) * Math.min(1, dt * 0.7)
    if (Math.random() < 0.8) w.parts.spawn(P.Spark, e.x + rand(-150, 150), e.y + rand(-200, 250), rand(-80, 80), rand(-80, 80), 0.4, 2, 0.5, C.orange, 2)
    if (Math.abs(e.y - ROOT_Y) < 4) { s.intro = 0; w.emit({ type: 'radio', who: 'CHOIR', text: 'WE WORE YOUR DEAD LIKE ARMOUR. NOW WE WEAR THEIR FLEET.', tone: 'enemy' }) }
    return
  }

  if (s.dying) return

  const engines = alive(parts, 'engine')
  const bow = parts.find((p) => p.tag === 'bow')!

  // phase changes
  if (s.phase === 1 && engines.length === 0) {
    s.phase = 2
    phaseShift(w, 'THE DEAD DO NOT HURRY.')
    bow.armor = 1
    w.addShake(16)
    w.after(1.2, () => w.emit({ type: 'radio', who: 'HALLORAN', text: "Engines are out. It's listing — and the bow is opening up. Stay off its nose." }))
  }
  if (s.phase === 2 && bow.dead) {
    s.phase = 3
    e.armor = 1
    phaseShift(w, 'EVERY WRECK REMEMBERS ITS LAST ORDER. FIRE.')
    ring(w, e.x, e.y, 20, 120, rand(0, TAU), BulletKind.Big, 14)
  }
  if (s.phase === 3 && e.hp < e.maxHp * 0.03) { startDeath(e, w); return }

  // movement: engines give it a wide aggressive swing; without them it drifts and lists
  if (s.phase === 1) {
    const tx = PW / 2 + Math.sin(s.time * 0.42) * 75
    e.x += clamp(tx - e.x, -40 * dt, 40 * dt)
  } else {
    s.list = (s.list ?? 0) + (0.13 - (s.list ?? 0)) * Math.min(1, dt * 0.4)
    const tx = PW / 2 + 20 + Math.sin(s.time * 0.2) * 30
    e.x += clamp(tx - e.x, -14 * dt, 14 * dt)
    const ty = ROOT_Y + 14
    e.y += clamp(ty - e.y, -8 * dt, 8 * dt)
    // smoke from the dead stern
    if (Math.random() < 0.5) w.parts.spawn(P.Smoke, e.x + rand(-80, 80), e.y - 190 + rand(-20, 20), rand(-10, 10), -30, 1.6, 10, 30, C.smokeDark, 0.4)
    if (Math.random() < 0.2) w.parts.spawn(P.Fire, e.x + rand(-70, 70), e.y - 180, 0, -40, 0.5, 6, 14, 0, 1)
  }

  // shed hull as the whole machine takes damage
  let hp = 0, max = 0
  for (const p of parts) { max += p.maxHp; if (!p.dead) hp += Math.max(0, p.hp) }
  const frac = hp / max
  s.shed = s.shed ?? 1
  if (frac < s.shed - 0.07) {
    s.shed -= 0.07
    const n = s.phase === 3 ? 3 : 2
    for (let i = 0; i < n; i++) {
      const hx = rand(-110, 110), hy = rand(-120, 240)
      const x = e.x + hx * cs - hy * sn, y = e.y + hx * sn + hy * cs
      explode(w, x, y, 'medium')
      dropDebris(w, x, y, i === 0 ? 'm6_debris' : 'm6_debris_s')
    }
    w.addShake(6)
  }

  // desperation: the bridge sings with everything left, but the spiral is slow and the ring has a door
  if (s.phase === 3) {
    spiral(w, e, dt, 9, 4, 0.9, 130)
    s.ringT = (s.ringT ?? 2) - dt * w.diff.fireRate
    if (s.ringT <= 0 && canFire(w, e)) {
      s.ringT = 2.7
      const toP = Math.atan2(w.player.y - e.y, w.player.x - e.x)
      const n = 26
      for (let i = 0; i < n; i++) {
        const a = toP + (i / n) * TAU
        if (Math.abs(Math.atan2(Math.sin(a - toP), Math.cos(a - toP))) < 0.42) continue
        w.fire(e.x, e.y, a, 150, BulletKind.Big, 14)
      }
    }
    s.aimT = (s.aimT ?? 1.2) - dt * w.diff.fireRate
    if (s.aimT <= 0 && canFire(w, e)) { s.aimT = 1.7; aimed(w, e.x, e.y + 30, 240, 5, 0.09, BulletKind.Needle, 12) }
  }
}

/** Sections go up stern → midships → sponsons → bow → bridge, then the standard boss finale. */
function startDeath(e: Enemy, w: World) {
  e.s.dying = 1
  e.armor = 0
  w.clearBullets(PW / 2, PH / 2, 2000)
  w.lasers.length = 0
  const pts: [number, number, number][] = [
    [-62, -188, 0], [62, -188, 0.25], [-70, -100, 0.6], [70, -100, 0.8], [-122, -40, 1.1], [122, 64, 1.3],
    [-120, 64, 1.45], [122, -40, 1.6], [0, 236, 1.9], [-40, 150, 2.1], [40, 150, 2.2], [0, 60, 2.45],
  ]
  for (const [bx, by, t] of pts) {
    w.after(t, () => {
      const l = e.s.list ?? 0
      const x = e.x + bx * Math.cos(l) - by * Math.sin(l), y = e.y + bx * Math.sin(l) + by * Math.cos(l)
      explode(w, x, y, 'large')
      w.addShake(10)
      if (Math.random() < 0.5) dropDebris(w, x, y, 'm6_debris_s', rand(80, 140))
    })
  }
  w.after(2.7, () => {
    if (e.dead) return
    const x = e.x, y = e.y, list = e.s.list ?? 0
    e.armor = 1
    w.kill(e)
    // the broken dreadnought sinks away in two halves
    const t0 = w.time
    spawnFx(w, {
      update(ww, _dt, fx) {
        const k = ww.time - t0
        if (Math.random() < 0.6) ww.parts.spawn(P.Fire, x + rand(-100, 100), y + k * 22 + rand(-150, 250), rand(-20, 20), -30, 0.6, 8, 20, 0, 1)
        if (k > 6) fx.gone = true
      },
      draw(ctx, ww) {
        const k = Math.min(1, (ww.time - t0) / 6)
        const a = 1 - k
        const hull = getSprite('m6_rev_hull')
        for (const half of [0, 1]) {
          ctx.save()
          ctx.globalAlpha = a
          const dx = half ? 30 * k : -34 * k, dy = half ? 120 * k : 40 * k
          ctx.translate(x + dx, y + dy)
          ctx.rotate(list + (half ? 0.25 : -0.18) * k)
          ctx.beginPath()
          if (half) ctx.rect(-200, 20, 400, 400); else ctx.rect(-200, -300, 400, 320)
          ctx.clip()
          ctx.filter = `brightness(${1 - k * 0.6})`
          drawSprite(ctx, hull, 0, 20, 0, 1, a, 0)
          ctx.filter = 'none'
          ctx.restore()
        }
      },
    })
  })
}

export function spawnRevenant(w: World) {
  const e = w.spawn('m6_revenant', PW / 2, -560)
  e.s.intro = 1
  e.s.phase = 1
  e.armor = 0
  const parts: Enemy[] = []
  const add = (id: string, bx: number, by: number, tag: string) => {
    const p = w.spawn(id, e.x + bx, e.y + by, { parent: e, ox: bx, oy: by, tag, data: { bx, by } satisfies Base })
    parts.push(p)
    return p
  }
  for (const bx of [-62, 62]) add('m6_rev_engine', bx, -188, 'engine')
  for (const bx of [-72, 72]) add('m6_rev_missile', bx, -104, 'missile')
  for (const [bx, by] of [[-76, 20], [76, 20], [-64, 138], [64, 138]]) add('m6_rev_plate', bx, by, 'plate')
  for (const [bx, by] of [[-122, -40], [122, -40], [-120, 64], [120, 64]]) add('m6_rev_turret', bx, by, 'turret')
  const bow = add('m6_rev_bow', 0, 236, 'bow')
  bow.armor = 0
  startBoss(w, e, 'Revenant — stitched dreadnought', parts)
  return e
}
