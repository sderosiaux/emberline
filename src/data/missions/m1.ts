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
    L.at(0).radio('HALLORAN', "Kestrel, you're over Cinder Reach. Anything that hums is hostile. Anything that glows pink is worse.")
      .decor('prop_mesa', 110, { y: -220 })
    // opening: pure popcorn so the player learns to move and shoot
    L.at(2.5).wave('dart', 5, 0.1, F.vee(PW / 2, 150))
    L.at(5).wave('dart', 6, 0.28, F.swoop(-1, 0.4))
    L.at(7.5).wave('dart', 6, 0.28, F.swoop(1, 0.45))
    L.at(9).decor('prop_pad', 420, { y: -120 }).ground('turret', 420, { y: -120 })
    L.at(11).wave('wasp', 3, 0.35, F.hover(150, 5))
    L.at(12).ground('cache', 140)
    L.at(13).gate()
    L.at(15).radio('KESTREL', 'Contacts are Choir-pattern. Old mining drones, new manners.')
    L.at(16).wave('weaver', 4, 0.5, F.sine(PW * 0.3, 80, 2.2, 110)).wave('weaver', 4, 0.5, F.sine(PW * 0.7, 80, 2.2, 110))
    L.at(19).decor('prop_pipeline_h', 70, { y: -60 }).decor('prop_pipeline_h', 210, { y: -60 }).decor('prop_pipeline_h', 350, { y: -60 }).decor('prop_pipeline_h', 490, { y: -60 })
    L.at(20).wave('lancer', 3, 0.4, F.spreadSelf(120, PW - 120)).radio('HALLORAN', 'Interceptors. They charge where you ARE, not where you will be.')
    // refinery cluster: fuel tanks next to turrets teach chain reactions
    L.at(24).decor('prop_refinery', 150, { y: -140 })
      .ground('fuel', 250, { y: -60 }).ground('fuel', 280, { y: -80 }).ground('fuel', 260, { y: -100 })
      .ground('turret', 300, { y: -60 }).ground('turret', 225, { y: -110 })
    L.at(25).radio('HALLORAN', 'Those are fuel tanks. I am legally obliged to tell you not to shoot them near turrets.')
    L.at(27).ground('cache', 440).wave('dart', 6, 0.2, F.column(460, 180, 0))
    L.at(29).wave('bomber', 1, 0, F.column(PW / 2, 55)).wave('dart', 4, 0.15, F.vee(PW / 2, 60, 50, 20))
    L.at(31).gate()
    // the ore train
    L.at(33).radio('HALLORAN', 'Ore train on the east line. The cargo cars are full of refined credits. Were full.')
      .decor('prop_rail', 70, { y: -60 }).decor('prop_rail', 210, { y: -60 }).decor('prop_rail', 350, { y: -60 }).decor('prop_rail', 490, { y: -60 })
    L.at(33).do((w) => {
      const cars = ['train_engine', 'train_gun', 'train_cargo', 'train_fuel', 'train_cargo', 'train_gun', 'train_cargo']
      cars.forEach((id, i) => {
        w.after(1.2, () => {
          const e = w.spawn(id, -50 - i * 60, -60 + w.scroll * 1.2, { mover: null })
          e.mover = new TrainMover(95)
        })
      })
    })
    L.at(37).wave('dart', 6, 0.22, F.swoop(-1, 0.3)).wave('dart', 6, 0.22, F.swoop(1, 0.3))
    L.at(41).wave('wasp', 4, 0.3, F.hover(170, 5))
    // radar station: destroy it or it keeps calling interceptors
    L.at(43).decor('prop_tank_farm', 420, { y: -120 }).ground('radar', 400, { y: -80 }).ground('turret', 460, { y: -60 }).ground('turret', 350, { y: -120 })
    L.at(44).radio('KESTREL', "There's a radar mast on the tank farm. It'll keep calling friends.")
    // secret flare stacks, placed off the obvious path
    L.at(45).ground('flare_stack', 40, { y: -40 })
    L.at(49).ground('flare_stack', PW - 36, { y: -40 })
    L.at(47).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 9)).wave('dart', 8, 0.3, F.loop(-1, 220))
    L.at(50).radio('HALLORAN', 'Gunship. Keep moving and let it waste its breath.')
    L.at(52).gate(24)
    L.at(54).phase('dusk').intensity(3).ground('flare_stack', 300, { y: -40 }).decor('prop_mesa', 430, { y: -220 })
    L.at(55).ground('tank', -30, { vx: 45, y: 40 }).ground('tank', -80, { vx: 45, y: 40 }).ground('tank', -130, { vx: 45, y: 40 })
    L.at(57).wave('missileer', 2, 0.6, F.hover(130, 7, 140, PW - 140)).wave('dart', 5, 0.15, F.vee(PW / 2, 170))
    L.at(60).ground('artillery', 120).ground('turret', 180, { y: -70 })
    L.at(62).wave('weaver', 6, 0.4, F.cross([[-30, 100], [PW * 0.5, 260], [PW + 40, 420]], 200))
    L.at(64).ground('repair_cache', 280)
    L.at(66).wave('splitter', 2, 1, F.hover(160, 6, 170, PW - 170))
    L.at(68).gate()
    L.at(70).decor('prop_refinery', 400, { y: -140 }).ground('fuel', 330).ground('fuel', 350, { y: -70 }).ground('turret', 380, { y: -90 }).ground('flak', 450, { y: -40 })
    L.at(71).wave('lancer', 4, 0.5, F.spreadSelf(90, PW - 90))
    L.at(73).wave('bomber', 2, 1.2, F.column(PW * 0.3, 60)).wave('wasp', 5, 0.25, F.swoop(1, 0.5))
    L.at(76).wave('dart', 10, 0.12, F.path([[PW / 2, -30], [PW / 2, 200], [80, 380], [PW - 80, 520], [PW / 2, PH + 40]], 280))
    L.at(79).gate()
    // boss
    L.at(81).intensity(1).scroll(0, 4).radio('HALLORAN', 'Seismic readings under the refinery. Something big is... walking.')
    L.at(84).do((w) => spawnSmelter(w))
    L.at(85).until('boss_dead')
    L.at(86).radio('HALLORAN', 'Refinery row is quiet. Come home, Kestrel. Dasha has opinions about your paint.')
    L.at(88).do(() => {})
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
