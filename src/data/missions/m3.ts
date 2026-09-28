import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, sx } from '../../game/consts'
import type { World } from '../../game/world'
import type { Enemy } from '../../game/entities'
import { PickupKind } from '../../game/entities'
import { GroundMover } from '../../game/movers'
import { registerEnemy } from '../enemies'
import { spawnBastion } from '../../game/bosses/bastion'
import { glowTexture } from '../../render/sprites'

/**
 * Secrets:
 * - blackbox: the frozen colony transport Meridian still carries its flight
 *   recorder. It is small, orange and easy to scroll past.
 * - blackout: every shield generator on the colony grid is tagged; kill them
 *   all before the boss and BASTION arrives with its pylons already cold.
 */

registerEnemy({
  id: 'm3_blackbox', hp: 45, r: 9, sprite: 'm3_blackbox', layer: 'ground', score: 1500, credits: 0, charge: 2, explode: 'small', target: true,
  draw(ctx, e, w) {
    // slow locator blink: the only thing that gives it away
    const k = (w.time + e.id * 0.37) % 1.8
    if (k > 0.25) return
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 1 - k / 0.25
    ctx.drawImage(glowTexture('#ffb347', 64, 0.15), e.x - 11, e.y - 13, 22, 22)
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
  },
  onDeath(e, w) {
    w.pickup(PickupKind.Core, e.x, e.y, 0, 'core_ghost')
    w.secret('blackbox', "The Meridian's flight recorder")
    w.emit({ type: 'radio', who: 'MERIDIAN', text: '...log nine-forty. The ice is humming back at us. If it asks your name, do not give it...', tone: 'odd' })
  },
})

/** Every generator on the colony grid. All dead before the boss = blackout. */
const GRID = ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']

/** Ground vehicles driving in from a side edge: exempt from culling until they reach the screen. */
class RollMover {
  constructor(private vx: number) {}
  update(e: Enemy, w: World, dt: number) {
    e.x += this.vx * dt
    e.y += w.scroll * dt
    if (e.noCull && e.x > 0 && e.x < PW) e.noCull = false
  }
}
function mover(vx: number) { return vx ? new RollMover(vx) : new GroundMover(0, 0) }
function spawnGround(w: World, id: string, x: number, y: number, vx = 0, rot = 0, tag = '') {
  const e = w.spawn(id, x, y, { mover: mover(vx), rot, tag })
  e.noCull = vx !== 0
  return e
}

function gen(w: World, x: number, y: number, tag: string, vx = 0) {
  return spawnGround(w, 'generator', x, y, vx, 0, tag)
}
function linked(w: World, id: string, x: number, y: number, g: Enemy | null, vx = 0, rot = 0) {
  const e = spawnGround(w, id, x, y, vx, rot)
  if (g) { e.shieldedBy = g; e.s.permShield = 1 }
  return e
}

/** A: ring — the lesson. Four guns around the source, the source in plain sight. */
function clusterRing(w: World) {
  const g = gen(w, sx(280), -140, 'g1')
  linked(w, 'turret', sx(200), -140, g); linked(w, 'turret', sx(360), -140, g)
  linked(w, 'turret', sx(280), -220, g); linked(w, 'flak', sx(280), -60, g)
}

/** B: hidden source — the shielded bunker sits in the lane, the generator hides behind a hab on the far edge. */
function clusterHidden(w: World) {
  const g = gen(w, sx(515), -250, 'g2')
  linked(w, 'bunker', sx(250), -60, g)
  linked(w, 'flak', sx(170), -110, g); linked(w, 'flak', sx(330), -110, g)
  linked(w, 'artillery', sx(250), -170, g)
}

/** C: relay — the western generator feeds the eastern one, which feeds the battery. Order matters. */
function clusterRelay(w: World) {
  const a = gen(w, sx(70), -120, 'g3')
  const b = gen(w, sx(480), -60, 'g4')
  b.shieldedBy = a; b.s.permShield = 1
  linked(w, 'artillery', sx(220), -40, b); linked(w, 'artillery', sx(290), -80, b); linked(w, 'artillery', sx(360), -40, b)
  linked(w, 'turret', sx(140), -60, a); linked(w, 'turret', sx(420), -130, b)
}

/** D: convoy — a generator truck at the tail of a tank column shields the tanks ahead of it. */
function clusterConvoy(w: World) {
  const vx = 55, y = 76
  const g = gen(w, -40 - 4 * 56 - 10, y, 'g5', vx)
  for (let i = 0; i < 4; i++) linked(w, 'tank', -40 - i * 56, y, g, vx, -Math.PI / 2)
}

/** E: crossfire — each generator shields the cluster on the OTHER side of the road. */
function clusterCross(w: World) {
  const gl = gen(w, sx(90), -40, 'g6'), gr = gen(w, sx(470), -40, 'g7')
  linked(w, 'flak', sx(150), -130, gr); linked(w, 'turret', sx(80), -170, gr); linked(w, 'artillery', sx(160), -210, gr)
  linked(w, 'flak', sx(410), -130, gl); linked(w, 'turret', sx(480), -170, gl); linked(w, 'artillery', sx(400), -210, gl)
}

function tankColumn(w: World, x: number, n: number) {
  for (let i = 0; i < n; i++) w.spawn('tank', x, -40 - i * 50, { mover: new GroundMover(0, 22) })
}

export const m3: MissionDef = {
  id: 'm3', num: '03', name: 'Rime', biome: 'rime', track: 'm3', scroll: 50,
  briefing: [
    'Rime colony went dark behind Choir shield walls six days ago.',
    'Four thousand people are sheltering in the domes. The Choir is not attacking them.',
    'It is waiting. Something is being built out on the ice.',
    'Break the grid. Find what they are building. Stop it walking.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    L.at(0).radio('HALLORAN', 'Rime, Kestrel. Colony domes are civilian. Everything with a Choir slit is not.')
      .decor('prop_dome', X(0.2), { y: -150 }).decor('prop_hab', X(0.36), { y: -60 }).decor('prop_antenna', X(0.1), { y: -40 })
      .decor('prop_dome', X(0.84), { y: -420 })
    // ── snow roads: convoys and artillery ──
    L.at(1.5).wave('dart', 7, 0.08, F.vee(X(0.5), 170)).do((w) => tankColumn(w, X(0.75), 3))
    L.at(3.5).wave('wasp', 5, 0.25, F.hover(125, 4.5))
    L.at(5).ground('artillery', X(0.25), { y: -60 }).ground('artillery', X(0.9), { y: -110 }).decor('prop_ice_ridge', X(0.7), { y: -80 })
    L.at(7).do((w) => { for (let i = 0; i < 5; i++) spawnGround(w, 'tank', PW + 40 + i * 56, 60, -58, Math.PI / 2) })
      .wave('dart', 8, 0.2, F.swoop(-1, 0.42, 290))
    L.at(9).wave('lancer', 4, 0.3, F.spreadSelf(X(0.15), X(0.85))).decor('prop_hab', X(0.84), { y: -60 })
    L.at(10.5).wave('dart', 6, 0.15, F.column(X(0.2), 230, 0)).wave('dart', 6, 0.15, F.column(X(0.8), 230, 0))
    L.at(12.5).gate(10)

    // ── generator cluster A: the lesson ──
    L.at(13).decor('prop_dome', X(0.8), { y: -160 }).do(clusterRing)
    L.at(14).radio('HALLORAN', 'Shield generator. Everything tied to it shrugs off fire. Kill the source.')
    L.at(15.5).wave('wasp', 5, 0.25, F.hover(135, 5.5, X(0.15), X(0.85)))
    L.at(16.5).wave('weaver', 5, 0.4, F.sine(X(0.2), 90, 2.3, 130)).wave('weaver', 5, 0.4, F.sine(X(0.8), 90, 2.3, 130))
    L.at(19).wave('dart', 8, 0.18, F.swoop(1, 0.38, 290)).ground('cache', X(0.08), { y: -40 })
    L.at(21.5).gate(12)
    L.at(22.5).do((w) => tankColumn(w, X(0.2), 4)).ground('artillery', X(0.78), { y: -60 }).decor('prop_antenna', X(0.86), { y: -120 })
    L.at(24).wave('bomber', 1, 0, F.column(X(0.6), 60)).wave('dart', 6, 0.12, F.vee(X(0.6), 70, 50, 20))
      .wave('wasp', 5, 0.2, F.swoop(-1, 0.35, 290))

    // ── cluster B: the source is not where the guns are ──
    L.at(27).decor('prop_hab', X(0.93), { y: -250 }).decor('prop_ice_ridge', X(0.45), { y: -230 }).do(clusterHidden)
    L.at(29.5).radio('KESTREL', 'Bunker is linked to something. Not anything I can see.')
    L.at(31).wave('wasp', 6, 0.22, F.hover(145, 5, X(0.12), X(0.7)))
    L.at(32.5).wave('dart', 10, 0.16, F.loop(1, 180, 120, 290))
    L.at(34.5).wave('lancer', 4, 0.35, F.spreadSelf(X(0.15), X(0.85)))
    L.at(37).gate(12)

    // ── the Meridian: frozen transport, black box aboard ──
    L.at(38).decor('prop_frozen_ship', X(0.84), { y: -170 }).ground('m3_blackbox', X(0.84) + 33, { y: -262 })
      .ground('turret', X(0.64), { y: -100 }).ground('turret', X(0.68), { y: -220 }).ground('turret', X(0.3), { y: -150 })
    L.at(39).radio('HALLORAN', 'Transport Meridian. Went into the ice nine winters ago. Nobody ever recovered her.')
    L.at(40.5).wave('missileer', 3, 0.45, F.hover(100, 6.5, X(0.2), X(0.6))).wave('dart', 8, 0.16, F.swoop(-1, 0.35, 290))
    L.at(44.5).do((w) => { for (let i = 0; i < 5; i++) spawnGround(w, 'tank', -40 - i * 56, 94, 58, -Math.PI / 2) })
      .ground('repair_cache', X(0.16), { y: -40 })
    L.at(47).wave('weaver', 8, 0.28, F.cross([[-30, 85], [PW * 0.5, 220], [PW + 40, 360]], 260))
    L.at(49.5).gate(12)

    // ── cluster C: relay chain ──
    L.at(51).decor('prop_dome', X(0.5), { y: -260 }).do(clusterRelay)
    L.at(52.5).radio('HALLORAN', 'Two generators. The west one is feeding the east one. Work it backwards.')
    L.at(53.5).wave('wasp', 6, 0.22, F.hover(145, 5.5))
    L.at(55.5).wave('dart', 10, 0.16, F.loop(-1, 170, 120, 290))
    L.at(58.5).wave('bomber', 2, 1, F.column(X(0.7), 60)).wave('weaver', 5, 0.4, F.sine(X(0.25), 90, 2.3, 130))
    L.at(61).gate(12)

    // ── blizzard: shields and medics guarding the guns ──
    L.at(62).phase('blizzard').intensity(1).radio('KESTREL', 'Whiteout. I can barely see the ground.')
    L.at(63.5).intensity(2).wave('warden', 1, 0, F.hoverAt(X(0.5), 120, 8)).wave('missileer', 3, 0.3, F.hover(145, 7.5, X(0.5) - sx(80), X(0.5) + sx(80)))
    L.at(65).radio('HALLORAN', 'Shield-bearer first. Then whatever is keeping them patched. Then the guns.')
    L.at(66.5).wave('lancer', 4, 0.4, F.spreadSelf(X(0.12), X(0.88)))
    L.at(68).wave('mender', 1, 0, F.hoverAt(X(0.3), 95, 7.5)).wave('sniper', 2, 0.4, F.hover(128, 7, X(0.18), X(0.44)))
    L.at(70).wave('lancer', 3, 0.5, F.spreadSelf(X(0.55), X(0.9)))
    L.at(71.5).wave('wasp', 7, 0.2, F.swoop(1, 0.4, 290))
    L.at(73.5).gate(12)
    L.at(75).intensity(3).wave('warden', 1, 0, F.hoverAt(X(0.68), 110, 8.5)).wave('mender', 1, 0, F.hoverAt(X(0.68), 60, 8.5))
      .wave('missileer', 3, 0.35, F.hover(152, 8, X(0.52), X(0.84))).wave('sniper', 1, 0, F.hoverAt(X(0.22), 100, 7.5))
      .wave('wasp', 4, 0.25, F.hover(140, 6.5, X(0.1), X(0.35)))
    L.at(78.5).wave('dart', 8, 0.16, F.swoop(-1, 0.35, 290)).do((w) => tankColumn(w, X(0.77), 3)).ground('artillery', X(0.2), { y: -60 })
    L.at(82).gate(12)
    // cluster D rolls through the whiteout
    L.at(83).do(clusterConvoy).radio('KESTREL', 'Tank column. Something at the back is humming.')
    L.at(85.5).wave('weaver', 5, 0.4, F.sine(X(0.72), 90, 2.3, 130)).ground('artillery', X(0.85), { y: -60 }).ground('flak', X(0.5), { y: -120 })
    L.at(89).wave('warden', 1, 0, F.hoverAt(X(0.35), 128, 7)).wave('wasp', 5, 0.25, F.hover(145, 6.5, X(0.18), X(0.52))).wave('mender', 1, 0, F.hoverAt(X(0.75), 95, 7))
    L.at(93).gate(12)

    // ── clearing: crossfire cluster and the last push ──
    L.at(94).phase('clear').intensity(2).radio('HALLORAN', 'Weather is lifting. Choir construction yard dead ahead.')
    L.at(95).decor('prop_ice_ridge', X(0.5), { y: -260 }).do(clusterCross)
    L.at(97.5).radio('KESTREL', 'The generators are crossing their wires. Left feeds right, right feeds left.')
    L.at(99).wave('gunship', 1, 0, F.hoverAt(X(0.5), 128, 8))
      .wave('dart', 10, 0.25, F.loop(1, 190, 120, 290)).wave('dart', 10, 0.25, F.loop(-1, 190, 120, 290))
    L.at(103).do((w) => tankColumn(w, X(0.5), 4)).ground('silo', X(0.18), { y: -60 }).ground('silo', X(0.82), { y: -60 })
    L.at(106).wave('splitter', 3, 0.6, F.hover(135, 5, X(0.2), X(0.8))).wave('wasp', 6, 0.2, F.swoop(1, 0.4, 290))
    L.at(108).wave('bomber', 2, 1, F.column(X(0.35), 60))
    L.at(110).intensity(3).wave('missileer', 3, 0.45, F.hover(100, 7, X(0.2), X(0.8))).wave('warden', 1, 0, F.hoverAt(X(0.5), 75, 7))
      .wave('sniper', 3, 0.4, F.hover(68, 7, X(0.15), X(0.85)))
    L.at(114).gate(12)

    // ── BASTION ──
    L.at(115).scroll(0, 4).intensity(1).radio('HALLORAN', 'Seismic contact on the ice. Tracked. Big. It is heading for the domes.')
    L.at(118).radio('CHOIR', 'WE BUILT A WALL AROUND YOUR PEOPLE. NOW THE WALL COMES HOME.', 'enemy')
    L.at(119).do((w) => spawnBastion(w, GRID.every((t) => w.flags.has(`gen:${t}`))))
    L.at(120).until('boss_dead')
    L.at(122).radio('HALLORAN', 'The domes are opening. People are walking out onto the ice. Come home, Kestrel.')
    L.at(126).do(() => {})
  },
}
