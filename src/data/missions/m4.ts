import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import { spawnExcavator } from '../../game/bosses/excavator'
import { LineMover, HoverMover, GroundMover } from '../../game/movers'
import { onScreen } from '../../game/patterns'
import { P, C } from '../../render/particles'
import { rand, TAU } from '../../core/math'
import type { World, Decor } from '../../game/world'

/**
 * Drill rigs cut the belt with lasers. All rigs on screen share one clock and
 * sweep in the same direction, so the lanes between the beams slide together —
 * the player threads the gap instead of guessing. Killing a rig kills its beam.
 */
const RIG_PERIOD = 3.8
registerEnemy({
  id: 'm4_drill_rig', hp: 700, r: 26, sprite: 'm4_drill_rig', layer: 'ground', score: 900, credits: 110, charge: 8, explode: 'large', target: true,
  update(e, w) {
    const k = Math.floor(w.time / RIG_PERIOD)
    if (e.s.k === undefined) e.s.k = k
    if (k === e.s.k) return
    e.s.k = k
    if (!onScreen(w, e, 20) || e.y > w.player.y - 170 || !w.player.alive) return
    const dir = k % 2 ? 1 : -1
    const warn = 0.9, life = 2.1, sweep = dir * 0.16
    w.laser(e.x, e.y + 30, Math.PI / 2 - dir * 0.2 - sweep * warn, 900, 13, warn, life, e, sweep)
    e.s.charge = warn
  },
  draw(ctx, e, w) {
    if (!(e.s.charge > 0)) return
    e.s.charge -= w.frameDt
    ctx.globalCompositeOperation = 'lighter'
    const k = 1 - e.s.charge / 0.9
    ctx.fillStyle = `rgba(255,120,190,${0.3 + 0.5 * k})`
    ctx.beginPath(); ctx.arc(e.x, e.y + 30, 4 + k * 7, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
  },
})

/**
 * Secret: a cracked violet rock crosses the upper screen once, fast. Break it
 * and the belt tears open; fly into the tear before it closes and the campaign
 * detours through the Static Garden.
 */
registerEnemy({
  id: 'm4_rift_rock', hp: 120, r: 16, sprite: 'm4_rift_rock', layer: 'air', score: 1500, credits: 40, charge: 6, explode: 'small', contact: 0, noShadow: true,
  init(e) { e.noCull = true; e.s.ignoreGate = 1; e.s.y0 = e.y },
  update(e, w, dt) {
    e.x += 430 * dt
    e.y = e.s.y0 + Math.sin(e.age * 3.5) * 14
    e.rot += dt * 5
    if (Math.random() < 0.7) w.parts.spawn(P.Glow, e.x - 10, e.y + rand(-5, 5), -60, 0, 0.4, 6, 1, C.violet)
    if (e.x > PW + 60) e.gone = true
  },
  onDeath(e, w) { openRift(w, e.x, e.y) },
})

function openRift(w: World, x: number, y: number) {
  if (w.preview) return
  w.emit({ type: 'phase', name: 'rift' })
  w.flashScreen = 0.35
  w.addShake(6)
  w.emit({ type: 'radio', who: '???', text: 'o. you found the seam. come through, little ember.', tone: 'odd' })
  for (let i = 0; i < 3; i++) w.parts.spawn(P.Ring, x, y, 0, 0, 0.6 + i * 0.2, 10, 120 + i * 40, C.violet)
  const d: Decor = { sprite: 'm4_rift_portal', x: Math.min(PW - 70, Math.max(70, x)), y: Math.max(80, y), rot: 0, scale: 0.2, depth: 0, vx: 0, alpha: 1, above: true }
  w.decor.push(d)
  let t = 0
  let taken = false
  const done = () => {
    const i = w.decor.indexOf(d)
    if (i >= 0) w.decor.splice(i, 1)
    w.after(6, () => w.emit({ type: 'phase', name: 'belt' }))
  }
  const step = () => {
    const dt = w.frameDt
    t += dt
    d.y += 38 * dt
    d.rot += 1.6 * dt
    d.scale = Math.min(1, d.scale + dt * 2) * (t > 7 ? Math.max(0.05, 1 - (t - 7)) : 1)
    d.alpha = 0.85 + 0.15 * Math.sin(t * 9)
    if (Math.random() < 0.8) {
      const a = rand(0, TAU), r = rand(50, 70) * d.scale
      w.parts.spawn(P.Glow, d.x + Math.cos(a) * r, d.y + Math.sin(a) * r, -Math.cos(a) * 60, -Math.sin(a) * 60, 0.6, 5, 1, C.violet)
    }
    const p = w.player
    if (!taken && p.alive && (p.x - d.x) ** 2 + (p.y - d.y) ** 2 < (40 * d.scale) ** 2) {
      taken = true
      w.flags.add('rift_taken')
      w.emit({ type: 'warp', to: 'garden' })
      w.secret('rift', 'A tear in the belt')
      w.flashScreen = 0.9
      for (let i = 0; i < 4; i++) w.parts.spawn(P.Ring, d.x, d.y, 0, 0, 0.5 + i * 0.25, 20, 260 + i * 60, i % 2 ? C.white : C.violet)
      w.after(1.2, () => w.emit({ type: 'radio', who: 'HALLORAN', text: 'Kestrel, your transponder just read two places at once. Say again?' }))
      w.after(3.4, () => w.emit({ type: 'radio', who: 'KESTREL', text: 'I am fine. I think. Something followed me back.' }))
      done()
      return
    }
    if (t > 8 || d.y > PH + 80) { done(); return }
    w.after(0, step)
  }
  step()
}

/** Rock curtain: a line of drifting asteroids with one gap. */
const curtain = (gapX: number, vy: number) => (w: World) => {
  for (let x = 40; x < PW; x += 76) {
    if (Math.abs(x - gapX) < 70) continue
    w.spawn(Math.random() < 0.6 ? 'rock_l' : 'rock_m', x + rand(-8, 8), -50 - rand(0, 20), { mover: new LineMover(rand(-6, 6), vy) })
  }
}

const rocks = (n: number, vy = 80) => (w: World) => {
  for (let i = 0; i < n; i++) {
    const id = Math.random() < 0.3 ? 'rock_l' : Math.random() < 0.6 ? 'rock_m' : 'rock_s'
    w.after(i * 0.35, () => w.spawn(id, rand(30, PW - 30), -40, { mover: new LineMover(rand(-30, 30), vy + rand(-20, 30)) }))
  }
}

const rig = (x: number, y = -60) => (w: World) => { w.spawn('m4_drill_rig', x, y, { mover: new GroundMover() }) }

export const m4: MissionDef = {
  id: 'm4', num: '04', name: 'The Shoals', biome: 'shoals', track: 'm4', scroll: 70,
  briefing: [
    'The Choir has to feed itself. It eats ore.',
    'The Shoals belt is strip-mined by automated rigs that were ours two years ago.',
    'Break the rigs, crack the ore, and find whatever is doing the digging.',
    'Mind the drill lasers. They were built for rock and they are not picky.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    const row = (sprite: string, y: number, x0 = 70, x1 = PW + 70) => { for (let x = x0; x < x1; x += 140) L.decor(sprite, x, { y }) }
    // ── the belt: learn the rocks ──
    L.at(0).radio('HALLORAN', 'You are in the Shoals. Every rock out here is either ore or cover. The Choir uses both.')
      .decor('prop_rock_bg', X(0.14), { y: -260, depth: 0.5 }).decor('prop_rock_bg', X(0.82), { y: -520, depth: 0.5, rot: 2 }).decor('prop_rock_bg', X(0.46), { y: -780, depth: 0.5, rot: 4 })
    L.at(1.5).do(rocks(9, 75))
    L.at(3).wave('dart', 9, 0.1, F.vee(X(0.5), 170))
    L.at(5).wave('ore_rock', 1, 0, F.drift(X(0.5), 0, 60)).do((w) => {
      w.spawn('rock_l', X(0.5) - 150, -60, { mover: new LineMover(10, 60) })
      w.spawn('rock_l', X(0.5) + 150, -80, { mover: new LineMover(-10, 60) })
    })
    L.at(6).radio('KESTREL', 'Green veins. I know what those are worth.')
    L.at(7.5).wave('dart', 8, 0.2, F.swoop(-1, 0.4, 300)).wave('dart', 8, 0.2, F.swoop(1, 0.45, 300))
    L.at(10).wave('wasp', 6, 0.22, F.hover(128, 4.5)).do(rocks(6, 90))
    // first mining platform
    L.at(12).decor('prop_mining_rig', X(0.2), { y: -160 })
    row('prop_conveyor', -110, X(0.45))
    L.at(12).ground('turret', X(0.16), { y: -120 }).ground('turret', X(0.27), { y: -200 }).ground('cache', X(0.72), { y: -110 }).ground('turret', X(0.86), { y: -150 })
    L.at(14).wave('weaver', 5, 0.4, F.sine(X(0.72), 90, 2.2, 120)).wave('weaver', 5, 0.4, F.sine(X(0.3), 90, 2.2, 120)).wave('ore_rock', 1, 0, F.drift(X(0.12), 10, 70))
    L.at(17).gate(12)

    // ── drill rigs: thread the beams ──
    L.at(18).scroll(35, 3).radio('HALLORAN', 'Drill rigs ahead. They cut rock with lasers. They will cut you with the same lasers.')
    L.at(19).do(rig(X(0.27))).do(rig(X(0.73)))
    L.at(20).radio('KESTREL', 'Beams move together. Stay in the gap, kill the rig.')
    L.at(21.5).wave('dart', 7, 0.18, F.column(X(0.5), 180))
    L.at(24).wave('weaver', 4, 0.4, F.sine(X(0.5), 80, 2, 110))
    L.at(26).decor('prop_mining_rig', X(0.79), { y: -170 }).ground('turret', X(0.84), { y: -120 }).ground('flak', X(0.71), { y: -190 }).ground('turret', X(0.14), { y: -150 })
    L.at(27.5).do(rig(X(0.12))).do(rig(X(0.37))).do(rig(X(0.63))).do(rig(X(0.88)))
    L.at(29).wave('lancer', 5, 0.35, F.spreadSelf(X(0.15), X(0.85)))
    L.at(32).wave('ore_rock', 3, 1, F.drift(X(0.5), 0, 65))
    L.at(33.5).wave('wasp', 5, 0.25, F.hover(110, 4, X(0.15), X(0.85)))
    L.at(36).gate(14)
    L.at(36.1).horde([['dart', 10], ['weaver', 5], ['dart', 10], ['wasp', 6], ['dart', 9]]).reveal({ banner: 'Massed contacts', play: true, hold: 7 }).radio('KESTREL', 'The belt is moving. No. The belt is ships.')
    L.at(36.15).gate(20)
    L.at(37).scroll(70, 3)

    // ── the ghost (secret) ──
    L.at(38).wave('missileer', 3, 0.5, F.hover(120, 6, X(0.2), X(0.8))).do(rocks(7, 65))
    L.at(41).radio('HALLORAN', 'Sensor ghost on the belt, bearing zero-nine-zero. Ignore it.')
    L.at(42).do((w) => {
      w.spawn('rock_l', X(0.3), -70, { mover: new LineMover(0, 55) })
      w.spawn('rock_l', X(0.68), -110, { mover: new LineMover(0, 55) })
    })
    L.at(43.5).wave('dart', 8, 0.16, F.swoop(1, 0.5, 300))
    L.at(45).do((w) => { w.spawn('m4_rift_rock', -40, 62) })
    L.at(47).wave('weaver', 6, 0.3, F.cross([[-30, 100], [PW * 0.5, 205], [PW + 40, 320]], 260))
    L.at(50).gate(12)

    // ── minefield + seekers ──
    L.at(51.5).radio('KESTREL', 'Minefield. They laid it across the ore lanes.')
    for (let row = 0; row < 4; row++) {
      L.at(52.5 + row * 1.9).do((w) => {
        const gap = row % 2 ? PW * 0.3 : PW * 0.7
        for (let x = 40; x < PW; x += 82) if (Math.abs(x - gap) > 60) w.spawn('mine', x + rand(-10, 10), -30, { mover: new LineMover(0, 85) })
      })
    }
    L.at(54).wave('seeker', 6, 0.25, F.seek(X(0.2)))
    L.at(56.5).wave('seeker', 6, 0.25, F.seek(X(0.8)))
    L.at(58.5).wave('seeker', 7, 0.1, F.sweep(-1, 77, 290, 40)).wave('seeker', 7, 0.1, F.sweep(1, 110, 290, 40))
    L.at(60).ground('repair_cache', X(0.5))
    L.at(62).gate(12)

    // ── carrier group ──
    L.at(63.5).radio('HALLORAN', 'Choir carrier with escorts. Wardens first, or you are shooting a wall.')
    L.at(64.5).do((w) => {
      w.spawn('carrier', X(0.5), -90, { mover: new LineMover(0, 26) })
      for (const [x, delay] of [[X(0.25), 1.2], [X(0.75), 1.6]] as const) {
        w.after(delay, () => w.spawn('warden', x, -40, { mover: new HoverMover(x, 128, 1.8, 16, 0, -100) }))
      }
    })
    L.at(66).radio('CHOIR', 'THE STONE REMEMBERS THE HAMMER. SO WILL YOU.', 'enemy')
    L.at(67.5).wave('missileer', 3, 0.5, F.hover(195, 8, X(0.12), X(0.88)))
    L.at(70).wave('dart', 10, 0.2, F.loop(-1, 200, 150, 300)).wave('dart', 10, 0.2, F.loop(1, 200, 150, 300))
    L.at(73).do(rocks(7, 75))
    L.at(75).gate(14)

    // ── escalation: rigs in a rock storm ──
    L.at(76).decor('prop_mining_rig', X(0.25), { y: -170 }).decor('prop_mining_rig', X(0.75), { y: -240 })
      .ground('artillery', X(0.22), { y: -140 }).ground('turret', X(0.79), { y: -200 }).ground('artillery', X(0.6), { y: -110 })
    L.at(77).intensity(3).scroll(40, 3).do(rig(X(0.15))).do(rig(X(0.5))).do(rig(X(0.85)))
    L.at(78).do(rocks(11, 105))
    L.at(79.5).wave('lancer', 6, 0.3, F.spreadSelf(X(0.12), X(0.88)))
    L.at(82).wave('sniper', 3, 0.7, F.hover(95, 6, X(0.2), X(0.8)))
    L.at(83.5).do(rig(X(0.33))).do(rig(X(0.67))).wave('ore_rock', 1, 0, F.drift(X(0.36), 10, 70))
    L.at(85).wave('splitter', 3, 0.6, F.hover(145, 6, X(0.2), X(0.8)))
    L.at(88).wave('wasp', 7, 0.18, F.swoop(-1, 0.5, 300)).wave('wasp', 7, 0.18, F.swoop(1, 0.45, 300))
    L.at(90).gate(14)
    L.at(91).scroll(70, 3)

    // ── the narrows: rock curtains, one gap each ──
    L.at(92).intensity(2).radio('HALLORAN', 'Belt narrows here. Rock walls. Find the gaps or make them.')
    L.at(93).do(curtain(X(0.3), 95))
    L.at(96.5).do(curtain(X(0.72), 95)).wave('seeker', 5, 0.25, F.seek(X(0.5)))
    L.at(100).do(curtain(X(0.5), 95)).wave('weaver', 4, 0.4, F.sine(X(0.18), 60, 2, 120)).wave('weaver', 4, 0.4, F.sine(X(0.82), 60, 2, 120))
    L.at(103).wave('ore_rock', 3, 0.6, F.drift(X(0.5), 0, 70))
    L.at(104).decor('prop_mining_rig', X(0.5), { y: -170 })
    row('prop_conveyor', -120)
    L.at(104).ground('fuel', X(0.43), { y: -130 }).ground('fuel', X(0.57), { y: -130 }).ground('turret', X(0.5), { y: -200 }).ground('flak', X(0.5), { y: -90 })
      .ground('flak', X(0.14), { y: -150 }).ground('turret', X(0.86), { y: -150 })
    L.at(106).wave('gunship', 1, 0, F.hoverAt(X(0.5), 128, 9)).wave('dart', 10, 0.25, F.loop(1, 200, 150, 300)).wave('dart', 10, 0.25, F.loop(-1, 200, 150, 300))
    L.at(110).gate(14)

    // ── boss ──
    L.at(111).intensity(1).scroll(20, 4).radio('HALLORAN', 'Big mass on scope. It is eating the belt as it comes.')
    L.at(113.5).radio('KESTREL', 'That is not a rig. That is the thing rigs are made for.')
    L.at(115).do((w) => spawnExcavator(w))
    L.at(116).until('boss_dead')
    L.at(117).radio('HALLORAN', 'Belt is quiet. The ore stops here. Come home, Kestrel.')
    L.at(119).do(() => {})
  },
}
