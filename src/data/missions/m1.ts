import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import { spawnSmelter } from '../../game/bosses/smelter'
import { PathMover } from '../../game/movers'
import { PickupKind } from '../../game/entities'
import { P, C } from '../../render/particles'
import { rand } from '../../core/math'
import type { World } from '../../game/world'

/**
 * Secret: three flare stacks burn along refinery row. Put all three out before
 * they scroll away and a Choir tithe barge — hauling what it skimmed from the
 * refineries — comes looking for the problem.
 */
registerEnemy({
  id: 'flare_stack', hp: 160, r: 16, sprite: 'prop_flare_stack', layer: 'ground', score: 500, credits: 20, charge: 3, explode: 'medium', target: true,
  update(e, w) { if (Math.random() < 0.5) w.parts.spawn(P.Fire, e.x + rand(-3, 3), e.y - 4, rand(-10, 10), -40, 0.5, 5, 12, 0, 1, true) },
  onDeath(_e, w) {
    const n = (w.flags.has('flare1') ? 1 : 0) + (w.flags.has('flare2') ? 1 : 0)
    w.flags.add(n === 0 ? 'flare1' : n === 1 ? 'flare2' : 'flare3')
    if (n === 2) summonBarge(w)
  },
})

registerEnemy({
  id: 'tithe_barge', hp: 900, r: 36, sprite: 'gunship', layer: 'air', score: 5000, credits: 1500, charge: 20, explode: 'large', contact: 0,
  init(e) { e.noCull = true; e.s.ignoreGate = 1 },
  update(e, w) {
    if (Math.random() < 0.4) w.parts.spawn(P.Glow, e.x + rand(-30, 30), e.y + rand(-20, 20), 0, 40, 0.5, 5, 1, C.credit)
    if (e.mover?.done) { e.gone = true; w.emit({ type: 'radio', who: 'HALLORAN', text: 'The barge jumped out. Shame. It was heavy with something.' }) }
  },
  onDeath(e, w) {
    w.secret('tithe', 'The tithe barge')
    for (let i = 0; i < 10; i++) w.pickup(PickupKind.CreditBig, e.x + rand(-40, 40), e.y + rand(-30, 30), 60)
  },
})

function summonBarge(w: World) {
  w.emit({ type: 'radio', who: 'CHOIR', text: 'WHO SNUFFS THE CANDLES. THE TITHE WILL SEE.', tone: 'enemy' })
  w.after(2.5, () => {
    const e = w.spawn('tithe_barge', -80, 120, { mover: new PathMover([[-80, 120], [PW * 0.3, 170], [PW * 0.7, 150], [PW + 100, 110]], 55, false) })
    e.scale = 1.25
  })
}

export const m1: MissionDef = {
  id: 'm1', num: '01', name: 'Cinder Reach', biome: 'cinder', track: 'm1', scroll: 55,
  briefing: [
    'Three refinery stations on Cinder Reach stopped answering at 04:10.',
    'We sent survey drones. The ones that came back were not ours anymore.',
    'Fleet thinks it is sabotage. Your orders are simpler:',
    'fly the refinery row and find out what is shooting at us.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    const row = (sprite: string, y: number) => { for (let x = 70; x < PW + 70; x += 140) L.decor(sprite, x, { y }) }
    L.at(0).radio('HALLORAN', "Kestrel, you're over Cinder Reach. Anything that hums is hostile. Anything that glows pink is worse.")
      .decor('prop_mesa', X(0.16), { y: -220 }).decor('prop_mesa', X(0.86), { y: -520 })
    // opening: popcorn from the first second, so the player learns to move and shoot by doing it
    L.at(1.2).wave('dart', 7, 0.08, F.vee(X(0.5), 170))
    L.at(3.2).wave('dart', 8, 0.2, F.swoop(-1, 0.45, 280))
    L.at(4.4).wave('dart', 8, 0.2, F.swoop(1, 0.5, 280))
    L.at(6).decor('prop_pad', X(0.75), { y: -120 }).ground('turret', X(0.75), { y: -120 }).ground('turret', X(0.25), { y: -160 })
    L.at(7).wave('wasp', 5, 0.25, F.hover(120, 4.5))
    L.at(8).ground('cache', X(0.12))
    L.at(10).wave('dart', 6, 0.15, F.column(X(0.2), 230, 0)).wave('dart', 6, 0.15, F.column(X(0.8), 230, 0))
    L.at(11.5).gate(10)
    L.at(12).radio('KESTREL', 'Contacts are Choir-pattern. Old mining drones, new manners.')
    L.at(12.5).wave('weaver', 5, 0.4, F.sine(X(0.22), 110, 2.4, 130)).wave('weaver', 5, 0.4, F.sine(X(0.78), 110, 2.4, 130))
    L.at(14)
    row('prop_pipeline_h', -60)
    L.at(15).wave('lancer', 4, 0.3, F.spreadSelf(X(0.15), X(0.85))).radio('HALLORAN', 'Interceptors. They charge where you ARE, not where you will be.')
    L.at(16.5).wave('dart', 10, 0.1, F.loop(-1, 200, 150, 300))
    // refinery cluster: fuel tanks next to turrets teach chain reactions
    L.at(18).decor('prop_refinery', X(0.27), { y: -140 })
      .ground('fuel', X(0.45), { y: -60 }).ground('fuel', X(0.5), { y: -80 }).ground('fuel', X(0.47), { y: -100 })
      .ground('turret', X(0.54), { y: -60 }).ground('turret', X(0.4), { y: -110 }).ground('flak', X(0.62), { y: -130 })
    L.at(19).radio('HALLORAN', 'Those are fuel tanks. I am legally obliged to tell you not to shoot them near turrets.')
    L.at(20.5).ground('cache', X(0.8)).wave('dart', 7, 0.16, F.column(X(0.82), 220, 0))
    L.at(22).wave('bomber', 1, 0, F.column(X(0.35), 60)).wave('bomber', 1, 0, F.column(X(0.68), 60))
      .wave('dart', 6, 0.12, F.vee(X(0.5), 90, 50, 20))
    L.at(24).gate(12)
    L.at(24.1).horde([['dart', 9], ['dart', 8], ['wasp', 6], ['dart', 9], ['bomber', 2]]).reveal({ banner: 'Massed contacts', play: true, hold: 7 }).radio('HALLORAN', 'Kestrel, pull your scope out. That is not a patrol. That is a swarm.')
    L.at(24.15).gate(20)
    // the ore train crosses the whole field
    L.at(25).radio('HALLORAN', 'Ore train on the east line. The cargo cars are full of refined credits. Were full.')
    row('prop_rail', -60)
    L.at(25).do((w) => {
      const cars = ['train_engine', 'train_gun', 'train_cargo', 'train_fuel', 'train_cargo', 'train_gun', 'train_cargo', 'train_fuel', 'train_cargo']
      cars.forEach((id, i) => {
        w.after(1.2, () => {
          const e = w.spawn(id, -50 - i * 60, -60 + w.scroll * 1.2, { mover: null })
          e.mover = new TrainMover(125)
        })
      })
    })
    L.at(28).wave('dart', 8, 0.18, F.swoop(-1, 0.3, 300)).wave('dart', 8, 0.18, F.swoop(1, 0.3, 300))
    L.at(31).wave('wasp', 6, 0.2, F.hover(150, 4.5))
    // radar station: destroy it or it keeps calling interceptors
    L.at(33).decor('prop_tank_farm', X(0.72), { y: -120 }).ground('radar', X(0.7), { y: -80 })
      .ground('turret', X(0.8), { y: -60 }).ground('turret', X(0.6), { y: -120 }).ground('turret', X(0.3), { y: -90 })
    L.at(34).radio('KESTREL', "There's a radar mast on the tank farm. It'll keep calling friends.")
    // secret flare stacks, placed off the obvious path
    L.at(35).ground('flare_stack', 34, { y: -40 })
    L.at(38).ground('flare_stack', PW - 34, { y: -40 })
    L.at(36).wave('gunship', 1, 0, F.hoverAt(X(0.5), 130, 8)).wave('dart', 10, 0.25, F.loop(-1, 200, 140, 280)).wave('dart', 10, 0.25, F.loop(1, 200, 140, 280))
    L.at(38).radio('HALLORAN', 'Gunship. Keep moving and let it waste its breath.')
    L.at(41).gate(20)
    L.at(42).phase('dusk').intensity(3).ground('flare_stack', X(0.5), { y: -40 }).decor('prop_mesa', X(0.8), { y: -220 })
    L.at(43).ground('tank', -30, { vx: 60, y: 30 }).ground('tank', -80, { vx: 60, y: 30 }).ground('tank', -130, { vx: 60, y: 30 }).ground('tank', -180, { vx: 60, y: 30 })
    L.at(44.5).wave('missileer', 3, 0.4, F.hover(110, 6, X(0.2), X(0.8))).wave('dart', 7, 0.1, F.vee(X(0.5), 190))
    L.at(47).ground('artillery', X(0.2)).ground('artillery', X(0.82), { y: -80 }).ground('turret', X(0.3), { y: -70 })
    L.at(48.5).wave('weaver', 8, 0.28, F.cross([[-30, 90], [PW * 0.5, 230], [PW + 40, 380]], 260))
    L.at(50).ground('repair_cache', X(0.5))
    L.at(51).wave('splitter', 3, 0.6, F.hover(140, 5, X(0.2), X(0.8)))
    L.at(53).gate(14)
    L.at(54).decor('prop_refinery', X(0.7), { y: -140 }).ground('fuel', X(0.58)).ground('fuel', X(0.62), { y: -70 })
      .ground('turret', X(0.68), { y: -90 }).ground('flak', X(0.8), { y: -40 }).ground('flak', X(0.2), { y: -60 })
    L.at(55).wave('lancer', 6, 0.3, F.spreadSelf(X(0.1), X(0.9)))
    L.at(57).wave('bomber', 3, 0.8, F.column(X(0.5), 60)).wave('wasp', 6, 0.2, F.swoop(1, 0.45, 280)).wave('wasp', 6, 0.2, F.swoop(-1, 0.45, 280))
    L.at(60).wave('dart', 14, 0.09, F.path([[X(0.5), -30], [X(0.5), 160], [X(0.1), 300], [X(0.9), 420], [X(0.5), PH + 40]], 340))
    L.at(62).gate(14)
    // boss
    L.at(63).intensity(1).scroll(0, 3).radio('HALLORAN', 'Seismic readings under the refinery. Something big is... walking.')
    L.at(65.5).do((w) => spawnSmelter(w))
    L.at(66).until('boss_dead')
    L.at(67).radio('HALLORAN', 'Refinery row is quiet. Come home, Kestrel. Dasha has opinions about your paint.')
    L.at(68).do(() => {})
  },
}

/** Train cars: roll along the rails (horizontal) while the ground scrolls. */
class TrainMover {
  constructor(private vx: number) {}
  update(e: import('../../game/entities').Enemy, w: World, dt: number) {
    e.x += this.vx * dt
    e.y += w.scroll * dt
    e.noCull = e.x < PW + 80
    if (Math.random() < 0.06) w.parts.spawn(P.Smoke, e.x, e.y, -30, 0, 0.8, 3, 8, C.smokeLight, 0, true)
  }
}
