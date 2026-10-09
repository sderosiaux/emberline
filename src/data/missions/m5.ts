import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import { spawnWarden } from '../../game/bosses/warden'
import { GroundMover, HoverMover, LineMover } from '../../game/movers'
import { PickupKind } from '../../game/entities'
import type { Enemy } from '../../game/entities'
import { explode } from '../../game/fx'
import { P, C } from '../../render/particles'
import { rand } from '../../core/math'
import type { World, Decor } from '../../game/world'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * Secret: the dock vault is slaved to the laser-gate network. Every pylon the
 * player destroys is logged; if none of them survived by the time the vault
 * scrolls in, its seals are already dropped. Shoot it open for a Choir shard.
 */
const pylonsTotal = (w: World) => [...w.flags].filter((f) => f.startsWith('m5_pyl:')).length
const pylonsDown = (w: World) => [...w.flags].filter((f) => f.startsWith('m5_pyl_dead:')).length

registerEnemy({
  id: 'm5_vault', hp: 700, r: 26, sprite: 'm5_vault', layer: 'ground', score: 3000, credits: 300, charge: 10, explode: 'large', target: true,
  init(e) { e.armor = 0 },
  update(e, w) {
    if (e.s.open) return
    const total = pylonsTotal(w)
    if (total > 0 && pylonsDown(w) >= total && e.y > 0) {
      e.s.open = 1
      e.armor = 1
      w.addShake(4)
      for (let i = 0; i < 16; i++) w.parts.spawn(P.Spark, e.x, e.y, rand(-200, 200), rand(-200, 200), 0.5, 2, 0.5, C.violet, 3, true)
      w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.5, 10, 70, C.violet, 0, true)
      w.emit({ type: 'radio', who: 'HALLORAN', text: 'That vault just dropped its seals. The gate network was holding them.' })
    }
  },
  drawBody(ctx, e) { drawSprite(ctx, getSprite(e.s.open ? 'm5_vault_open' : 'm5_vault'), e.x, e.y, 0, 1, 1, e.flash) },
  onDeath(e, w) {
    if (!e.s.open) return
    w.pickup(PickupKind.Core, e.x, e.y, 0, 'core_shard')
    w.secret('vault', 'The sealed dock vault')
  },
})

/** Laser gate: two pylons linked both ways, logged for the vault. */
function spawnGate(w: World, x0: number, x1: number, y = -40) {
  const a = w.spawn('pylon', x0, y, { mover: new GroundMover() })
  const b = w.spawn('pylon', x1, y, { mover: new GroundMover() })
  a.data = b; b.data = a
  for (const p of [a, b]) {
    w.flags.add(`m5_pyl:${p.id}`)
    p.onDeath = (ww, e) => { ww.flags.add(`m5_pyl_dead:${e.id}`) }
  }
  return a
}
const gate = (x0: number, x1: number) => (w: World) => { spawnGate(w, x0, x1) }

/** Escort that rides alongside a ground target (warden guarding a pylon), then leaves when it dies. */
class EscortMover {
  constructor(private target: Enemy, private dx: number, private dy: number) {}
  update(e: Enemy, _w: World, dt: number) {
    const t = this.target
    if (t.dead || t.gone) { e.y -= 90 * dt; if (e.y < -60) e.gone = true; return }
    e.x += (t.x + this.dx - e.x) * Math.min(1, dt * 3)
    e.y += (t.y + this.dy - e.y) * Math.min(1, dt * 3)
    e.noCull = true
  }
}

const guardedGate = (x0: number, x1: number) => (w: World) => {
  const left = spawnGate(w, x0, x1)
  w.spawn('warden', left.x + 70, -80, { mover: new EscortMover(left, 70, -45) })
}

/**
 * The frigate Ashgrove drifts across the fleet engagement, burning. It is set
 * dressing with a clock: fires spread along the hull, and it breaks apart when
 * it reaches the far side.
 */
/** Frigate drawn up-scaled to read at the wide field's size. */
const FS = 1.25

function burningFrigate(w: World) {
  if (w.preview) return
  const d: Decor = { sprite: 'm5_frigate', x: -80, y: -140, rot: 0.5, scale: FS, depth: 0, vx: 0, alpha: 1, above: false }
  w.decor.push(d)
  const fires = ([[14, -24], [-18, 56], [20, 40], [-10, -70], [0, 10]] as const).map(([x, y]) => [x * FS, y * FS] as const)
  let t = 0
  let broke = false
  const step = () => {
    const dt = w.frameDt
    t += dt
    d.x += 62 * dt
    d.y += 34 * dt
    d.rot += 0.02 * dt
    const c = Math.cos(d.rot), s = Math.sin(d.rot)
    const lit = Math.min(fires.length, 1 + Math.floor(t / 3))
    for (let i = 0; i < lit; i++) {
      const [fx, fy] = fires[i]
      const x = d.x + fx * c - fy * s, y = d.y + fx * s + fy * c
      if (Math.random() < 0.5) w.parts.spawn(P.Fire, x + rand(-4, 4), y + rand(-4, 4), rand(-20, 20), rand(-30, 10), 0.5, 5, 13, 0, 1)
      if (Math.random() < 0.25) w.parts.spawn(P.Smoke, x, y, rand(-10, 10), -20, 1.4, 6, 20, C.smokeDark, 0.3)
    }
    if (Math.random() < dt * 0.6) explode(w, d.x + rand(-40, 40), d.y + rand(-100, 100), 'small', false, C.orange, true)
    if (d.x > PW * 0.8 && !broke) {
      broke = true
      w.emit({ type: 'radio', who: 'ASHGROVE', text: 'Ashgrove to fleet — we are losing her. Good hunting, Kestrel.' })
      for (let k = 0; k < 6; k++) w.after(k * 0.25, () => explode(w, d.x + rand(-50, 50), d.y + rand(-125, 125), k === 5 ? 'huge' : 'large', false, C.orange, k % 2 === 1))
      w.after(1.5, () => { const i = w.decor.indexOf(d); if (i >= 0) w.decor.splice(i, 1) })
      return
    }
    if (d.y > PH + 300) { const i = w.decor.indexOf(d); if (i >= 0) w.decor.splice(i, 1); return }
    w.after(0, step)
  }
  step()
}

const walls = (L: import('../../game/level').LevelScript, t0: number, t1: number) => {
  for (let t = t0; t < t1; t += 2.6) L.at(t).decor('m5_wall_l', 28, { y: -120 }).decor('m5_wall_r', PW - 28, { y: -120 })
}

const flank = (side: -1 | 1, y: number) => (e: Enemy) => {
  const x = side < 0 ? 70 : PW - 70
  e.x = side < 0 ? -30 : PW + 30
  e.y = y
  e.mover = new HoverMover(x, y, 1.2, 7, side * -60, -40)
}

export const m5: MissionDef = {
  id: 'm5', num: '05', name: 'Halo Dock', biome: 'halo', track: 'm5', scroll: 80,
  briefing: [
    'Halo Dock built half the fleet. The Choir took it in a night and kept the lights on.',
    'The slipways are running again. We do not know what they are building.',
    'Hull run on the exterior, then straight through the dock. Do not slow down.',
    'The Ashgrove went in ahead of you. She stopped answering an hour ago.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    const row = (sprite: string, y: number) => { for (let x = 70; x < PW + 70; x += 140) L.decor(sprite, x, { y }) }
    // ── exterior hull run ──
    L.at(0).radio('HALLORAN', 'Halo Dock. Exterior first. Everything bolted to that hull shoots.')
    row('prop_girder_h', -80)
    L.at(1.5).wave('dart', 9, 0.08, F.vee(X(0.5), 200))
    L.at(3).ground('turret', X(0.16)).ground('turret', X(0.84)).ground('turret', X(0.5), { y: -140 })
    L.at(3).decor('prop_girder_h', X(0.5), { y: -160 })
    L.at(4.5).wave('wasp', 7, 0.16, F.swoop(-1, 0.4, 320)).wave('dart', 7, 0.14, F.column(X(0.85), 230, 0))
    L.at(6.5).decor('prop_hangar_door', X(0.27), { y: -140 }).ground('hangar', X(0.27), { y: -140 }).ground('turret', X(0.42), { y: -100 })
    L.at(7.5).radio('HALLORAN', 'Hangar. Kill it before it empties.')
    L.at(10).ground('silo', X(0.68)).ground('silo', X(0.8), { y: -80 }).wave('missileer', 3, 0.5, F.hover(120, 6, X(0.2), X(0.8)))
    L.at(12.5).wave('dart', 9, 0.14, F.swoop(1, 0.5, 320)).wave('dart', 9, 0.14, F.swoop(-1, 0.45, 320))
    L.at(15).gate(12)
    L.at(15.1).horde([['dart', 10], ['wasp', 8], ['dart', 10], ['missileer', 4], ['dart', 10], ['bomber', 2]]).reveal({ banner: 'Dock garrison launching', play: true, hold: 7 }).radio('HALLORAN', 'Every launch rail on the dock just fired. Hold the line, Kestrel.')
    L.at(15.15).gate(20)

    // ── laser gates ──
    L.at(16.5).radio('KESTREL', 'Laser gate. It blinks. I can count.')
    L.at(17.5).do(gate(24, PW - 24))
    L.at(20).wave('dart', 7, 0.13, F.column(X(0.25), 210)).wave('dart', 7, 0.13, F.column(X(0.75), 210))
    L.at(22).do(gate(24, PW / 2 + 20)).ground('turret', PW - 70).ground('flak', PW - 150, { y: -90 })
    L.at(24.5).do(gate(PW / 2 - 20, PW - 24)).ground('turret', 70).ground('flak', 150, { y: -90 })
    L.at(26.5).wave('lancer', 6, 0.3, F.spreadSelf(X(0.12), X(0.88)))
    L.at(28.5).ground('hangar', X(0.75), { y: -60 }).ground('flak', X(0.28))
    L.at(30).do(guardedGate(24, PW - 24))
    L.at(31).radio('HALLORAN', 'That warden is shielding the gate. Pop the warden, then the gate.')
    L.at(33).wave('weaver', 5, 0.35, F.sine(X(0.3), 150, 2, 135)).wave('weaver', 5, 0.35, F.sine(X(0.7), 150, 2, 135))
    L.at(36).gate(12)

    // ── interior ──
    L.at(37.5).phase('interior').radio('HALLORAN', 'You are inside the dock. Tight quarters. Expect company from the walls.')
    walls(L, 37.5, 76)
    L.at(38.5).decor('prop_dock_arm', X(0.2), { y: -150 }).decor('prop_hangar_door', X(0.78), { y: -120 })
    L.at(40).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? 1 : -1, 128)(e) })
    L.at(41).wave('lancer', 4, 0.3, F.spreadSelf(X(0.2), X(0.8)))
    L.at(43.5).wave('wasp', 8, 0.11, F.sweep(-1, 95, 340, 60)).ground('turret', 90, { y: -60 }).ground('turret', PW - 90, { y: -60 }).ground('turret', X(0.5), { y: -120 })
    L.at(46).wave('wasp', 8, 0.11, F.sweep(1, 128, 340, 60))
    L.at(48).do(gate(70, PW - 70)).decor('prop_girder_h', X(0.5) - 70, { y: -40 }).decor('prop_girder_h', X(0.5) + 70, { y: -40 })
    L.at(50).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? -1 : 1, 94)(e) }).wave('lancer', 6, 0.25, F.spreadSelf(X(0.12), X(0.88)))
    L.at(53).wave('missileer', 3, 0.4, F.hover(110, 8, X(0.2), X(0.8))).wave('warden', 1, 0, F.hoverAt(X(0.5), 94, 8))
    L.at(55).decor('prop_dock_arm', X(0.8), { y: -150 }).ground('silo', 110).ground('silo', PW - 110, { y: -70 }).ground('silo', X(0.5), { y: -110 })
    L.at(57.5).gate(12)
    L.at(59).do(gate(70, PW / 2)).do(gate(PW / 2 + 40, PW - 70))
    L.at(60.5).wave('sniper', 4, 0.4, F.hover(85, 6, X(0.15), X(0.85)))
    L.at(62).radio('KESTREL', 'Armoured vault on the slipway. Locked down tight. Something upstream holds the seals.')
    L.at(63).ground('m5_vault', X(0.5), { y: -50 }).ground('turret', X(0.5) - 120, { y: -30 }).ground('turret', X(0.5) + 120, { y: -30 })
    L.at(64.5).wave('lancer', 7, 0.25, F.spreadSelf(X(0.1), X(0.9)))
    L.at(67).wave('phantom', 3, 0.6, F.hover(145, 6, X(0.2), X(0.8)))
    L.at(69.5).decor('prop_hangar_door', X(0.25), { y: -120 }).ground('hangar', X(0.25), { y: -120 }).ground('repair_cache', X(0.75))
    L.at(72.5).wave('wasp', 7, 0.12, F.sweep(-1, 77, 340, 70)).wave('wasp', 7, 0.12, F.sweep(1, 110, 340, 70))
    L.at(76).gate(12)

    // ── fleet engagement, outside again ──
    L.at(78).phase('exterior').intensity(3).radio('HALLORAN', 'Out of the dock. Choir fleet forming up ahead. And... one of ours.')
    L.at(79).do(burningFrigate)
    L.at(80.5).radio('ASHGROVE', 'Ashgrove to any ship — we are burning, keep them off us!')
    L.at(81.5).wave('gunship', 1, 0, F.hoverAt(X(0.3), 120, 10)).wave('dart', 10, 0.18, F.loop(1, 190, 150, 300))
    L.at(84.5).wave('missileer', 3, 0.4, F.hover(180, 8, X(0.12), X(0.88))).wave('warden', 1, 0, F.hoverAt(X(0.5), 170, 9))
    L.at(87.5).wave('lancer', 6, 0.3, F.spreadSelf(X(0.1), X(0.9)))
    L.at(90).gate(14)
    L.at(91.5).radio('CHOIR', 'THE DOCK SINGS OUR SHIPS INTO BEING. YOU ARE A WRONG NOTE.', 'enemy')
    L.at(92.5).do((w) => { w.spawn('carrier', X(0.5), -90, { mover: new LineMover(0, 30) }) })
      .wave('gunship', 1, 0, F.hoverAt(X(0.8), 145, 10, PW + 60)).wave('gunship', 1, 0, F.hoverAt(X(0.2), 145, 10, -60))
    L.at(96).wave('missileer', 4, 0.4, F.hover(210, 8, X(0.1), X(0.9))).wave('warden', 2, 0.6, F.hover(180, 9, X(0.25), X(0.75)))
    L.at(99.5).wave('dart', 12, 0.1, F.path([[-30, 100], [X(0.3), 255], [X(0.7), 170], [PW + 40, 305]], 380))
      .wave('dart', 12, 0.1, F.path([[PW + 30, 60], [X(0.7), 215], [X(0.3), 130], [-40, 265]], 380))
    L.at(102.5).wave('bomber', 3, 0.8, F.column(X(0.35), 70)).ground('silo', X(0.84)).ground('turret', X(0.2))
    L.at(105).gate(14)

    // ── last stretch: the defence ring wakes ──
    L.at(106.5).intensity(2)
    row('prop_girder_h', -80)
    L.at(106.5).ground('flak', X(0.15)).ground('flak', X(0.85)).ground('hangar', X(0.5), { y: -100 })
    L.at(109).wave('splitter', 4, 0.5, F.hover(135, 7, X(0.15), X(0.85)))
    L.at(112.5).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? 1 : -1, 110)(e) })
      .wave('dart', 9, 0.16, F.swoop(-1, 0.5, 320)).wave('dart', 9, 0.16, F.swoop(1, 0.45, 320))
    L.at(116.5).gate(12)
    L.at(118).intensity(1).scroll(25, 4).radio('HALLORAN', 'Station defence core is spinning up. That ring is its shield. Find the gaps.')
    L.at(121.5).do((w) => spawnWarden(w))
    L.at(122.5).until('boss_dead')
    L.at(123.5).radio('HALLORAN', 'Dock is dark. Whatever they were building, they will not finish it here.')
    L.at(125.5).do(() => {})
  },
}
