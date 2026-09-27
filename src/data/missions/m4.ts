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
    if (!onScreen(e, 20) || e.y > w.player.y - 170 || !w.player.alive) return
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
    e.x += 330 * dt
    e.y = e.s.y0 + Math.sin(e.age * 3) * 14
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
    w.after(i * 0.35, () => w.spawn(id, rand(30, PW - 30), -40, { mover: new LineMover(rand(-25, 25), vy + rand(-20, 30)) }))
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
    // ── the belt: learn the rocks ──
    L.at(0).radio('HALLORAN', 'You are in the Shoals. Every rock out here is either ore or cover. The Choir uses both.')
      .decor('prop_rock_bg', 120, { y: -260, depth: 0.5 }).decor('prop_rock_bg', 460, { y: -520, depth: 0.5, rot: 2 })
    L.at(2).do(rocks(6, 70))
    L.at(4.5).wave('dart', 6, 0.12, F.vee(PW / 2, 160))
    L.at(7).wave('ore_rock', 1, 0, F.drift(PW / 2, 0, 60)).do((w) => {
      w.spawn('rock_l', PW / 2 - 110, -60, { mover: new LineMover(8, 60) })
      w.spawn('rock_l', PW / 2 + 110, -80, { mover: new LineMover(-8, 60) })
    })
    L.at(8).radio('KESTREL', 'Green veins. I know what those are worth.')
    L.at(10).wave('dart', 6, 0.25, F.swoop(-1, 0.4)).wave('dart', 6, 0.25, F.swoop(1, 0.45))
    L.at(13).wave('wasp', 4, 0.3, F.hover(150, 5)).do(rocks(4, 90))
    // first mining platform
    L.at(15).decor('prop_mining_rig', 140, { y: -160 }).decor('prop_conveyor', 330, { y: -110 }).decor('prop_conveyor', 470, { y: -110 })
      .ground('turret', 110, { y: -120 }).ground('turret', 175, { y: -200 }).ground('cache', 420, { y: -110 })
    L.at(18).wave('weaver', 4, 0.5, F.sine(PW * 0.72, 70, 2.2, 110)).wave('ore_rock', 1, 0, F.drift(80, 10, 70))
    L.at(21).gate()

    // ── drill rigs: thread the beams ──
    L.at(23).scroll(35, 3).radio('HALLORAN', 'Drill rigs ahead. They cut rock with lasers. They will cut you with the same lasers.')
    L.at(24).do(rig(150)).do(rig(410))
    L.at(25).radio('KESTREL', 'Beams move together. Stay in the gap, kill the rig.')
    L.at(27).wave('dart', 5, 0.2, F.column(PW / 2, 170))
    L.at(30).wave('weaver', 3, 0.5, F.sine(PW / 2, 60, 2, 100))
    L.at(33).decor('prop_mining_rig', 440, { y: -170 }).ground('turret', 470, { y: -120 }).ground('flak', 400, { y: -190 })
    L.at(35).do(rig(90)).do(rig(280)).do(rig(470))
    L.at(37).wave('lancer', 3, 0.5, F.spreadSelf(140, PW - 140))
    L.at(40).wave('ore_rock', 2, 1.2, F.drift(PW / 2, 0, 65))
    L.at(42).wave('wasp', 3, 0.3, F.hover(130, 4, 120, PW - 120))
    L.at(45).gate()
    L.at(46).scroll(70, 3)

    // ── the ghost (secret) ──
    L.at(47).wave('missileer', 2, 0.8, F.hover(140, 6, 150, PW - 150)).do(rocks(5, 60))
    L.at(51).radio('HALLORAN', 'Sensor ghost on the belt, bearing zero-nine-zero. Ignore it.')
    L.at(52).do((w) => {
      w.spawn('rock_l', 170, -70, { mover: new LineMover(0, 55) })
      w.spawn('rock_l', 380, -110, { mover: new LineMover(0, 55) })
    })
    L.at(54).wave('dart', 6, 0.18, F.swoop(1, 0.5))
    L.at(55.5).do((w) => { w.spawn('m4_rift_rock', -40, 72) })
    L.at(58).wave('weaver', 4, 0.4, F.cross([[-30, 120], [PW * 0.5, 240], [PW + 40, 380]], 200))
    L.at(61).gate()

    // ── minefield + seekers ──
    L.at(63).radio('KESTREL', 'Minefield. They laid it across the ore lanes.')
    for (let row = 0; row < 4; row++) {
      L.at(64 + row * 2.2).do((w) => {
        const gap = row % 2 ? PW * 0.3 : PW * 0.7
        for (let x = 40; x < PW; x += 70) if (Math.abs(x - gap) > 60) w.spawn('mine', x + rand(-10, 10), -30, { mover: new LineMover(0, 75) })
      })
    }
    L.at(66).wave('seeker', 5, 0.3, F.seek(PW * 0.2))
    L.at(69).wave('seeker', 5, 0.3, F.seek(PW * 0.8))
    L.at(71).wave('seeker', 6, 0.12, F.sweep(-1, 90, 220, 40)).wave('seeker', 6, 0.12, F.sweep(1, 130, 220, 40))
    L.at(73).ground('repair_cache', 280)
    L.at(75).gate()

    // ── carrier group ──
    L.at(77).radio('HALLORAN', 'Choir carrier with escorts. Wardens first, or you are shooting a wall.')
    L.at(78).do((w) => {
      w.spawn('carrier', PW / 2, -90, { mover: new LineMover(0, 26) })
      for (const [x, delay] of [[PW * 0.27, 1.2], [PW * 0.73, 1.6]] as const) {
        w.after(delay, () => w.spawn('warden', x, -40, { mover: new HoverMover(x, 150, 1.8, 16, 0, -100) }))
      }
    })
    L.at(81).radio('CHOIR', 'THE STONE REMEMBERS THE HAMMER. SO WILL YOU.', 'enemy')
    L.at(84).wave('missileer', 2, 0.6, F.hover(230, 8, 90, PW - 90))
    L.at(88).wave('dart', 8, 0.25, F.loop(-1, 240))
    L.at(92).do(rocks(5, 70))
    L.at(95).gate(30)

    // ── escalation: rigs in a rock storm ──
    L.at(97).decor('prop_mining_rig', 150, { y: -170 }).decor('prop_mining_rig', 420, { y: -240 })
      .ground('artillery', 130, { y: -140 }).ground('turret', 440, { y: -200 })
    L.at(98).intensity(3).scroll(40, 3).do(rig(120)).do(rig(440))
    L.at(99).do(rocks(8, 100))
    L.at(101).wave('lancer', 4, 0.5, F.spreadSelf(100, PW - 100))
    L.at(104).wave('sniper', 2, 1, F.hover(110, 6, 120, PW - 120))
    L.at(106).do(rig(280)).wave('ore_rock', 1, 0, F.drift(200, 10, 70))
    L.at(108).wave('splitter', 2, 1, F.hover(170, 6, 170, PW - 170))
    L.at(112).wave('wasp', 5, 0.25, F.swoop(-1, 0.5))
    L.at(115).gate()
    L.at(116).scroll(70, 3)

    // ── the narrows: rock curtains, one gap each ──
    L.at(117).intensity(2).radio('HALLORAN', 'Belt narrows here. Rock walls. Find the gaps or make them.')
    L.at(118).do(curtain(PW * 0.3, 85))
    L.at(122).do(curtain(PW * 0.72, 85)).wave('seeker', 4, 0.3, F.seek(PW / 2))
    L.at(126).do(curtain(PW * 0.5, 85)).wave('weaver', 3, 0.5, F.sine(PW * 0.2, 50, 2, 110))
    L.at(130).wave('ore_rock', 3, 0.6, F.drift(PW / 2, 0, 70))
    L.at(131).decor('prop_mining_rig', 280, { y: -170 }).decor('prop_conveyor', 90, { y: -120 }).decor('prop_conveyor', 470, { y: -120 })
      .ground('fuel', 240, { y: -130 }).ground('fuel', 320, { y: -130 }).ground('turret', 280, { y: -200 }).ground('flak', 280, { y: -90 })
    L.at(134).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 9)).wave('dart', 8, 0.3, F.loop(1, 230))
    L.at(140).gate(24)

    // ── boss ──
    L.at(142).intensity(1).scroll(20, 4).radio('HALLORAN', 'Big mass on scope. It is eating the belt as it comes.')
    L.at(145).radio('KESTREL', 'That is not a rig. That is the thing rigs are made for.')
    L.at(147).do((w) => spawnExcavator(w))
    L.at(148).until('boss_dead')
    L.at(149).radio('HALLORAN', 'Belt is quiet. The ore stops here. Come home, Kestrel.')
    L.at(151).do(() => {})
  },
}
