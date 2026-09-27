import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW } from '../../game/consts'
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
  const g = gen(w, 280, -60, 'g1')
  linked(w, 'turret', 200, -60, g); linked(w, 'turret', 360, -60, g)
  linked(w, 'turret', 280, -140, g); linked(w, 'flak', 280, 20, g)
}

/** B: hidden source — the shielded bunker sits in the lane, the generator hides behind a hab on the far edge. */
function clusterHidden(w: World) {
  const g = gen(w, 515, -250, 'g2')
  linked(w, 'bunker', 250, -60, g)
  linked(w, 'flak', 170, -110, g); linked(w, 'flak', 330, -110, g)
  linked(w, 'artillery', 250, -170, g)
}

/** C: relay — the western generator feeds the eastern one, which feeds the battery. Order matters. */
function clusterRelay(w: World) {
  const a = gen(w, 70, -120, 'g3')
  const b = gen(w, 480, -60, 'g4')
  b.shieldedBy = a; b.s.permShield = 1
  linked(w, 'artillery', 220, -40, b); linked(w, 'artillery', 290, -80, b); linked(w, 'artillery', 360, -40, b)
  linked(w, 'turret', 140, -60, a); linked(w, 'turret', 420, -130, b)
}

/** D: convoy — a generator truck at the tail of a tank column shields the tanks ahead of it. */
function clusterConvoy(w: World) {
  const vx = 42, y = 90
  const g = gen(w, -40 - 4 * 56 - 10, y, 'g5', vx)
  for (let i = 0; i < 4; i++) linked(w, 'tank', -40 - i * 56, y, g, vx, -Math.PI / 2)
}

/** E: crossfire — each generator shields the cluster on the OTHER side of the road. */
function clusterCross(w: World) {
  const gl = gen(w, 90, -40, 'g6'), gr = gen(w, 470, -40, 'g7')
  linked(w, 'flak', 150, -130, gr); linked(w, 'turret', 80, -170, gr); linked(w, 'artillery', 160, -210, gr)
  linked(w, 'flak', 410, -130, gl); linked(w, 'turret', 480, -170, gl); linked(w, 'artillery', 400, -210, gl)
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
    L.at(0).radio('HALLORAN', 'Rime, Kestrel. Colony domes are civilian. Everything with a Choir slit is not.')
      .decor('prop_dome', 110, { y: -150 }).decor('prop_hab', 200, { y: -60 }).decor('prop_antenna', 60, { y: -40 })
    // ── snow roads: convoys and artillery ──
    L.at(2).wave('dart', 5, 0.1, F.vee(PW / 2, 150)).do((w) => tankColumn(w, 420, 3))
    L.at(5).wave('wasp', 3, 0.35, F.hover(150, 5))
    L.at(7).ground('artillery', 140, { y: -60 }).decor('prop_ice_ridge', 400, { y: -80 })
    L.at(10).do((w) => { for (let i = 0; i < 4; i++) spawnGround(w, 'tank', PW + 40 + i * 56, 70, -45, Math.PI / 2) })
      .wave('dart', 6, 0.25, F.swoop(-1, 0.4))
    L.at(13).wave('lancer', 3, 0.45, F.spreadSelf(120, PW - 120)).decor('prop_hab', 470, { y: -60 })
    L.at(16).gate()

    // ── generator cluster A: the lesson ──
    L.at(17).decor('prop_dome', 440, { y: -160 }).do(clusterRing)
    L.at(18).radio('HALLORAN', 'Shield generator. Everything tied to it shrugs off fire. Kill the source.')
    L.at(20).wave('wasp', 3, 0.35, F.hover(160, 6, 110, PW - 110))
    L.at(21).wave('weaver', 4, 0.5, F.sine(PW * 0.25, 70, 2.2, 110))
    L.at(24).wave('dart', 6, 0.2, F.swoop(1, 0.35)).ground('cache', 60, { y: -40 })
    L.at(27).gate()
    L.at(29).do((w) => tankColumn(w, 120, 4)).ground('artillery', 440, { y: -60 }).decor('prop_antenna', 480, { y: -120 })
    L.at(31).wave('bomber', 1, 0, F.column(PW * 0.6, 55)).wave('dart', 4, 0.15, F.vee(PW * 0.6, 60, 50, 20))

    // ── cluster B: the source is not where the guns are ──
    L.at(35).decor('prop_hab', 520, { y: -250 }).decor('prop_ice_ridge', 250, { y: -230 }).do(clusterHidden)
    L.at(38).radio('KESTREL', 'Bunker is linked to something. Not anything I can see.')
    L.at(40).wave('wasp', 4, 0.3, F.hover(170, 5, 90, PW - 160))
    L.at(42).wave('dart', 8, 0.2, F.loop(1, 210))
    L.at(44).wave('lancer', 3, 0.5, F.spreadSelf(120, PW - 120))
    L.at(47).gate()

    // ── the Meridian: frozen transport, black box aboard ──
    L.at(49).decor('prop_frozen_ship', 470, { y: -170 }).ground('m3_blackbox', 503, { y: -262 })
      .ground('turret', 360, { y: -100 }).ground('turret', 380, { y: -220 })
    L.at(50).radio('HALLORAN', 'Transport Meridian. Went into the ice nine winters ago. Nobody ever recovered her.')
    L.at(52).wave('missileer', 2, 0.6, F.hover(120, 7, 140, 320)).wave('dart', 6, 0.18, F.swoop(-1, 0.3))
    L.at(57).do((w) => { for (let i = 0; i < 4; i++) spawnGround(w, 'tank', -40 - i * 56, 110, 45, -Math.PI / 2) })
      .ground('repair_cache', 90, { y: -40 })
    L.at(60).wave('weaver', 6, 0.35, F.cross([[-30, 100], [PW * 0.5, 260], [PW + 40, 420]], 200))
    L.at(63).gate()

    // ── cluster C: relay chain ──
    L.at(65).decor('prop_dome', 280, { y: -260 }).do(clusterRelay)
    L.at(67).radio('HALLORAN', 'Two generators. The west one is feeding the east one. Work it backwards.')
    L.at(68).wave('wasp', 4, 0.3, F.hover(170, 6))
    L.at(70).wave('dart', 8, 0.2, F.loop(-1, 200))
    L.at(74).wave('bomber', 2, 1, F.column(PW * 0.7, 60))
    L.at(78).gate(22)

    // ── blizzard: shields and medics guarding the guns ──
    L.at(80).phase('blizzard').intensity(1).radio('KESTREL', 'Whiteout. I can barely see the ground.')
    L.at(82).intensity(2).wave('warden', 1, 0, F.hoverAt(PW / 2, 140, 10)).wave('missileer', 2, 0.3, F.hover(170, 10, PW / 2 - 70, PW / 2 + 70))
    L.at(84).radio('HALLORAN', 'Shield-bearer first. Then whatever is keeping them patched. Then the guns.')
    L.at(89).wave('mender', 1, 0, F.hoverAt(PW * 0.3, 110, 10)).wave('sniper', 2, 0.4, F.hover(150, 10, PW * 0.2, PW * 0.45))
    L.at(87).wave('lancer', 3, 0.5, F.spreadSelf(100, PW - 100))
    L.at(91).wave('lancer', 2, 0.6, F.spreadSelf(PW * 0.55, PW - 90))
    L.at(93).wave('wasp', 5, 0.25, F.swoop(1, 0.4))
    L.at(95).gate(20)
    L.at(97).intensity(3).wave('warden', 1, 0, F.hoverAt(PW * 0.65, 130, 12)).wave('mender', 1, 0, F.hoverAt(PW * 0.65, 70, 12))
      .wave('missileer', 2, 0.4, F.hover(180, 12, PW * 0.5, PW * 0.8)).wave('sniper', 1, 0, F.hoverAt(PW * 0.25, 120, 10))
    L.at(101).wave('dart', 6, 0.2, F.swoop(-1, 0.35)).do((w) => tankColumn(w, 430, 3)).ground('artillery', 110, { y: -60 })
    L.at(105).gate(22)
    // cluster D rolls through the whiteout
    L.at(107).do(clusterConvoy).radio('KESTREL', 'Tank column. Something at the back is humming.')
    L.at(110).wave('weaver', 4, 0.4, F.sine(PW * 0.7, 70, 2.2, 110)).ground('artillery', 470, { y: -60 }).ground('flak', 300, { y: -120 })
    L.at(114).wave('warden', 1, 0, F.hoverAt(PW * 0.35, 150, 9)).wave('wasp', 4, 0.3, F.hover(170, 9, PW * 0.2, PW * 0.5)).wave('mender', 1, 0, F.hoverAt(PW * 0.75, 110, 9))
    L.at(120).gate(22)

    // ── clearing: crossfire cluster and the last push ──
    L.at(122).phase('clear').intensity(2).radio('HALLORAN', 'Weather is lifting. Choir construction yard dead ahead.')
    L.at(123).decor('prop_ice_ridge', 280, { y: -260 }).do(clusterCross)
    L.at(126).radio('KESTREL', 'The generators are crossing their wires. Left feeds right, right feeds left.')
    L.at(128).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 9)).wave('dart', 8, 0.3, F.loop(1, 220))
    L.at(133).do((w) => tankColumn(w, 280, 4)).ground('silo', 100, { y: -60 }).ground('silo', 460, { y: -60 })
    L.at(137).wave('splitter', 2, 1, F.hover(160, 6, 170, PW - 170)).wave('wasp', 4, 0.3, F.swoop(1, 0.4))
    L.at(139).wave('bomber', 2, 1, F.column(PW * 0.35, 60))
    L.at(141).intensity(3).wave('missileer', 2, 0.6, F.hover(120, 8, 140, PW - 140)).wave('warden', 1, 0, F.hoverAt(PW / 2, 90, 8)).wave('sniper', 2, 0.5, F.hover(80, 8, 100, PW - 100))
    L.at(145).gate()

    // ── BASTION ──
    L.at(147).scroll(0, 4).intensity(1).radio('HALLORAN', 'Seismic contact on the ice. Tracked. Big. It is heading for the domes.')
    L.at(150).radio('CHOIR', 'WE BUILT A WALL AROUND YOUR PEOPLE. NOW THE WALL COMES HOME.', 'enemy')
    L.at(151).do((w) => spawnBastion(w, GRID.every((t) => w.flags.has(`gen:${t}`))))
    L.at(152).until('boss_dead')
    L.at(154).radio('HALLORAN', 'The domes are opening. People are walking out onto the ice. Come home, Kestrel.')
    L.at(158).do(() => {})
  },
}
