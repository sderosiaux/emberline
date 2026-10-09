import type { MissionDef, LevelScript } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import type { Enemy } from '../../game/entities'
import { BulletKind } from '../../game/entities'
import type { World } from '../../game/world'
import { spawnChoir } from '../../game/bosses/choir'
import { spawnFx, holdUntil } from '../../game/bosses/revenant'
import { canFire, onScreen, enemySfx } from '../../game/patterns'
import { GroundMover, LineMover } from '../../game/movers'
import { sfxAt } from '../../game/fx'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'
import { rand, TAU, clamp } from '../../core/math'
import { audio } from '../../audio/audio'

// ───────────────────────── citadel hazards ─────────────────────────

/**
 * Organ column: a cluster of pipes in the citadel floor. It breathes (mouth
 * brightens), then plays either a vertical beam or a column of notes straight
 * down the screen. Neighbouring columns are out of phase so a lane stays open.
 */
registerEnemy({
  id: 'm7_organ', hp: 700, r: 28, sprite: 'm7_organ_col', layer: 'ground', score: 900, credits: 90, charge: 6, explode: 'large', boss: true, target: true,
  init(e) { e.s.t = 1.2 + ((e.x / PW) * 2.4) % 2.4 },
  update(e, w, dt) {
    e.s.tell = Math.max(0, (e.s.tell ?? 0) - dt * 0.9)
    if (e.s.play > 0) {
      e.s.play -= dt
      e.s.nt = (e.s.nt ?? 0) - dt * w.diff.fireRate
      if (e.s.nt <= 0 && canFire(w, e)) { e.s.nt = 0.12; w.fire(e.x, e.y + 14, Math.PI / 2, 220, BulletKind.Orb, 11); enemySfx(w, e.x) }
    }
    if (e.y < 30 || e.y > PH * 0.5 || !w.player.alive) return
    e.s.t -= dt * w.diff.fireRate
    if (e.s.t > 0) return
    e.s.t = 3.6
    e.s.n = (e.s.n ?? (e.x > PW / 2 ? 1 : 0)) + 1
    e.s.tell = 1
    if (e.s.n % 2) w.laser(e.x, e.y + 10, Math.PI / 2, 900, 16, 1.0, 0.9, e)
    else w.after(0.7, () => { if (!e.dead) e.s.play = 1.1 })
  },
  draw(ctx, e) {
    const k = e.s.tell ?? 0
    if (k <= 0) return
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 16 + k * 18)
    g.addColorStop(0, `rgba(255,255,255,${0.3 + 0.5 * k})`)
    g.addColorStop(0.4, `rgba(196,155,255,${0.45 * k})`)
    g.addColorStop(1, 'rgba(196,155,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(e.x, e.y, 16 + k * 18, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  },
})

/** Flesh pod in the floor — the Choir's echo of the submarines: armoured shut, opens to sing. */
registerEnemy({
  id: 'm7_bloom', hp: 180, r: 22, sprite: 'm7_bloom', layer: 'ground', score: 500, credits: 60, charge: 6, explode: 'medium', target: true,
  init(e) { e.armor = 0; e.s.open = 0; e.s.st = 0; e.s.t = rand(0.4, 1.6) },
  update(e, w, dt) {
    e.s.t -= dt
    if (e.s.st === 0 && e.s.t <= 0 && onScreen(w, e, 60)) { e.s.st = 1; e.s.t = 0.7 }
    else if (e.s.st === 1) {
      e.s.open = Math.min(1, e.s.open + dt / 0.7)
      if (e.s.t <= 0) { e.s.st = 2; e.s.t = 2.4; e.armor = 1 }
    } else if (e.s.st === 2) {
      if (canFire(w, e) && (e.s.ft = (e.s.ft ?? 0.2) - dt * w.diff.fireRate) <= 0) {
        e.s.ft = 1.1
        const n = e.elite ? 14 : 10
        for (let i = 0; i < n; i++) { const b = w.fire(e.x, e.y, e.age + (i / n) * TAU, 125, BulletKind.Wave, 10); if (b) b.curve = 0.3 }
        enemySfx(w, e.x, true)
      }
      if (e.s.t <= 0) { e.s.st = 3; e.s.t = 0.6; e.armor = 0 }
    } else if (e.s.st === 3) {
      e.s.open = Math.max(0, e.s.open - dt / 0.6)
      if (e.s.t <= 0) { e.s.st = 0; e.s.t = 1.8 }
    }
  },
  draw(ctx, e, w) {
    const k = e.s.open
    if (k <= 0) return
    ctx.fillStyle = '#12050c'
    ctx.beginPath(); ctx.ellipse(e.x, e.y, 13 * k, 13 * k, 0, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 10 * k)
    g.addColorStop(0, `rgba(255,230,245,${0.6 * k + 0.2 * Math.sin(w.time * 20)})`)
    g.addColorStop(1, 'rgba(196,155,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(e.x, e.y, 10 * k, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  },
})

// ───────────────────────── set pieces ─────────────────────────

/** "The Choir sings back your old enemies": echoes materialise out of a violet ring. */
function echo(e: Enemy, w: World) {
  w.parts.spawn(P.Ring, e.x, Math.max(20, e.y), 0, 0, 0.5, 8, 70, C.violet)
  w.parts.spawn(P.Flash, e.x, Math.max(20, e.y), 0, 0, 0.2, 10, 40, C.violet)
}

/** Generator + nodes it shields, placed together so the link is explicit. */
function shieldedNodes(w: World, gx: number, nodes: number[], y = -60) {
  const gen = w.spawn('generator', gx, y - 30, { mover: new GroundMover() })
  for (const nx of nodes) {
    const n = w.spawn('node', nx, y + rand(-20, 20), { mover: new GroundMover() })
    n.shieldedBy = gen
    n.s.permShield = 1
  }
}

/** Laser gate: two pylons at the same height across the field. */
function gatePair(w: World, y: number, x0 = 36, x1 = PW - 36) {
  const a = w.spawn('pylon', x0, y, { mover: new GroundMover() })
  const b = w.spawn('pylon', x1, y, { mover: new GroundMover() })
  a.data = b; b.data = a
}

/** The giant eye in the citadel floor: opens as you pass, then follows you. */
function theEye(w: World, x: number) {
  const d = { x, y: -180, open: 0, lx: 0, ly: 0, blink: 0 }
  const S = 2
  let opened = false
  spawnFx(w, {
    update(ww, dt, fx) {
      d.y += ww.scroll * dt
      if (d.y > 95 && !opened) {
        opened = true
        ww.emit({ type: 'radio', who: 'CHOIR', text: 'WE SEE YOU NOW, LITTLE EMBER.', tone: 'enemy' })
        ww.addShake(8)
        if (!ww.preview) sfxAt('boss_phase', d.x, 0.6)
      }
      // once the eye has passed and nothing stands on the floor, the floor opens (bg phase 'core'
      // physically splits the ground, and ground units would not follow it)
      if (opened && !ww.flags.has('core_open') && d.y > PH + 130 &&
        !ww.enemies.some((o) => o.layer === 'ground' && !o.dead && !o.gone && o.y > -80 && o.y < PH + 80 && o.def.id !== 'm6_fx')) {
        ww.flags.add('core_open')
        ww.events.push({ type: 'phase', name: 'core' })
        ww.addShake(12)
        ww.emit({ type: 'radio', who: 'HALLORAN', text: 'The floor is opening. Kestrel, that is not a floor. It is a lid.' })
        if (!ww.preview) { sfxAt('boss_phase', PW / 2, 0.8); audio.music.setIntensity(3) }
      }
      if (opened) d.open = Math.min(1, d.open + dt / 1.4)
      const p = ww.player
      const tx = clamp((p.x - d.x) / 5, -60, 60), ty = clamp((p.y - d.y) / 12, -8, 16)
      d.lx += (tx - d.lx) * Math.min(1, dt * 5); d.ly += (ty - d.ly) * Math.min(1, dt * 5)
      d.blink = Math.max(0, d.blink - dt)
      if (opened && Math.random() < 0.004) d.blink = 0.25
      if (d.y > PH + 200 && ww.flags.has('core_open')) fx.gone = true
    },
    draw(ctx, ww) {
      drawSprite(ctx, getSprite('prop_eye'), d.x, d.y, 0, S, 1, 0)
      const k = d.open * (d.blink > 0 ? Math.abs(d.blink - 0.125) / 0.125 : 1)
      if (k <= 0.01) return
      const hw = 74 * S, hh = 28 * S * k
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(d.x - hw, d.y)
      ctx.quadraticCurveTo(d.x, d.y - hh * 2, d.x + hw, d.y)
      ctx.quadraticCurveTo(d.x, d.y + hh * 2, d.x - hw, d.y)
      ctx.closePath()
      ctx.fillStyle = '#1c0a16'
      ctx.fill()
      ctx.clip()
      // sclera: wet dark flesh with veins
      const sg = ctx.createRadialGradient(d.x - 20, d.y - 10, 5, d.x, d.y, hw)
      sg.addColorStop(0, '#e9d8cc'); sg.addColorStop(0.5, '#a88a8a'); sg.addColorStop(1, '#3a1a2a')
      ctx.fillStyle = sg
      ctx.fillRect(d.x - hw, d.y - hh * 2, hw * 2, hh * 4)
      ctx.strokeStyle = 'rgba(170,30,80,0.55)'; ctx.lineWidth = 1.2
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU
        ctx.beginPath(); ctx.moveTo(d.x + Math.cos(a) * hw, d.y + Math.sin(a) * hh * 1.5)
        ctx.quadraticCurveTo(d.x + Math.cos(a + 0.4) * hw * 0.6, d.y + Math.sin(a + 0.4) * hh, d.x + d.lx + Math.cos(a) * 40, d.y + d.ly + Math.sin(a) * 30)
        ctx.stroke()
      }
      // iris + slit pupil tracking the player
      const ix = d.x + d.lx, iy = d.y + d.ly, ir = 34
      const ig = ctx.createRadialGradient(ix, iy, 4, ix, iy, ir)
      ig.addColorStop(0, '#ffe2f0'); ig.addColorStop(0.3, '#c49bff'); ig.addColorStop(0.75, '#5a2ea0'); ig.addColorStop(1, '#1a0c30')
      ctx.fillStyle = ig
      ctx.beginPath(); ctx.arc(ix, iy, ir, 0, TAU); ctx.fill()
      ctx.strokeStyle = '#15131c'; ctx.lineWidth = 2; ctx.stroke()
      ctx.fillStyle = '#07040a'
      ctx.beginPath(); ctx.ellipse(ix, iy, 5 + 2 * Math.sin(ww.time * 3), ir * 0.8, 0, 0, TAU); ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath(); ctx.ellipse(ix - 12, iy - 13, 7, 4, -0.5, 0, TAU); ctx.fill()
      ctx.restore()
      // lids' shadow line
      ctx.strokeStyle = '#15131c'; ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(d.x - hw, d.y); ctx.quadraticCurveTo(d.x, d.y - hh * 2, d.x + hw, d.y)
      ctx.quadraticCurveTo(d.x, d.y + hh * 2, d.x - hw, d.y); ctx.stroke()
    },
  })
}

/** Scatter vein nodes over the floor. */
function veins(L: LevelScript, xs: number[]) {
  for (const x of xs) L.decor('prop_vein_node', x, { y: -60 - rand(0, 80) })
  return L
}

// ───────────────────────── mission ─────────────────────────

export const m7: MissionDef = {
  id: 'm7', num: '07', name: 'Choir Heart', biome: 'heart', track: 'm7', scroll: 55,
  briefing: [
    'We traced every signal back to one place. It is not a station. It is grown.',
    'Everything the Choir took — ships, miners, the Verge dead — was carried here.',
    'Fleet cannot follow you inside. One ship can.',
    'Find the heart of it, Kestrel. Make it stop singing.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    // ── approach over the megastructure ──
    L.at(0).intensity(2).radio('HALLORAN', 'This is it, Kestrel. The Heart. Everything they took, they brought here.')
      .decor('prop_rib', X(0.5), { y: -80 }).decor('prop_organ', X(0.12), { y: -200 }).decor('prop_organ', X(0.86), { y: -330 })
    L.at(2).ground('node', X(0.2)).ground('node', X(0.5), { y: -60 }).ground('node', X(0.78), { y: -90 })
      .wave('dart', 7, 0.08, F.vee(X(0.5), 170))
    L.at(4).wave('dart', 6, 0.15, F.column(X(0.15), 230, 0)).wave('dart', 6, 0.15, F.column(X(0.85), 230, 0))
    L.at(5).wave('cantor', 1, 0, F.hoverAt(X(0.5), 110, 8))
    L.at(6).radio('KESTREL', "It's... singing. The whole structure is singing.")
    veins(L.at(7), [X(0.07), X(0.5), X(0.93)])
    L.at(8).do((w) => shieldedNodes(w, X(0.5), [X(0.2), X(0.33), X(0.67), X(0.8)]))
    L.at(9).radio('HALLORAN', 'Generator in the middle feeds shields to those nodes. Break the generator first.')
    L.at(11.5).wave('warden', 1, 0, F.hoverAt(X(0.5), 100, 11))
      .wave('missileer', 3, 0.3, F.hover(130, 10, X(0.5) - 110, X(0.5) + 110))
      .wave('mender', 1, 0, F.hoverAt(X(0.5), 60, 12))
    L.at(13).decor('prop_rib', X(0.45), { y: -80 })
    L.at(14.5).wave('lancer', 6, 0.3, F.spreadSelf(X(0.1), X(0.9)))
    L.at(17).gate(12)
    // ── organ-pipe columns ──
    L.at(18).radio('HALLORAN', 'Organ pipes in the floor. They fire straight down the field. Watch them breathe before the note.')
      .ground('m7_organ', X(0.12), { y: -40 }).ground('m7_organ', X(0.5), { y: -70 }).ground('m7_organ', X(0.88), { y: -40 })
    L.at(20).wave('weaver', 5, 0.4, F.sine(X(0.3), 100, 2.4, 120)).wave('weaver', 5, 0.4, F.sine(X(0.7), 100, 2.4, 120))
    L.at(23).ground('m7_organ', X(0.31), { y: -40 }).ground('m7_organ', X(0.69), { y: -40 }).decor('prop_organ', X(0.5), { y: -140 })
    L.at(24).wave('dart', 10, 0.18, F.swoop(-1, 0.4, 310)).wave('dart', 10, 0.18, F.swoop(1, 0.4, 310))
    L.at(26.5).wave('cantor', 3, 0.5, F.hover(115, 8, X(0.2), X(0.8)))
    veins(L.at(27), [X(0.18), X(0.54), X(0.82)])
    L.at(30).gate(13)
    L.at(30.1).horde([['dart', 10], ['cantor', 3], ['dart', 10], ['wasp', 8], ['dart', 10], ['cantor', 3]], { elite: true }).reveal({ banner: 'The Choir rises', play: true, hold: 7 })
    L.at(30.15).gate(22)
    // ── echoes: the Choir sings back the whole campaign ──
    L.at(31).intensity(3).radio('CHOIR', 'WE KEPT EVERY SONG YOU SILENCED. HEAR THEM AGAIN.', 'enemy')
    L.at(33).radio('CHOIR', 'THE REFINERY SANG FIRST.', 'enemy')
      .wave('gunship', 4, 0.35, F.hover(130, 8, X(0.14), X(0.86)), { onSpawn: echo })
      .wave('mender', 3, 0.4, F.hover(80, 9, X(0.22), X(0.78)), { onSpawn: echo })
    L.at(36).wave('dart', 8, 0.16, F.swoop(-1, 0.45, 300), { elite: true, onSpawn: echo })
      .wave('dart', 8, 0.16, F.swoop(1, 0.45, 300), { elite: true, onSpawn: echo })
    L.at(39).gate(14)
    L.at(40).radio('CHOIR', 'YOUR CARRIER. OUR HYMN.', 'enemy')
      .wave('carrier', 1, 0, () => ({ x: X(0.5), y: -80, mover: new LineMover(0, 30) }), { onSpawn: echo })
    L.at(42.5).wave('wasp', 6, 0.25, F.hover(170, 7, X(0.1), X(0.9)), { onSpawn: echo })
    L.at(45).ground('m7_organ', X(0.1), { y: -40 }).ground('m7_organ', X(0.9), { y: -40 })
    L.at(48).gate(14)
    L.at(49).radio('CHOIR', 'BENEATH, WE WAITED.', 'enemy')
      .ground('m7_bloom', X(0.2)).ground('m7_bloom', X(0.5), { y: -80 }).ground('m7_bloom', X(0.8))
    L.at(50).radio('KESTREL', 'Pods in the floor. Armoured shut. They only open to sing.')
    L.at(52).ground('m7_bloom', X(0.35), { y: -40, elite: true }).ground('m7_bloom', X(0.65), { y: -40, elite: true })
      .wave('phantom', 5, 0.3, F.hover(150, 7, X(0.15), X(0.85)), { onSpawn: echo })
    L.at(55.5).radio('CHOIR', 'THE GATES REMEMBER YOUR SHAPE.', 'enemy')
      .do((w) => { gatePair(w, -30); gatePair(w, -210) })
    L.at(56.5).wave('phantom', 3, 0.4, F.hover(115, 8, X(0.2), X(0.8)), { elite: true, onSpawn: echo })
      .wave('mine', 1, 0, F.drift(X(0.25), 0, 60)).wave('mine', 1, 0, F.drift(X(0.5), 0, 60)).wave('mine', 1, 0, F.drift(X(0.75), 0, 60))
    L.at(60).wave('sniper', 3, 0.4, F.hover(95, 7, X(0.18), X(0.82)), { onSpawn: echo })
    L.at(63).gate(13)
    L.at(64).radio('CHOIR', 'THE DROWNED FLEET STILL KEEPS TIME FOR US.', 'enemy')
      .wave('m6_debris_l', 1, 0, F.drift(X(0.2), 0, 60)).wave('m6_debris', 1, 0, F.drift(X(0.45), 0, 70))
      .wave('m6_debris_l', 1, 0, F.drift(X(0.66), 0, 55)).wave('m6_debris', 1, 0, F.drift(X(0.88), 0, 65))
      .wave('phantom', 6, 0.25, F.hover(155, 7, X(0.1), X(0.9)), { elite: true, onSpawn: echo })
    L.at(67.5).wave('gunship', 1, 0, F.hoverAt(X(0.5), 120, 9), { elite: true, onSpawn: echo })
      .wave('mender', 2, 0.3, F.hover(78, 9, X(0.3), X(0.7)), { onSpawn: echo })
    L.at(70).wave('lancer', 6, 0.3, F.spreadSelf(X(0.1), X(0.9)), { onSpawn: echo })
    L.at(72.5).wave('seeker', 5, 0.25, F.seek(X(0.25))).wave('seeker', 4, 0.25, F.seek(X(0.75))).ground('m7_organ', X(0.5), { y: -40 })
    L.at(76).gate(14)
    // ── the eye (ground only while it is on screen; the floor splits after it passes) ──
    L.at(77).intensity(1).radio('HALLORAN', 'Something big in the floor ahead. Organic. Reading... a lot of nerve tissue.')
      .do((w) => theEye(w, X(0.5)))
      .ground('node', X(0.08), { y: -100 }).ground('node', X(0.92), { y: -100 }).ground('m7_organ', X(0.2), { y: -140 }).ground('m7_organ', X(0.8), { y: -140 })
    L.at(80).do((w) => holdUntil(w, 'core_open'))
    L.at(83).wave('seeker', 8, 0.25, F.seek(X(0.5)))
    L.at(85).wave('cantor', 3, 0.4, F.hover(120, 8, X(0.18), X(0.82)))
    L.at(86.5).radio('KESTREL', "It's watching me. I really wish it would stop.")
    L.at(88.5).wave('warden', 2, 0.4, F.hover(95, 9, X(0.25), X(0.75)))
      .wave('missileer', 3, 0.4, F.hover(145, 9, X(0.15), X(0.85)))
      .wave('mender', 1, 0, F.hoverAt(X(0.5), 76, 10))
    L.at(93).wave('lancer', 7, 0.28, F.spreadSelf(X(0.08), X(0.92)))
    L.at(96).gate(30)
    // after the split: air, plus fresh ground only on the outer shelves, clear of the chasm
    L.at(97).intensity(3).wave('gunship', 2, 0.5, F.hover(130, 9, X(0.25), X(0.75)), { onSpawn: echo })
      .ground('m7_organ', X(0.1), { y: -40 }).ground('m7_organ', X(0.9), { y: -40 })
    L.at(99.5).wave('dart', 9, 0.08, F.vee(X(0.3), 180)).wave('dart', 9, 0.08, F.vee(X(0.7), 180))
    L.at(102).gate(13)
    // ── the final boss ──
    L.at(103).intensity(1).scroll(20, 5).radio('HALLORAN', "Core chamber ahead. Whatever you've got left, Kestrel, spend it here.")
    L.at(106).radio('KESTREL', 'Been saving it.')
    L.at(108).do((w) => spawnChoir(w))
    L.at(109).until('boss_dead')
    L.at(112).radio('HALLORAN', "Kestrel... the network's gone quiet. Every channel. Every relay.")
    L.at(116).radio('KESTREL', "Quiet's good. Quiet I can work with.")
    L.at(120).radio('CHOIR', '...a song does not end... it waits... for a voice...', 'odd')
    L.at(124).radio('HALLORAN', "Bring her home, Kestrel. Dasha's going to cry over that paint.")
    L.at(127).do(() => {})
  },
}
