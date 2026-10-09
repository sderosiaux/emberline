import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import type { World, Decor } from '../../game/world'
import type { Enemy } from '../../game/entities'
import { PickupKind } from '../../game/entities'
import { HoverMover } from '../../game/movers'
import { sfxAt } from '../../game/fx'
import { spawnTidebreaker } from '../../game/bosses/tidebreaker'
import { rand } from '../../core/math'

/**
 * Secret: three groups of civilian trawlers cross the level. Auto-targeting
 * ignores them, splash does not. If none is hit (flag 'civilian_hit' never
 * set), a trawler captain comes back after the boss with something from the nets.
 */

/** Boats sail relative to the water: vx across, vy against the scroll (negative = heading north). */
class BoatMover {
  constructor(private vx: number, private vy: number) {}
  update(e: Enemy, w: World, dt: number) {
    e.x += this.vx * dt
    e.y += (w.scroll + this.vy) * dt
    e.rot = Math.atan2(this.vy, this.vx) - Math.PI / 2
    // spawned beyond the side edge: exempt from culling until it sails into view
    if (e.noCull && e.x > 0 && e.x < PW) e.noCull = false
  }
}

/** Ground units bolted onto a moving set piece (the carrier deck decor). */
class DeckMover {
  constructor(private deck: Decor, private ox: number, private oy: number) {}
  update(e: Enemy) {
    e.x = this.deck.x + this.ox
    e.y = this.deck.y + this.oy
    // the world drops decor past PH+400; units riding it leave with it
    if (this.deck.y - 380 > PH) e.gone = true
  }
}

/** A line of trawlers crossing the sea at roughly constant screen height y. */
function trawlers(w: World, fromLeft: boolean, y: number, speed: number, n = 3) {
  for (let i = 0; i < n; i++) {
    const x = fromLeft ? -30 - i * 70 : PW + 30 + i * 70
    w.spawn('trawler', x, y - i * 10, { mover: new BoatMover(fromLeft ? speed : -speed, -w.scroll), tag: 'civ' }).noCull = true
  }
}

/** Trawlers running south along a lane, riding the current. */
function trawlerLane(w: World, x: number, n = 3) {
  for (let i = 0; i < n; i++) w.spawn('trawler', x + (i % 2) * 14, -30 - i * 70, { mover: new BoatMover(0, 28), tag: 'civ' })
}

const DECK_X = PW / 2
/** The abandoned fleet carrier: Choir guns and hangars bolted to her flight deck. */
function carrierDeck(w: World) {
  const deck: Decor = { sprite: 'prop_carrier_deck', x: DECK_X, y: -400, rot: 0, scale: 1, depth: 1, vx: 0, alpha: 1, above: false }
  w.decor.push(deck)
  const on = (id: string, ox: number, oy: number) => w.spawn(id, deck.x + ox, deck.y + oy, { mover: new DeckMover(deck, ox, oy), elite: false })
  // bow (enters first)
  on('turret', -95, 330); on('turret', 95, 330)
  on('flak', 0, 250)
  // forward elevators: fuel bowsers parked beside the guns
  on('fuel', -118, 60); on('fuel', -122, 30); on('turret', -70, 150); on('turret', 110, 100); on('fuel', 96, 170)
  // midships hangar launching wasps
  on('hangar', -70, 20); on('flak', 90, -10)
  on('cache', 118, 40)
  // aft: heavy guns and a repair crate for whoever makes it this far
  on('flak', -90, -170); on('turret', 60, -150); on('turret', -20, -230)
  on('hangar', 70, -290); on('repair_cache', -110, -320)
  on('turret', -60, -350); on('turret', 110, -350)
}

/** Storm lightning: every strike lights the sea and strips the phantoms' cloak for a moment. */
function lightning(w: World) {
  if (w.flags.has('m2_calm') || w.flags.has('boss_dead')) return
  const x = rand(40, PW - 40), y = rand(140, PH - 110)
  const pts: number[] = []
  let px = x + rand(-80, 80)
  for (let i = 0; i <= 9; i++) {
    const k = i / 9
    px += (x - px) * 0.35 + rand(-26, 26)
    pts.push(i === 9 ? x : px, -20 + (y + 20) * k)
  }
  w.line(pts, '#ffffff', '#9fd8ff', 3, 0.3, 4)
  w.flashScreen = Math.max(w.flashScreen, 0.32)
  const reveal = () => { for (const e of w.enemies) if (e.def.id === 'phantom' && !e.dead) e.visibleAlpha = 1 }
  reveal()
  w.after(0.22, () => { reveal(); w.flashScreen = Math.max(w.flashScreen, 0.18) })
  if (!w.preview) w.after(0.35, () => sfxAt('expl_huge', x, 0.3, 0.45))
  w.after(rand(2.6, 4.8), () => lightning(w))
}

function trawlerThanks(w: World) {
  w.emit({ type: 'radio', who: 'MARISOL', text: 'Fighter, this is the trawler Marisol. Every boat made it home. We owe you.', tone: 'odd' })
  const t = w.spawn('trawler', -30, PH * 0.5, { mover: new BoatMover(55, -w.scroll - 12), tag: 'civ' })
  t.armor = 0 // a thank-you, not a target
  w.after(2.2, () => {
    w.emit({ type: 'radio', who: 'MARISOL', text: 'Pulled this out of the nets off the reef. It hums. Better in your hands than theirs.', tone: 'odd' })
    w.pickup(PickupKind.Core, t.x + 16, t.y, 0, 'core_leech')
    w.secret('trawlers', 'Every trawler made it home')
  })
}

export const m2: MissionDef = {
  id: 'm2', num: '02', name: 'Glasswater', biome: 'glasswater', track: 'm2', scroll: 60,
  briefing: [
    'The Glasswater platforms raised Choir colours at dawn.',
    'Rigs, patrol boats, and something on sonar that the navy will not name.',
    'The fishing fleet was still out when it happened. Some of it still is.',
    'Take the platforms back. Mind the water.',
  ],
  script(L) {
    const X = (f: number) => PW * f
    L.at(0).radio('HALLORAN', 'Glasswater, Kestrel. Clear water, clear skies. Enjoy it while it lasts.')
      .decor('prop_island_l', X(0.17), { y: -260 }).decor('prop_reef', X(0.8), { y: -120 }).decor('prop_reef', X(0.4), { y: -430 })
    // ── bright shallows: gunboats and darts over the reefs ──
    L.at(1.5).wave('dart', 7, 0.08, F.vee(X(0.5), 170)).ground('gunboat', X(0.2), { vy: -20 }).ground('gunboat', X(0.8), { vy: -20 })
    L.at(3.5).wave('dart', 8, 0.2, F.swoop(-1, 0.45, 290))
    L.at(5).wave('dart', 8, 0.2, F.swoop(1, 0.47, 290)).decor('prop_buoy', X(0.07), { y: -40 }).decor('prop_buoy', X(0.93), { y: -40 })
    L.at(6.5).wave('wasp', 5, 0.25, F.hover(125, 4.5)).ground('gunboat', -30, { vx: 65, y: 100 }).ground('gunboat', PW + 30, { vx: -65, y: 150 })
    L.at(8.5).decor('prop_oil_rig', X(0.72), { y: -170 })
      .ground('turret', X(0.65), { y: -120 }).ground('turret', X(0.79), { y: -220 }).ground('flak', X(0.72), { y: -170 })
    L.at(9.5).radio('KESTREL', 'Water this clear, I can count the fish. And the things that are not fish.')
      .decor('prop_island_s', X(0.2), { y: -100 }).ground('cache', X(0.2), { y: -100 })
    L.at(10.5).wave('weaver', 5, 0.4, F.sine(X(0.28), 110, 2.3, 130)).wave('weaver', 5, 0.4, F.sine(X(0.5), 90, 2.3, 130))
    L.at(13).gate(10)
    // trawler group 1: first contact with the civilians
    L.at(14).do((w) => trawlers(w, true, PH * 0.75, 98))
      .radio('HALLORAN', 'Civilian transponders. Fishing fleet never got the recall.')
    L.at(17).wave('dart', 10, 0.14, F.column(X(0.72), 220, 0)).wave('dart', 7, 0.1, F.vee(X(0.28), 170))
    // ── submarines: teach the surfacing window ──
    L.at(19).radio('HALLORAN', 'Sonar contacts. Subs only break the surface to shoot. That is your window.')
      .ground('sub', X(0.3), { y: -60 }).ground('sub', X(0.7), { y: -140 })
    L.at(22).ground('sub', X(0.5), { y: -60 }).ground('sub', X(0.12), { y: -130 }).wave('dart', 7, 0.18, F.swoop(-1, 0.4, 290)).decor('prop_reef', X(0.22), { y: -140 })
    L.at(24.5).ground('gunboat', PW + 30, { vx: -72, y: 120 }).ground('gunboat', PW + 90, { vx: -72, y: 130 }).ground('gunboat', -30, { vx: 72, y: 180 })
    L.at(26).wave('wasp', 6, 0.2, F.hover(145, 4.5))
    L.at(28.5).gate(12)
    L.at(28.6).horde([['dart', 9], ['wasp', 7], ['dart', 9], ['weaver', 6], ['dart', 9]]).reveal({ banner: 'Massed contacts', play: true, hold: 7 }).radio('KESTREL', 'Halloran, the whole bay just lifted off at once.')
    L.at(28.65).gate(20)
    // minefield between the buoys
    L.at(29.5).decor('prop_buoy', X(0.12), { y: -40 }).decor('prop_buoy', X(0.88), { y: -40 })
      .wave('mine', 10, 0.32, (i) => {
        const x = X(0.1) + ((i * 3) % 10) * X(0.8 / 9)
        return { x, y: -30, mover: new HoverMover(x, 130 + (i % 3) * 50, 3, 8, 0, 60) }
      })
    L.at(31).wave('lancer', 4, 0.35, F.spreadSelf(X(0.15), X(0.85)))
    L.at(33.5).decor('prop_island_l', X(0.78), { y: -260 }).ground('destroyer', X(0.25), { y: -110, vy: -15 })
      .radio('KESTREL', 'Destroyer. Big guns, slow brain.')
    L.at(35).ground('sub', X(0.75), { y: -60 }).wave('bomber', 1, 0, F.column(X(0.62), 60)).wave('wasp', 5, 0.2, F.swoop(1, 0.35, 290))
    L.at(37.5).wave('dart', 8, 0.16, F.swoop(1, 0.4, 290)).wave('dart', 8, 0.16, F.swoop(-1, 0.33, 290))
    L.at(40).gate(14)

    // ── the ship underneath ──
    L.at(41).scroll(40, 3).intensity(1).radio('HALLORAN', 'Kestrel. Big return under you. Sonar makes it a hull. A very long hull.')
    L.at(42).do(carrierDeck)
    L.at(46).radio('KESTREL', 'That is a fleet carrier. One of ours. Was one of ours.')
    L.at(48.5).radio('HALLORAN', 'They bolted guns to her deck. Strip them off her.')
      .ground('gunboat', X(0.1), { vy: -26 }).ground('gunboat', X(0.9), { vy: -26 })
    L.at(50).intensity(3).do((w) => { w.spawn('carrier', X(0.17), -120, { mover: new HoverMover(X(0.17), 100, 3.5, 13, 0, -90) }) })
      .radio('CHOIR', 'WE FOUND HER SLEEPING. WE TAUGHT HER TO SING.', 'enemy')
    // trawler group 2 threads past the deck's fuel bowsers
    L.at(52).do((w) => trawlerLane(w, DECK_X - 200))
    L.at(54).wave('wasp', 6, 0.22, F.swoop(-1, 0.3, 290))
    L.at(56).ground('gunboat', PW + 30, { vx: -72, y: 90 }).ground('gunboat', PW + 90, { vx: -72, y: 100 })
    L.at(58).wave('missileer', 3, 0.45, F.hover(100, 6.5, X(0.2), X(0.8)))
    L.at(62).wave('dart', 10, 0.16, F.loop(1, 170, 120, 290))
    L.at(64.5).wave('weaver', 5, 0.4, F.sine(X(0.88), 50, 2.2, 120))
    L.at(68).gate(14)
    L.at(69).scroll(60, 4)

    // ── storm: phantoms hunting in the rain ──
    L.at(70).phase('storm').intensity(2).radio('HALLORAN', 'Storm front coming over the rigs. Visibility is going.')
    L.at(71.5).do(lightning)
    L.at(72).wave('phantom', 4, 0.5, F.hover(145, 6.5, X(0.18), X(0.82)))
      .radio('KESTREL', 'Lost them in the rain. Something is pacing me.')
    L.at(74.5).radio('HALLORAN', 'Phantoms. Wait for the lightning, then hit what it shows you.')
    L.at(76).ground('gunboat', X(0.2), { vy: -30 }).ground('gunboat', X(0.8), { vy: -30 }).ground('sub', X(0.5), { y: -60 })
    L.at(78).wave('dart', 8, 0.16, F.swoop(1, 0.4, 290))
    // trawler group 3, caught out in the weather
    L.at(80).do((w) => trawlers(w, false, PH * 0.46, 110))
      .radio('MARISOL', '...Marisol to anyone... taking water... running for the lee of the rig...', 'odd')
    L.at(81).wave('phantom', 5, 0.45, F.path([[-30, 100], [X(0.3), 205], [X(0.7), 135], [PW + 40, 240]], 156))
    L.at(83.5).decor('prop_oil_rig', X(0.25), { y: -170 }).ground('turret', X(0.18), { y: -130 }).ground('flak', X(0.32), { y: -210 })
      .ground('turret', X(0.82), { y: -150 })
    L.at(85).wave('missileer', 3, 0.45, F.hover(100, 6.5, X(0.22), X(0.78))).wave('lancer', 3, 0.5, F.spreadSelf(X(0.15), X(0.85)))
    L.at(89).ground('destroyer', X(0.75), { y: -110, vy: -15 }).wave('phantom', 4, 0.4, F.hover(170, 5.5, X(0.15), X(0.6)))
    L.at(93).gate(14)
    L.at(94).wave('sniper', 3, 0.4, F.hover(95, 6.5, X(0.2), X(0.8))).wave('wasp', 6, 0.2, F.swoop(-1, 0.4, 290))
    L.at(97.5).wave('phantom', 7, 0.3, F.loop(-1, 195, 110, 290))
    L.at(101).gate(14)

    // ── the storm breaks: escalation to the boss ──
    L.at(102).phase('calm').intensity(2).do((w) => w.flags.add('m2_calm'))
      .radio('KESTREL', 'Storm is breaking. I can see the rigs again.')
    L.at(103).decor('prop_oil_rig', X(0.5), { y: -180 })
      .ground('turret', X(0.41), { y: -130 }).ground('turret', X(0.59), { y: -230 }).ground('flak', X(0.5), { y: -180 }).ground('repair_cache', X(0.85), { y: -60 })
    L.at(105).do((w) => { for (let i = 0; i < 8; i++) w.spawn('gunboat', -30 - i * 40, 50 + i * 26, { mover: new BoatMover(90, -40) }).noCull = true })
    L.at(107.5).intensity(3).wave('gunship', 1, 0, F.hoverAt(X(0.5), 128, 8))
      .wave('dart', 10, 0.25, F.loop(1, 190, 120, 290)).wave('dart', 10, 0.25, F.loop(-1, 190, 120, 290))
    L.at(110).radio('HALLORAN', 'Gunship. Keep moving, let it waste its breath.')
    L.at(112).ground('sub', X(0.2), { y: -60 }).ground('sub', X(0.8), { y: -60 }).ground('sub', X(0.5), { y: -150 }).decor('prop_island_s', X(0.1), { y: -120 })
    L.at(115).gate(14)
    L.at(116).wave('bomber', 2, 1, F.column(X(0.3), 60)).wave('weaver', 8, 0.28, F.cross([[-30, 85], [PW * 0.5, 220], [PW + 40, 360]], 260))
    L.at(120).wave('splitter', 3, 0.6, F.hover(135, 5, X(0.2), X(0.8))).ground('gunboat', X(0.5), { vy: -30 })
    L.at(123.5).wave('wasp', 7, 0.2, F.hover(120, 4.5)).wave('dart', 8, 0.1, F.vee(X(0.5), 190))
    L.at(127).gate(14)

    // ── TIDEBREAKER ──
    L.at(128).scroll(14, 4).intensity(1).radio('HALLORAN', 'Sonar just lost the sea floor. No. Something is covering it.')
    L.at(131).radio('CHOIR', 'SWIM, LITTLE EMBER. THE WATER REMEMBERS WHAT IT DROWNED.', 'enemy')
    L.at(132).do((w) => spawnTidebreaker(w))
    L.at(133).until('boss_dead')
    L.at(135).radio('HALLORAN', 'It is going down. Glasswater is ours. What is left of it.')
    L.at(138).do((w) => { if (!w.flags.has('civilian_hit')) trawlerThanks(w) })
    L.at(146).do(() => {})
  },
}
