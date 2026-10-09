import type { MissionDef, LevelScript, Formation } from '../../game/level'
import { audio } from '../../audio/audio'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import type { Enemy } from '../../game/entities'
import { BulletKind, PickupKind } from '../../game/entities'
import type { World, Decor } from '../../game/world'
import { spawnRevenant, spawnFx, holdUntil } from '../../game/bosses/revenant'
import { canFire, ring } from '../../game/patterns'
import { explode, chainExplosion, sparks, sfxAt } from '../../game/fx'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'
import { rand, TAU, angleDiff, clamp } from '../../core/math'

// ───────────────────────── wreck guns ─────────────────────────

/** Point-defence mounts left on the dead hulls. Dark until you fly close, then they wake. */
registerEnemy({
  id: 'm6_wreck_gun', hp: 70, r: 15, sprite: 'm6_turret', layer: 'ground', score: 250, credits: 30, charge: 3, explode: 'small', target: true,
  init(e) { e.s.aim = rand(0, TAU); e.s.dormant = 1 },
  update(e, w) {
    if (e.s.dormant) {
      if (e.y < 75) return
      e.s.dormant = 0
      sparks(w, e.x, e.y, 10, C.magenta, 180, 0.35, true)
      w.parts.spawn(P.Flash, e.x, e.y, 0, 0, 0.15, 10, 30, C.magenta, 0, true)
      if (!w.preview) sfxAt('enemy_laser_charge', e.x, 0.25)
    }
    const want = Math.atan2(w.player.y - e.y, w.player.x - e.x)
    e.s.aim += clamp(angleDiff(e.s.aim, want), -2.2 * w.frameDt, 2.2 * w.frameDt)
    if (!canFire(w, e) || Math.abs(angleDiff(e.s.aim, want)) > 0.2) return
    e.s.t = (e.s.t ?? rand(0.3, 1.2)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) {
      e.s.t = 2.3
      for (let i = 0; i < 3; i++) w.after(i * 0.13, () => { if (!e.dead) w.fire(e.x + Math.cos(e.s.aim) * 16, e.y + Math.sin(e.s.aim) * 16, e.s.aim, 200, BulletKind.Needle, 11) })
    }
  },
  drawBody(ctx, e, w) {
    const a = e.s.dormant ? 0.75 : 1
    drawSprite(ctx, getSprite('m6_turret'), e.x, e.y, 0, 1, a, e.flash)
    drawSprite(ctx, getSprite('m6_barrel'), e.x, e.y, e.s.aim - Math.PI / 2, 1, a, e.flash)
    if (!e.s.dormant && Math.sin(w.time * 6 + e.id) > 0.3) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = 'rgba(255,46,136,0.7)'
      ctx.beginPath(); ctx.arc(e.x, e.y, 2.5, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  },
})

// ───────────────────────── the waking hulk (mid-boss) ─────────────────────────

type Base = { bx: number; by: number }
const HULK_PARTS: [string, number, number][] = [
  ['m6_hulk_turret', 0, -78], ['m6_hulk_turret', 0, 30], ['m6_hulk_turret', 0, 112],
  ['m6_hulk_broadside', -64, -18], ['m6_hulk_broadside', 64, -18],
]

/** A Verge frigate that has been lying dead for years — until the Choir sings to it. */
registerEnemy({
  id: 'm6_hulk', hp: 2000, r: 46, sprite: 'm6_hulk', layer: 'ground', score: 8000, credits: 700, charge: 25, explode: 'large', boss: true, target: true,
  init(e) { e.noCull = true; e.s.wake = 2.2; e.armor = 0 },
  update(e, w, dt) { hulkUpdate(e, w, dt) },
  drawBody(ctx, e, w) {
    const k = e.s.lights ?? 0
    if (k < 1) ctx.filter = `brightness(${0.5 + 0.5 * k}) saturate(${0.5 + 0.5 * k})`
    drawSprite(ctx, getSprite('m6_hulk'), e.x, e.y, e.rot, 1, 1, e.flash)
    ctx.filter = 'none'
    drawHulkLights(ctx, e.x, e.y, e.rot, e.s.lights ?? 0, w.time)
  },
  onDeath(e, w) {
    chainExplosion(w, e.x, e.y, 70, 12, 1.4, 'large')
    w.after(0.6, () => w.pickup(PickupKind.Repair, e.x, e.y, 40))
    w.flags.add('hulk_done')
    w.after(1.8, () => w.emit({ type: 'radio', who: 'HALLORAN', text: 'Scratch one frigate. There are forty more hulls down there, and all of them are listening.' }))
  },
})

registerEnemy({
  id: 'm6_hulk_turret', hp: 450, r: 17, sprite: 'm6_turret', layer: 'ground', score: 800, credits: 80, charge: 6, explode: 'medium', boss: true, target: true,
  update(e, w) {
    const want = Math.atan2(w.player.y - e.y, w.player.x - e.x)
    e.s.aim = (e.s.aim ?? Math.PI / 2) + clamp(angleDiff(e.s.aim ?? Math.PI / 2, want), -2 * w.frameDt, 2 * w.frameDt)
    if (!e.parent?.s.active || !canFire(w, e)) return
    e.s.t = (e.s.t ?? rand(0.5, 2)) - w.frameDt * w.diff.fireRate
    if (e.s.t <= 0) {
      e.s.t = 2.2
      for (let i = 0; i < 4; i++) w.after(i * 0.12, () => { if (!e.dead) w.fire(e.x + Math.cos(e.s.aim) * 16, e.y + Math.sin(e.s.aim) * 16, e.s.aim, 205, BulletKind.Needle, 11) })
    }
  },
  drawBody(ctx, e) {
    drawSprite(ctx, getSprite('m6_turret'), e.x, e.y, e.rot, 1, 1, e.flash)
    drawSprite(ctx, getSprite('m6_barrel'), e.x, e.y, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, 1, 1, e.flash)
  },
})

/** Broadside launcher: only the side of the hull facing you fires, as a ripple along the hull. */
registerEnemy({
  id: 'm6_hulk_broadside', hp: 650, r: 20, sprite: 'm6_broadside', layer: 'ground', score: 900, credits: 90, charge: 6, explode: 'medium', boss: true, target: true,
  update(e, w) {
    const hulk = e.parent
    if (!hulk?.s.active) return
    const side = (e.data as Base).bx < 0 ? -1 : 1
    // outward normal of this side of the hull, and the hull's forward axis
    const nx = Math.cos(hulk.rot) * side, ny = Math.sin(hulk.rot) * side
    const fx = -Math.sin(hulk.rot), fy = Math.cos(hulk.rot)
    if (ny < 0.35 || !canFire(w, e)) return
    e.s.t = (e.s.t ?? (side < 0 ? 1 : 2.4)) - w.frameDt * w.diff.fireRate
    if (e.s.t > 0) return
    e.s.t = 3.1
    const ang = Math.atan2(ny, nx)
    for (let i = 0; i < 6; i++) {
      w.after(i * 0.07, () => {
        if (e.dead) return
        const d = (i - 2.5) * 38
        const x = e.x + fx * d, y = e.y + fy * d
        w.fire(x, y, ang, 165, BulletKind.Orb, 11)
        w.parts.spawn(P.Glow, x, y, 0, 0, 0.1, 10, 3, C.magenta)
      })
    }
    if (!w.preview) sfxAt('enemy_shot_heavy', e.x, 0.5)
  },
  drawBody(ctx, e) {
    const hulk = e.parent
    drawSprite(ctx, getSprite('m6_broadside'), e.x, e.y, hulk ? hulk.rot : 0, 1, 1, e.flash)
  },
})

const LIGHTS: [number, number, 'r' | 'm'][] = [[-50, -40, 'r'], [50, -40, 'r'], [-54, 170, 'm'], [54, 170, 'm'], [0, 140, 'm'], [-40, 250, 'r'], [40, 250, 'r'], [0, 300, 'm']]

/** Running lights coming on one by one (k: 0 dark → 1 fully awake). Offsets are in sprite space. */
function drawHulkLights(ctx: CanvasRenderingContext2D, x: number, y: number, rot: number, k: number, t: number) {
  if (k <= 0) return
  ctx.save()
  ctx.translate(x, y); ctx.rotate(rot)
  ctx.globalCompositeOperation = 'lighter'
  LIGHTS.forEach(([lx, ly, kind], i) => {
    const on = clamp(k * LIGHTS.length - i, 0, 1)
    if (on <= 0) return
    const flick = on < 1 ? (Math.sin(t * 60 + i) > 0 ? 1 : 0.2) : 0.75 + 0.25 * Math.sin(t * 3 + i)
    const col = kind === 'r' ? '255,70,50' : '255,190,110'
    const g = ctx.createRadialGradient(lx, ly - 160, 0, lx, ly - 160, 12)
    g.addColorStop(0, `rgba(255,255,255,${0.9 * flick})`)
    g.addColorStop(0.3, `rgba(${col},${0.8 * flick})`)
    g.addColorStop(1, `rgba(${col},0)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(lx, ly - 160, 12, 0, TAU); ctx.fill()
  })
  // stern engines rekindle
  const eng = clamp(k * 1.5 - 0.5, 0, 1)
  if (eng > 0) {
    for (const ex of [-34, 0, 34]) {
      const g = ctx.createRadialGradient(ex, -146, 0, ex, -146, 16)
      g.addColorStop(0, `rgba(255,220,240,${eng})`)
      g.addColorStop(0.4, `rgba(196,155,255,${eng * 0.7})`)
      g.addColorStop(1, 'rgba(196,155,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(ex, -146, 16, 0, TAU); ctx.fill()
    }
  }
  ctx.restore()
}

function hulkUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  // glue parts to the rotating hull
  const cs = Math.cos(e.rot), sn = Math.sin(e.rot)
  for (const p of w.enemies) {
    if (p.parent !== e || p.dead) continue
    const b = p.data as Base
    p.ox = b.bx * cs - b.by * sn; p.oy = b.bx * sn + b.by * cs
    p.x = e.x + p.ox; p.y = e.y + p.oy
  }
  if (s.wake > 0) {
    // waking: drifts with the field, sparks, lights flicker on, reactor rumble
    s.wake -= dt
    e.y += w.scroll * dt * (s.wake / 2.2)
    s.lights = clamp(1 - s.wake / 2.2, 0, 1)
    if (Math.random() < 0.5) sparks(w, e.x + rand(-50, 50), e.y + rand(-120, 120), 3, Math.random() < 0.5 ? C.orange : C.magenta, 200, 0.3, true)
    w.addShake(0.6)
    if (s.wake <= 0) {
      s.active = 1
      e.armor = 1
      w.addShake(8)
      ring(w, e.x, e.y, 14, 110, rand(0, TAU), BulletKind.Big, 12)
    }
    return
  }
  s.lights = 1
  s.t = (s.t ?? 0) + dt
  // swing the bow toward starboard and cruise across the field, holding station against the scroll
  e.rot += clamp(angleDiff(e.rot, -Math.PI / 2), -0.28 * dt, 0.28 * dt)
  s.vx = Math.min(40, (s.vx ?? 0) + dt * 10)
  e.x += s.vx * dt
  e.y += ((170 + Math.sin(s.t * 0.5) * 13) - e.y) * Math.min(1, dt * 0.6)
  if (Math.random() < 0.6) w.parts.spawn(P.Smoke, e.x + Math.sin(e.rot) * 150, e.y - Math.cos(e.rot) * 150, Math.sin(e.rot) * 60, -Math.cos(e.rot) * 60, 0.6, 5, 14, C.violet, 0.5)
  // reactor pulse from the bridge once its guns are gone
  const guns = w.enemies.some((p) => p.parent === e && !p.dead)
  s.pulse = (s.pulse ?? 2) - dt * w.diff.fireRate
  if (s.pulse <= 0 && canFire(w, e)) { s.pulse = guns ? 4.2 : 2.2; ring(w, e.x, e.y, guns ? 12 : 18, 120, rand(0, TAU), BulletKind.Orb, 11) }
  if (e.x > PW + 220) {
    e.gone = true
    for (const p of w.enemies) if (p.parent === e) p.gone = true
    w.flags.add('hulk_done')
    w.emit({ type: 'radio', who: 'HALLORAN', text: 'It went under the field. Let it go. It is not going anywhere we are.' })
  }
}

/** Looks like scenery; drifts in dark and tilted, then wakes up under the player's nose. */
function hulkSetPiece(w: World, x: number) {
  const d = { x, y: -230, rot: 0.42 }
  const fx = spawnFx(w, {
    update(ww, dt) {
      d.y += ww.scroll * dt
      if (Math.random() < 0.08) sparks(ww, d.x + rand(-40, 40), d.y + rand(-100, 100), 2, C.orange, 120, 0.3, true)
      if (d.y < 130) return
      fx.gone = true
      const e = ww.spawn('m6_hulk', d.x, d.y, { rot: d.rot })
      for (const [id, bx, by] of HULK_PARTS) ww.spawn(id, e.x + bx, e.y + by, { parent: e, ox: bx, oy: by, data: { bx, by } satisfies Base })
      ww.events.push({ type: 'phase', name: 'awaken' })
      if (!ww.preview) audio.music.setIntensity(3)
      // escorts arrive while the frigate is crossing
      const escort = (t: number, id: string, n: number, gap: number, f: Formation) => {
        for (let i = 0; i < n; i++) ww.after(t + i * gap, () => { if (e.dead || e.gone) return; const sl = f(i, n); ww.spawn(id, sl.x, sl.y, { mover: sl.mover }) })
      }
      escort(5, 'dart', 8, 0.2, F.swoop(1, 0.35, 300))
      escort(10, 'seeker', 5, 0.35, F.seek(PW * 0.2))
      escort(15, 'phantom', 3, 0.45, F.swoop(-1, 0.3, 220))
      ww.emit({ type: 'radio', who: 'CHOIR', text: 'RISE, CAPTAIN. YOUR CREW IS WAITING.', tone: 'enemy' })
      if (!ww.preview) sfxAt('boss_phase', d.x, 0.7)
    },
    draw(ctx, ww) {
      ctx.filter = 'brightness(0.5) saturate(0.5)'
      drawSprite(ctx, getSprite('m6_hulk'), d.x, d.y, d.rot, 1, 1, 0)
      const cs = Math.cos(d.rot), sn = Math.sin(d.rot)
      for (const [id, bx, by] of HULK_PARTS) {
        const px = d.x + bx * cs - by * sn, py = d.y + bx * sn + by * cs
        if (id === 'm6_hulk_turret') {
          drawSprite(ctx, getSprite('m6_turret'), px, py, d.rot, 1, 1, 0)
          drawSprite(ctx, getSprite('m6_barrel'), px, py, d.rot + 0.6, 1, 1, 0)
        } else drawSprite(ctx, getSprite('m6_broadside'), px, py, d.rot, 1, 1, 0)
      }
      ctx.filter = 'none'
      // a single dying emergency light
      if (Math.sin(ww.time * 2.5) > 0.6) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = 'rgba(255,60,40,0.8)'
        ctx.beginPath(); ctx.arc(d.x - 50 * cs + 40 * sn, d.y - 50 * sn - 40 * cs, 3, 0, TAU); ctx.fill()
        ctx.globalCompositeOperation = 'source-over'
      }
    },
  })
}


// ───────────────────────── scenery helpers ─────────────────────────

/** A drifting wreck with arcing sparks and a blinking emergency light while it is on screen. */
function wreck(L: LevelScript, sprite: string, x: number, o: { y?: number; rot?: number; depth?: number; scale?: number; lights?: [number, number][] } = {}) {
  return L.do((w) => {
    const d: Decor = { sprite, x, y: o.y ?? -260, rot: o.rot ?? 0, scale: o.scale ?? 1, depth: o.depth ?? 1, vx: 0, alpha: 1, above: false }
    w.decor.push(d)
    const lights = o.lights ?? [[rand(-40, 40), rand(-60, 60)]]
    const tick = () => {
      if (d.y > PH + 300) return
      if (d.y > -100) {
        const cs = Math.cos(d.rot), sn = Math.sin(d.rot)
        if (Math.random() < 0.5) {
          const sx = d.x + rand(-50, 50) * d.scale, sy = d.y + rand(-70, 70) * d.scale
          sparks(w, sx, sy, 4, Math.random() < 0.7 ? C.orange : C.cyan, 160, 0.35, true)
          w.parts.spawn(P.Glow, sx, sy, 0, 0, 0.12, 10, 3, C.yellow, 0, true)
        }
        const blink = Math.floor(w.time * 1.4) % 2 === 0
        if (blink) for (const [lx, ly] of lights) w.parts.spawn(P.Glow, d.x + lx * cs - ly * sn, d.y + lx * sn + ly * cs, 0, 0, 0.36, 7, 5, C.red, 0, true)
      }
      w.after(0.35, tick)
    }
    tick()
  })
}

// ───────────────────────── secret: the courier ─────────────────────────

/** A Choir courier bolts out of a wreck. Kill it before it clears the top of the screen. */
function courier(w: World, x: number, y: number) {
  explode(w, x, y, 'small', true)
  sparks(w, x, y, 18, C.violet, 260, 0.5)
  const e = w.spawn('escapee', x, y)
  e.vx = x < PW / 2 ? 156 : -156
  e.onDeath = (ww, en) => {
    ww.pickup(PickupKind.Core, en.x, en.y, 0, 'core_chorus')
    ww.secret('courier', 'Caught the courier')
    ww.emit({ type: 'radio', who: 'CHOIR', text: 'THE VERSE IS DROPPED. WHO WILL SING IT NOW.', tone: 'enemy' })
  }
  w.emit({ type: 'radio', who: 'CHOIR', text: 'LITTLE VOICE, FLY HOME. CARRY THE VERSE WHERE THE EMBER CANNOT FOLLOW.', tone: 'enemy' })
}

// ───────────────────────── mission ─────────────────────────

const drift = (x: number, vy = 55, vx = 0) => F.drift(x, vx, vy)

export const m6: MissionDef = {
  id: 'm6', num: '06', name: 'Graveyard', biome: 'graveyard', track: 'm6', scroll: 45,
  briefing: [
    'Nine years ago the Verge fleet made its stand at the Tannhal breach. It lost.',
    'Eleven hundred crew. We never recovered the hulls. We never tried.',
    'Last night the graveyard started transmitting. On Choir frequencies.',
    'Go in slow. Whatever is waking those wrecks, put it back to sleep.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    // ── quiet opening: dead ships, sparks, nothing moving ──
    L.at(0).intensity(0).radio('HALLORAN', "You're in the graveyard, Kestrel. Eleven hundred of ours are out here. Mind your manners.")
    wreck(L.at(0), 'prop_wreck_cruiser', X(0.24), { y: -320, depth: 0.7, rot: -0.2, lights: [[-30, -40], [20, 60]] })
    wreck(L.at(1), 'prop_hull_section', X(0.8), { y: -150, rot: 0.6 })
    L.at(2.5).wave('m6_debris_s', 1, 0, drift(X(0.66), 40, -10)).wave('m6_debris', 1, 0, drift(X(0.14), 35, 8)).wave('m6_debris_s', 1, 0, drift(X(0.92), 45, -6))
    wreck(L.at(4), 'prop_wreck_frigate', X(0.72), { y: -300, depth: 0.85, rot: 0.35 })
    L.at(5).radio('KESTREL', "Sensors keep counting hulls that aren't there. Then counting them again.")
    L.at(6.5).wave('m6_debris_s', 3, 1.2, drift(X(0.44), 45, 12))
    L.at(8).radio('HALLORAN', 'Scopes are clean. Too clean.')
    // ── first ambush ──
    L.at(9.5).intensity(2).radio('CHOIR', 'YOU FLY OVER GRAVES, EMBER. THE GRAVES ARE AWAKE.', 'enemy')
      .wave('phantom', 6, 0.25, F.hover(150, 6, X(0.12), X(0.88)))
    L.at(10.5).radio('KESTREL', 'Contacts! Right on top of me. Cloaked!')
    L.at(12.5).wave('dart', 8, 0.18, F.swoop(-1, 0.4, 310)).wave('dart', 8, 0.18, F.swoop(1, 0.4, 310))
    wreck(L.at(13), 'prop_hull_section', X(0.25), { y: -120, rot: -0.3 })
    wreck(L.at(13), 'prop_hull_section', X(0.8), { y: -200, rot: 0.5 })
    L.at(13).ground('m6_wreck_gun', X(0.21), { y: -140 }).ground('m6_wreck_gun', X(0.3), { y: -100 })
      .ground('m6_wreck_gun', X(0.77), { y: -230 }).ground('m6_wreck_gun', X(0.84), { y: -180 })
    L.at(15.5).wave('dart', 7, 0.1, F.vee(X(0.5), 170))
    L.at(17).gate(12)
    L.at(17.1).horde([['dart', 10], ['phantom', 4], ['dart', 10], ['weaver', 6]]).reveal({ banner: 'Massed contacts', play: true, hold: 7 }).radio('KESTREL', 'Wide scan sees them. My eyes do not. Some of those are cloaked.')
    L.at(17.15).gate(20)
    // ── mines among the debris ──
    L.at(18).radio('HALLORAN', 'Mines drifting in the debris. Old ones, ours. Somebody re-armed them.')
      .wave('mine', 1, 0, drift(X(0.15), 50)).wave('mine', 1, 0, drift(X(0.38), 50)).wave('mine', 1, 0, drift(X(0.62), 50)).wave('mine', 1, 0, drift(X(0.85), 50))
      .wave('m6_debris', 1, 0, drift(X(0.27), 55)).wave('m6_debris_s', 1, 0, drift(X(0.73), 55))
    L.at(20).wave('weaver', 5, 0.4, F.sine(X(0.28), 100, 2, 130)).wave('weaver', 5, 0.4, F.sine(X(0.72), 100, 2, 130))
      .wave('mine', 1, 0, drift(X(0.5), 50)).wave('mine', 1, 0, drift(X(0.22), 50))
    L.at(22.5).wave('splitter', 3, 0.6, F.hover(135, 6, X(0.2), X(0.8))).wave('m6_debris_l', 1, 0, drift(X(0.1), 40, 12))
    wreck(L.at(23), 'prop_wreck_frigate', X(0.18), { y: -300, rot: -0.5 })
    L.at(24.5).wave('gunship', 1, 0, F.hoverAt(X(0.5), 125, 10))
      .wave('mender', 1, 0, F.hoverAt(X(0.34), 95, 12)).wave('mender', 1, 0, F.hoverAt(X(0.66), 95, 12))
    L.at(25.5).radio('HALLORAN', 'Menders on that gunship. Cut the medics first or you will be here all night.')
    L.at(28).wave('phantom', 3, 0.45, F.swoop(-1, 0.35, 230)).wave('phantom', 2, 0.5, F.swoop(1, 0.35, 230))
    L.at(31).gate(14)
    // ── the wreck that wakes ──
    L.at(32).do((w) => hulkSetPiece(w, X(0.31))).wave('m6_debris_s', 3, 1.5, drift(X(0.78), 45))
    L.at(33).do((w) => holdUntil(w, 'hulk_done'))
    L.at(36.5).radio('KESTREL', "That frigate. Its reactor just ticked over. Halloran, that's not possible.")
    L.at(40).gate(45)
    // ── wardens, missiles and lancers forcing movement ──
    L.at(42).intensity(2)
    L.at(43).wave('mine', 1, 0, drift(X(0.12), 50)).wave('mine', 1, 0, drift(X(0.88), 50)).wave('mine', 1, 0, drift(X(0.5), 45))
      .wave('phantom', 3, 0.4, F.hover(170, 6, X(0.22), X(0.78)), { elite: true })
    L.at(46).wave('warden', 1, 0, F.hoverAt(X(0.5), 105, 11))
      .wave('missileer', 3, 0.3, F.hover(140, 10, X(0.5) - 95, X(0.5) + 95))
    L.at(47).radio('HALLORAN', 'Warden bubble. Nothing inside it takes damage while it lives.')
    L.at(48.5).wave('lancer', 4, 0.4, F.spreadSelf(X(0.12), X(0.88)))
    L.at(51.5).wave('lancer', 4, 0.4, F.spreadSelf(X(0.22), X(0.78))).wave('dart', 7, 0.16, F.swoop(-1, 0.3, 300))
    L.at(54).gate(13)
    // ── the courier (secret) ──
    L.at(55).do((w) => {
      const d: Decor = { sprite: 'prop_hull_section', x: X(0.3), y: -80, rot: 0.9, scale: 1, depth: 1, vx: 0, alpha: 1, above: false }
      w.decor.push(d)
      w.after(8, () => courier(w, d.x + 10, d.y))
    })
    L.at(57).wave('m6_debris', 2, 1, drift(X(0.64), 50, -12)).ground('m6_wreck_gun', X(0.77), { y: -60 }).ground('m6_wreck_gun', X(0.9), { y: -120 })
    L.at(60).wave('splitter', 3, 0.5, F.hover(130, 6, X(0.55), X(0.88)))
    L.at(62.6).wave('dart', 7, 0.1, F.vee(X(0.66), 170))
    wreck(L.at(65), 'prop_wreck_cruiser', X(0.77), { y: -330, depth: 0.8, rot: 0.25 })
    L.at(66).ground('m6_wreck_gun', X(0.71), { y: -150 }).ground('m6_wreck_gun', X(0.84), { y: -110 })
    L.at(69).gate(13)
    // ── escalation ──
    L.at(70).intensity(3).radio('HALLORAN', 'Kestrel, the field ahead is moving. Hulls pulling together. Something is gathering them.')
    L.at(71).wave('phantom', 7, 0.28, F.hover(145, 6, X(0.08), X(0.92)))
    L.at(73.5).wave('mine', 1, 0, drift(X(0.2), 60)).wave('mine', 1, 0, drift(X(0.35), 60)).wave('mine', 1, 0, drift(X(0.5), 60))
      .wave('mine', 1, 0, drift(X(0.65), 60)).wave('mine', 1, 0, drift(X(0.8), 60))
    L.at(75.5).wave('gunship', 3, 0.5, F.hover(120, 8, X(0.2), X(0.8)))
      .wave('mender', 3, 0.5, F.hover(80, 9, X(0.12), X(0.88)))
    L.at(79).wave('weaver', 8, 0.3, F.cross([[-30, 80], [PW * 0.5, 240], [PW + 40, 380]], 250))
    L.at(82).gate(14)
    L.at(83).wave('m6_debris_l', 1, 0, drift(X(0.2), 60)).wave('m6_debris', 1, 0, drift(X(0.4), 70)).wave('m6_debris_l', 1, 0, drift(X(0.62), 55))
      .wave('m6_debris', 1, 0, drift(X(0.85), 65)).wave('m6_debris_s', 4, 0.35, drift(X(0.35), 80))
    L.at(85).wave('lancer', 6, 0.3, F.spreadSelf(X(0.1), X(0.9))).wave('seeker', 4, 0.3, F.seek(X(0.2))).wave('seeker', 3, 0.3, F.seek(X(0.8)))
    L.at(89).gate(12)
    // ── the gun line: a spine of dead hulls whose point-defence all wakes at once ──
    wreck(L.at(90), 'prop_wreck_cruiser', X(0.17), { y: -330, rot: -0.15 })
    wreck(L.at(90), 'prop_hull_section', X(0.81), { y: -160, rot: 0.4 })
    L.at(91).ground('m6_wreck_gun', X(0.13), { y: -120 }).ground('m6_wreck_gun', X(0.22), { y: -200 }).ground('m6_wreck_gun', X(0.29), { y: -150 })
      .ground('m6_wreck_gun', X(0.77), { y: -60 }).ground('m6_wreck_gun', X(0.86), { y: -130 }).ground('m6_wreck_gun', X(0.72), { y: -180 })
      .wave('mine', 1, 0, drift(X(0.5), 45)).wave('mine', 1, 0, drift(X(0.4), 45)).wave('mine', 1, 0, drift(X(0.6), 45))
    L.at(94).radio('KESTREL', 'Every gun on that spine just woke up.')
      .wave('warden', 1, 0, F.hoverAt(X(0.5), 100, 10)).wave('splitter', 3, 0.4, F.hover(135, 9, X(0.5) - 130, X(0.5) + 130))
    L.at(97.5).wave('phantom', 4, 0.3, F.hover(170, 6, X(0.15), X(0.85)), { elite: true })
    L.at(100).wave('seeker', 8, 0.2, F.seek(X(0.5))).wave('m6_debris_l', 1, 0, drift(X(0.5), 60))
    L.at(103).gate(14)
    // ── boss ──
    L.at(104).intensity(1).scroll(12, 5).radio('HALLORAN', "That's not debris. That's a keel. They've stitched the fleet into one ship.")
    L.at(108).do((w) => spawnRevenant(w))
    L.at(109).until('boss_dead')
    L.at(111).radio('KESTREL', 'Rest easy, Verge.')
    L.at(114).radio('HALLORAN', "Graveyard's gone quiet. The signal came from deeper in. We follow it home.")
    L.at(116).do(() => {})
  },
}
