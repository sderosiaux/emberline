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
      if (e.y < 90) return
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
  s.vx = Math.min(30, (s.vx ?? 0) + dt * 8)
  e.x += s.vx * dt
  e.y += ((200 + Math.sin(s.t * 0.5) * 15) - e.y) * Math.min(1, dt * 0.6)
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
      if (d.y < 150) return
      fx.gone = true
      const e = ww.spawn('m6_hulk', d.x, d.y, { rot: d.rot })
      for (const [id, bx, by] of HULK_PARTS) ww.spawn(id, e.x + bx, e.y + by, { parent: e, ox: bx, oy: by, data: { bx, by } satisfies Base })
      ww.events.push({ type: 'phase', name: 'awaken' })
      if (!ww.preview) audio.music.setIntensity(3)
      // escorts arrive while the frigate is crossing
      const escort = (t: number, id: string, n: number, gap: number, f: Formation) => {
        for (let i = 0; i < n; i++) ww.after(t + i * gap, () => { if (e.dead || e.gone) return; const sl = f(i, n); ww.spawn(id, sl.x, sl.y, { mover: sl.mover }) })
      }
      escort(5, 'dart', 6, 0.25, F.swoop(1, 0.35))
      escort(10, 'seeker', 4, 0.4, F.seek(PW * 0.2))
      escort(15, 'phantom', 2, 0.5, F.swoop(-1, 0.3, 170))
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
  e.vx = x < PW / 2 ? 120 : -120
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
    // ── quiet opening: dead ships, sparks, nothing moving ──
    L.at(0).intensity(0).radio('HALLORAN', "You're in the graveyard, Kestrel. Eleven hundred of ours are out here. Mind your manners.")
    wreck(L.at(0), 'prop_wreck_cruiser', 150, { y: -320, depth: 0.7, rot: -0.2, lights: [[-30, -40], [20, 60]] })
    wreck(L.at(1), 'prop_hull_section', 440, { y: -150, rot: 0.6 })
    L.at(3).wave('m6_debris_s', 1, 0, drift(380, 40, -8)).wave('m6_debris', 1, 0, drift(90, 35, 6))
    wreck(L.at(5), 'prop_wreck_frigate', 420, { y: -300, depth: 0.85, rot: 0.35 })
    L.at(6).radio('KESTREL', "Sensors keep counting hulls that aren't there. Then counting them again.")
    L.at(8).wave('m6_debris_s', 2, 1.5, drift(250, 45, 10))
    L.at(9.5).radio('HALLORAN', 'Scopes are clean. Too clean.')
    // ── first ambush ──
    L.at(11.5).intensity(2).radio('CHOIR', 'YOU FLY OVER GRAVES, EMBER. THE GRAVES ARE AWAKE.', 'enemy')
      .wave('phantom', 4, 0.3, F.hover(180, 7, 110, PW - 110))
    L.at(12.5).radio('KESTREL', 'Contacts! Right on top of me. Cloaked!')
    L.at(15).wave('dart', 6, 0.22, F.swoop(-1, 0.4)).wave('dart', 6, 0.22, F.swoop(1, 0.4))
    wreck(L.at(16), 'prop_hull_section', 150, { y: -120, rot: -0.3 })
    L.at(16).ground('m6_wreck_gun', 125, { y: -140 }).ground('m6_wreck_gun', 180, { y: -100 })
    L.at(19).gate()
    // ── mines among the debris ──
    L.at(21).radio('HALLORAN', 'Mines drifting in the debris. Old ones, ours. Somebody re-armed them.')
      .wave('mine', 1, 0, drift(120, 50)).wave('mine', 1, 0, drift(300, 50)).wave('mine', 1, 0, drift(460, 50))
      .wave('m6_debris', 1, 0, drift(210, 55)).wave('m6_debris_s', 1, 0, drift(380, 55))
    L.at(23).wave('weaver', 4, 0.5, F.sine(PW * 0.3, 70, 2, 110)).wave('mine', 1, 0, drift(220, 50)).wave('mine', 1, 0, drift(400, 50))
    L.at(26).wave('splitter', 2, 0.8, F.hover(160, 7, 150, PW - 150)).wave('m6_debris_l', 1, 0, drift(80, 40, 10))
    wreck(L.at(27), 'prop_wreck_frigate', 110, { y: -300, rot: -0.5 })
    L.at(29).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 11))
      .wave('mender', 1, 0, F.hoverAt(PW / 2 - 95, 110, 13)).wave('mender', 1, 0, F.hoverAt(PW / 2 + 95, 110, 13))
    L.at(30).radio('HALLORAN', 'Menders on that gunship. Cut the medics first or you will be here all night.')
    L.at(34).wave('phantom', 2, 0.6, F.swoop(-1, 0.35, 180))
    L.at(37).gate(24)
    // ── the wreck that wakes ──
    L.at(39).do((w) => hulkSetPiece(w, 175)).wave('m6_debris_s', 2, 2, drift(420, 45))
    L.at(44).radio('KESTREL', "That frigate. Its reactor just ticked over. Halloran, that's not possible.")
    L.at(40).do((w) => holdUntil(w, 'hulk_done'))
    L.at(48).gate(55)
    // ── wardens, missiles and lancers forcing movement ──
    L.at(51).intensity(2)
    L.at(52).wave('mine', 1, 0, drift(100, 50)).wave('mine', 1, 0, drift(460, 50)).wave('phantom', 2, 0.5, F.hover(200, 6, 180, PW - 180), { elite: true })
    L.at(56).wave('warden', 1, 0, F.hoverAt(PW / 2, 125, 12))
      .wave('missileer', 2, 0.3, F.hover(165, 11, PW / 2 - 70, PW / 2 + 70))
    L.at(57).radio('HALLORAN', 'Warden bubble. Nothing inside it takes damage while it lives.')
    L.at(59).wave('lancer', 3, 0.5, F.spreadSelf(100, PW - 100))
    L.at(63).wave('lancer', 3, 0.5, F.spreadSelf(140, PW - 140))
    L.at(66).gate()
    // ── the courier (secret) ──
    L.at(68).do((w) => {
      const d: Decor = { sprite: 'prop_hull_section', x: 170, y: -80, rot: 0.9, scale: 1, depth: 1, vx: 0, alpha: 1, above: false }
      w.decor.push(d)
      w.after(9.5, () => courier(w, d.x + 10, d.y))
    })
    L.at(70).wave('m6_debris', 2, 1, drift(360, 50, -10)).ground('m6_wreck_gun', 430, { y: -60 })
    L.at(74).wave('splitter', 2, 0.6, F.hover(150, 7, 320, PW - 90))
    L.at(77.6).wave('dart', 5, 0.15, F.vee(PW * 0.65, 150))
    wreck(L.at(80), 'prop_wreck_cruiser', 430, { y: -330, depth: 0.8, rot: 0.25 })
    L.at(81).ground('m6_wreck_gun', 400, { y: -150 }).ground('m6_wreck_gun', 470, { y: -110 })
    L.at(84).gate()
    // ── escalation ──
    L.at(86).intensity(3).radio('HALLORAN', 'Kestrel, the field ahead is moving. Hulls pulling together. Something is gathering them.')
    L.at(87).wave('phantom', 5, 0.35, F.hover(170, 7, 80, PW - 80))
    L.at(90).wave('mine', 1, 0, drift(160, 60)).wave('mine', 1, 0, drift(280, 60)).wave('mine', 1, 0, drift(400, 60))
    L.at(92).wave('gunship', 2, 0.6, F.hover(140, 11, 150, PW - 150))
      .wave('mender', 2, 0.6, F.hover(95, 13, 90, PW - 90))
    L.at(96).wave('weaver', 6, 0.4, F.cross([[-30, 90], [PW * 0.5, 280], [PW + 40, 440]], 190))
    L.at(99).gate(26)
    L.at(101).wave('m6_debris_l', 1, 0, drift(140, 60)).wave('m6_debris', 1, 0, drift(300, 70)).wave('m6_debris_l', 1, 0, drift(460, 55))
      .wave('m6_debris_s', 3, 0.4, drift(220, 80))
    L.at(103).wave('lancer', 4, 0.4, F.spreadSelf(90, PW - 90)).wave('seeker', 4, 0.3, F.seek(PW * 0.2))
    L.at(107).gate()
    // ── the gun line: a spine of dead hulls whose point-defence all wakes at once ──
    wreck(L.at(109), 'prop_wreck_cruiser', 110, { y: -330, rot: -0.15 })
    wreck(L.at(109), 'prop_hull_section', 450, { y: -160, rot: 0.4 })
    L.at(110).ground('m6_wreck_gun', 90, { y: -120 }).ground('m6_wreck_gun', 140, { y: -200 }).ground('m6_wreck_gun', 430, { y: -60 }).ground('m6_wreck_gun', 480, { y: -130 })
      .wave('mine', 1, 0, drift(280, 45)).wave('mine', 1, 0, drift(220, 45)).wave('mine', 1, 0, drift(340, 45))
    L.at(113).radio('KESTREL', 'Every gun on that spine just woke up.')
      .wave('warden', 1, 0, F.hoverAt(PW / 2, 115, 11)).wave('splitter', 2, 0.4, F.hover(160, 10, PW / 2 - 90, PW / 2 + 90))
    L.at(117).wave('phantom', 3, 0.3, F.hover(200, 7, 120, PW - 120), { elite: true })
    L.at(120).wave('seeker', 6, 0.25, F.seek(PW * 0.5)).wave('m6_debris_l', 1, 0, drift(300, 60))
    L.at(123).gate()
    // ── boss ──
    L.at(124).intensity(1).scroll(12, 5).radio('HALLORAN', "That's not debris. That's a keel. They've stitched the fleet into one ship.")
    L.at(128).do((w) => spawnRevenant(w))
    L.at(129).until('boss_dead')
    L.at(131).radio('KESTREL', 'Rest easy, Verge.')
    L.at(134).radio('HALLORAN', "Graveyard's gone quiet. The signal came from deeper in. We follow it home.")
    L.at(136).do(() => {})
  },
}
