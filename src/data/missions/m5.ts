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
  w.spawn('warden', left.x + 60, -80, { mover: new EscortMover(left, 60, -50) })
}

/**
 * The frigate Ashgrove drifts across the fleet engagement, burning. It is set
 * dressing with a clock: fires spread along the hull, and it breaks apart when
 * it reaches the far side.
 */
function burningFrigate(w: World) {
  if (w.preview) return
  const d: Decor = { sprite: 'm5_frigate', x: -60, y: -120, rot: 0.5, scale: 1, depth: 0, vx: 0, alpha: 1, above: false }
  w.decor.push(d)
  const fires: [number, number][] = [[14, -24], [-18, 56], [20, 40], [-10, -70], [0, 10]]
  let t = 0
  let broke = false
  const step = () => {
    const dt = w.frameDt
    t += dt
    d.x += 42 * dt
    d.y += 38 * dt
    d.rot += 0.02 * dt
    const c = Math.cos(d.rot), s = Math.sin(d.rot)
    const lit = Math.min(fires.length, 1 + Math.floor(t / 3))
    for (let i = 0; i < lit; i++) {
      const [fx, fy] = fires[i]
      const x = d.x + fx * c - fy * s, y = d.y + fx * s + fy * c
      if (Math.random() < 0.5) w.parts.spawn(P.Fire, x + rand(-4, 4), y + rand(-4, 4), rand(-20, 20), rand(-30, 10), 0.5, 5, 13, 0, 1)
      if (Math.random() < 0.25) w.parts.spawn(P.Smoke, x, y, rand(-10, 10), -20, 1.4, 6, 20, C.smokeDark, 0.3)
    }
    if (Math.random() < dt * 0.6) explode(w, d.x + rand(-30, 30), d.y + rand(-80, 80), 'small', false, C.orange, true)
    if (d.x > PW * 0.8 && !broke) {
      broke = true
      w.emit({ type: 'radio', who: 'ASHGROVE', text: 'Ashgrove to fleet — we are losing her. Good hunting, Kestrel.' })
      for (let k = 0; k < 6; k++) w.after(k * 0.25, () => explode(w, d.x + rand(-40, 40), d.y + rand(-100, 100), k === 5 ? 'huge' : 'large', false, C.orange, k % 2 === 1))
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
    // ── exterior hull run ──
    L.at(0).radio('HALLORAN', 'Halo Dock. Exterior first. Everything bolted to that hull shoots.')
      .decor('prop_girder_h', 140, { y: -80 }).decor('prop_girder_h', 420, { y: -80 })
    L.at(2).wave('dart', 7, 0.1, F.vee(PW / 2, 190))
    L.at(4).ground('turret', 110).ground('turret', 450).decor('prop_girder_h', 280, { y: -160 })
    L.at(6).wave('wasp', 6, 0.2, F.swoop(-1, 0.4, 280))
    L.at(8).decor('prop_hangar_door', 150, { y: -140 }).ground('hangar', 150, { y: -140 }).ground('turret', 250, { y: -100 })
    L.at(9).radio('HALLORAN', 'Hangar. Kill it before it empties.')
    L.at(12).ground('silo', 400).ground('silo', 470, { y: -80 }).wave('missileer', 2, 0.6, F.hover(140, 6, 160, PW - 160))
    L.at(15).wave('dart', 8, 0.18, F.swoop(1, 0.5, 280))
    L.at(18).gate()

    // ── laser gates ──
    L.at(20).radio('KESTREL', 'Laser gate. It blinks. I can count.')
    L.at(21).do(gate(24, PW - 24))
    L.at(24).wave('dart', 6, 0.15, F.column(PW * 0.3, 200)).wave('dart', 6, 0.15, F.column(PW * 0.7, 200))
    L.at(26).do(gate(24, PW / 2 + 20)).ground('turret', PW - 60)
    L.at(28.5).do(gate(PW / 2 - 20, PW - 24)).ground('turret', 60)
    L.at(31).wave('lancer', 4, 0.4, F.spreadSelf(100, PW - 100))
    L.at(33).ground('hangar', 420, { y: -60 }).ground('flak', 160)
    L.at(35).do(guardedGate(24, PW - 24))
    L.at(36).radio('HALLORAN', 'That warden is shielding the gate. Pop the warden, then the gate.')
    L.at(38).wave('weaver', 4, 0.4, F.sine(PW / 2, 150, 2, 130))
    L.at(42).gate()

    // ── interior ──
    L.at(44).phase('interior').radio('HALLORAN', 'You are inside the dock. Tight quarters. Expect company from the walls.')
    walls(L, 44, 88)
    L.at(45).decor('prop_dock_arm', 120, { y: -150 }).decor('prop_hangar_door', 440, { y: -120 })
    L.at(47).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? 1 : -1, 150)(e) })
    L.at(48).wave('lancer', 3, 0.35, F.spreadSelf(160, PW - 160))
    L.at(51).wave('wasp', 6, 0.14, F.sweep(-1, 110, 260, 60)).ground('turret', 80, { y: -60 }).ground('turret', PW - 80, { y: -60 })
    L.at(54).wave('wasp', 6, 0.14, F.sweep(1, 150, 260, 60))
    L.at(56).do(gate(70, PW - 70)).decor('prop_girder_h', PW / 2, { y: -40 })
    L.at(58).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? -1 : 1, 110)(e) }).wave('lancer', 4, 0.3, F.spreadSelf(120, PW - 120))
    L.at(62).wave('missileer', 2, 0.5, F.hover(130, 8, 170, PW - 170)).wave('warden', 1, 0, F.hoverAt(PW / 2, 110, 8))
    L.at(64).decor('prop_dock_arm', 440, { y: -150 }).ground('silo', 100).ground('silo', PW - 100, { y: -70 })
    L.at(67).gate()
    L.at(69).do(gate(70, PW / 2)).do(gate(PW / 2 + 40, PW - 70))
    L.at(71).wave('sniper', 3, 0.5, F.hover(100, 6, 110, PW - 110))
    L.at(73).radio('KESTREL', 'Armoured vault on the slipway. Locked down tight. Something upstream holds the seals.')
    L.at(74).ground('m5_vault', PW / 2, { y: -50 }).ground('turret', PW / 2 - 90, { y: -30 }).ground('turret', PW / 2 + 90, { y: -30 })
    L.at(76).wave('lancer', 5, 0.3, F.spreadSelf(90, PW - 90))
    L.at(79).wave('phantom', 2, 0.8, F.hover(170, 6, 150, PW - 150))
    L.at(82).decor('prop_hangar_door', 140, { y: -120 }).ground('hangar', 140, { y: -120 }).ground('repair_cache', 420)
    L.at(85).wave('wasp', 5, 0.15, F.sweep(-1, 90, 260, 70)).wave('wasp', 5, 0.15, F.sweep(1, 130, 260, 70))
    L.at(89).gate()

    // ── fleet engagement, outside again ──
    L.at(92).phase('exterior').intensity(3).radio('HALLORAN', 'Out of the dock. Choir fleet forming up ahead. And... one of ours.')
    L.at(93).do(burningFrigate)
    L.at(95).radio('ASHGROVE', 'Ashgrove to any ship — we are burning, keep them off us!')
    L.at(96).wave('gunship', 1, 0, F.hoverAt(PW * 0.3, 140, 10)).wave('dart', 8, 0.2, F.loop(1, 220))
    L.at(100).wave('missileer', 2, 0.5, F.hover(210, 8, 120, PW - 120)).wave('warden', 1, 0, F.hoverAt(PW / 2, 200, 9))
    L.at(104).wave('lancer', 4, 0.4, F.spreadSelf(100, PW - 100))
    L.at(107).gate(20)
    L.at(109).radio('CHOIR', 'THE DOCK SINGS OUR SHIPS INTO BEING. YOU ARE A WRONG NOTE.', 'enemy')
    L.at(110).do((w) => { w.spawn('carrier', PW / 2, -90, { mover: new LineMover(0, 30) }) })
      .wave('gunship', 1, 0, F.hoverAt(PW * 0.8, 170, 10, PW + 60))
    L.at(114).wave('missileer', 3, 0.5, F.hover(250, 8, 100, PW - 100)).wave('warden', 2, 0.6, F.hover(210, 9, 150, PW - 150))
    L.at(119).wave('dart', 10, 0.12, F.path([[-30, 120], [PW * 0.3, 300], [PW * 0.7, 200], [PW + 40, 360]], 300))
    L.at(123).wave('bomber', 2, 1, F.column(PW * 0.35, 70)).ground('silo', 470).ground('turret', 120)
    L.at(126).gate(26)

    // ── last stretch: the defence ring wakes ──
    L.at(128).intensity(2).decor('prop_girder_h', 140, { y: -80 }).decor('prop_girder_h', 420, { y: -80 })
      .ground('flak', 120).ground('flak', PW - 120).ground('hangar', PW / 2, { y: -100 })
    L.at(131).wave('splitter', 3, 0.7, F.hover(160, 7, 120, PW - 120))
    L.at(135).wave('sniper', 2, 0.6, F.self(0, 0), { onSpawn: (e, _w, i) => flank(i ? 1 : -1, 130)(e) }).wave('dart', 8, 0.2, F.swoop(-1, 0.5, 280))
    L.at(140).gate()
    L.at(142).intensity(1).scroll(25, 4).radio('HALLORAN', 'Station defence core is spinning up. That ring is its shield. Find the gaps.')
    L.at(146).do((w) => spawnWarden(w))
    L.at(147).until('boss_dead')
    L.at(148).radio('HALLORAN', 'Dock is dark. Whatever they were building, they will not finish it here.')
    L.at(150).do(() => {})
  },
}
