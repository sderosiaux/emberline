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
    const x = fromLeft ? -30 - i * 62 : PW + 30 + i * 62
    w.spawn('trawler', x, y - i * 10, { mover: new BoatMover(fromLeft ? speed : -speed, -w.scroll), tag: 'civ' }).noCull = true
  }
}

/** Trawlers running south along a lane, riding the current. */
function trawlerLane(w: World, x: number, n = 3) {
  for (let i = 0; i < n; i++) w.spawn('trawler', x + (i % 2) * 14, -30 - i * 70, { mover: new BoatMover(0, 28), tag: 'civ' })
}

const DECK_X = 300
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
  const x = rand(40, PW - 40), y = rand(160, 520)
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
    L.at(0).radio('HALLORAN', 'Glasswater, Kestrel. Clear water, clear skies. Enjoy it while it lasts.')
      .decor('prop_island_l', 110, { y: -260 }).decor('prop_reef', 440, { y: -120 })
    // ── bright shallows: gunboats and darts over the reefs ──
    L.at(2.5).wave('dart', 5, 0.1, F.vee(PW / 2, 150)).ground('gunboat', 150, { vy: -20 }).ground('gunboat', 410, { vy: -20 })
    L.at(5).wave('dart', 6, 0.25, F.swoop(-1, 0.4))
    L.at(7).wave('dart', 6, 0.25, F.swoop(1, 0.42)).decor('prop_buoy', 60, { y: -40 }).decor('prop_buoy', 500, { y: -40 })
    L.at(9).wave('wasp', 3, 0.35, F.hover(150, 5)).ground('gunboat', -30, { vx: 50, y: 120 })
    L.at(11).decor('prop_oil_rig', 400, { y: -170 })
      .ground('turret', 360, { y: -120 }).ground('turret', 440, { y: -220 }).ground('flak', 400, { y: -170 })
    L.at(12).radio('KESTREL', 'Water this clear, I can count the fish. And the things that are not fish.')
      .decor('prop_island_s', 120, { y: -100 }).ground('cache', 120, { y: -100 })
    L.at(14).wave('weaver', 4, 0.5, F.sine(PW * 0.3, 80, 2.2, 110))
    L.at(16).gate()
    // trawler group 1: first contact with the civilians
    L.at(17).do((w) => trawlers(w, true, 540, 75))
      .radio('HALLORAN', 'Civilian transponders. Fishing fleet never got the recall.')
    L.at(21).wave('dart', 8, 0.18, F.column(PW * 0.7, 190, 0)).wave('dart', 4, 0.2, F.vee(PW * 0.3, 150))
    // ── submarines: teach the surfacing window ──
    L.at(23).radio('HALLORAN', 'Sonar contacts. Subs only break the surface to shoot. That is your window.')
      .ground('sub', 170, { y: -60 }).ground('sub', 390, { y: -140 })
    L.at(27).ground('sub', 280, { y: -60 }).wave('dart', 5, 0.22, F.swoop(-1, 0.35)).decor('prop_reef', 120, { y: -140 })
    L.at(30).ground('gunboat', PW + 30, { vx: -55, y: 140 }).ground('gunboat', PW + 90, { vx: -55, y: 150 })
    L.at(32).wave('wasp', 4, 0.3, F.hover(170, 5))
    L.at(35).gate()
    // minefield between the buoys
    L.at(36).decor('prop_buoy', 90, { y: -40 }).decor('prop_buoy', 470, { y: -40 })
      .wave('mine', 7, 0.45, (i) => ({ x: 80 + ((i * 3) % 7) * 67, y: -30, mover: null }), { onSpawn: (e) => { e.mover = new HoverMover(e.x, 160 + (e.x % 3) * 60, 3, 8, 0, 60) } })
    L.at(38).wave('lancer', 3, 0.5, F.spreadSelf(120, PW - 120))
    L.at(41).decor('prop_island_l', 430, { y: -260 }).ground('destroyer', 140, { y: -110, vy: -15 })
      .radio('KESTREL', 'Destroyer. Big guns, slow brain.')
    L.at(43).ground('sub', 420, { y: -60 }).wave('bomber', 1, 0, F.column(PW * 0.65, 55))
    L.at(46).wave('dart', 6, 0.2, F.swoop(1, 0.35))
    L.at(49).gate(20)

    // ── the ship underneath ──
    L.at(51).scroll(38, 3).intensity(1).radio('HALLORAN', 'Kestrel. Big return under you. Sonar makes it a hull. A very long hull.')
    L.at(52).do(carrierDeck)
    L.at(57).radio('KESTREL', 'That is a fleet carrier. One of ours. Was one of ours.')
    L.at(60).radio('HALLORAN', 'They bolted guns to her deck. Strip them off her.')
    L.at(62).intensity(3).do((w) => { w.spawn('carrier', PW * 0.35, -120, { mover: new HoverMover(PW * 0.35, 120, 3.5, 16, 0, -50) }) })
      .radio('CHOIR', 'WE FOUND HER SLEEPING. WE TAUGHT HER TO SING.', 'enemy')
    // trawler group 2 threads past the deck's fuel bowsers
    L.at(64).do((w) => trawlerLane(w, 62))
    L.at(68).wave('wasp', 4, 0.3, F.swoop(-1, 0.3))
    L.at(74).wave('missileer', 2, 0.6, F.hover(120, 7, 140, PW - 140))
    L.at(80).wave('dart', 8, 0.2, F.loop(1, 200))
    L.at(86).gate(24)
    L.at(88).scroll(60, 4)

    // ── storm: phantoms hunting in the rain ──
    L.at(89).phase('storm').intensity(2).radio('HALLORAN', 'Storm front coming over the rigs. Visibility is going.')
    L.at(91).do(lightning)
    L.at(92).wave('phantom', 3, 0.6, F.hover(170, 7, 120, PW - 120))
      .radio('KESTREL', 'Lost them in the rain. Something is pacing me.')
    L.at(95).radio('HALLORAN', 'Phantoms. Wait for the lightning, then hit what it shows you.')
    L.at(97).ground('gunboat', 120, { vy: -30 }).ground('gunboat', 440, { vy: -30 }).ground('sub', 280, { y: -60 })
    L.at(99).wave('dart', 6, 0.2, F.swoop(1, 0.4))
    // trawler group 3, caught out in the weather
    L.at(102).do((w) => trawlers(w, false, 330, 85))
      .radio('MARISOL', '...Marisol to anyone... taking water... running for the lee of the rig...', 'odd')
    L.at(103).wave('phantom', 4, 0.5, F.path([[-30, 120], [PW * 0.3, 240], [PW * 0.7, 160], [PW + 40, 280]], 120))
    L.at(106).decor('prop_oil_rig', 150, { y: -170 }).ground('turret', 110, { y: -130 }).ground('flak', 190, { y: -210 })
    L.at(108).wave('missileer', 2, 0.6, F.hover(120, 7, 160, PW - 160)).wave('lancer', 2, 0.6, F.spreadSelf(100, PW - 100))
    L.at(113).ground('destroyer', 420, { y: -110, vy: -15 }).wave('phantom', 3, 0.5, F.hover(200, 6))
    L.at(118).gate(22)
    L.at(120).wave('sniper', 2, 0.5, F.hover(110, 7, 140, PW - 140)).wave('wasp', 4, 0.3, F.swoop(-1, 0.4))
    L.at(124).wave('phantom', 5, 0.35, F.loop(-1, 230))
    L.at(130).gate(20)

    // ── the storm breaks: escalation to the boss ──
    L.at(132).phase('calm').intensity(2).do((w) => w.flags.add('m2_calm'))
      .radio('KESTREL', 'Storm is breaking. I can see the rigs again.')
    L.at(133).decor('prop_oil_rig', 280, { y: -180 })
      .ground('turret', 230, { y: -130 }).ground('turret', 330, { y: -230 }).ground('flak', 280, { y: -180 }).ground('repair_cache', 470, { y: -60 })
    L.at(136).do((w) => { for (let i = 0; i < 6; i++) w.spawn('gunboat', -30 - i * 40, 60 + i * 30, { mover: new BoatMover(70, -40) }).noCull = true })
    L.at(139).intensity(3).wave('gunship', 1, 0, F.hoverAt(PW / 2, 150, 9)).wave('dart', 8, 0.3, F.loop(1, 220))
    L.at(143).radio('HALLORAN', 'Gunship. Keep moving, let it waste its breath.')
    L.at(145).ground('sub', 140, { y: -60 }).ground('sub', 420, { y: -60 }).decor('prop_island_s', 60, { y: -120 })
    L.at(149).gate(22)
    L.at(151).wave('bomber', 2, 1.2, F.column(PW * 0.3, 60)).wave('weaver', 6, 0.4, F.cross([[-30, 100], [PW * 0.5, 260], [PW + 40, 420]], 200))
    L.at(156).wave('splitter', 2, 1, F.hover(160, 6, 170, PW - 170)).ground('gunboat', 280, { vy: -30 })
    L.at(160).wave('wasp', 5, 0.25, F.hover(140, 5)).wave('dart', 6, 0.15, F.vee(PW / 2, 170))
    L.at(164).gate()

    // ── TIDEBREAKER ──
    L.at(166).scroll(14, 4).intensity(1).radio('HALLORAN', 'Sonar just lost the sea floor. No. Something is covering it.')
    L.at(169).radio('CHOIR', 'SWIM, LITTLE EMBER. THE WATER REMEMBERS WHAT IT DROWNED.', 'enemy')
    L.at(170).do((w) => spawnTidebreaker(w))
    L.at(171).until('boss_dead')
    L.at(173).radio('HALLORAN', 'It is going down. Glasswater is ours. What is left of it.')
    L.at(176).do((w) => { if (!w.flags.has('civilian_hit')) trawlerThanks(w) })
    L.at(184).do(() => {})
  },
}
