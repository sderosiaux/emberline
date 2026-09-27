/**
 * Equipment catalogue. Numbers here are the economy; weapon *behaviour* per
 * level lives in game/weapons.ts. `levels[i]` describes what level i+1 adds,
 * shown in the shop so players can see the next upgrade change the gun.
 */
export type Slot = 'front' | 'rear' | 'pod' | 'reactor' | 'shield' | 'hull' | 'special'

export interface ItemDef {
  id: string
  name: string
  slot: Slot
  price: number
  maxLevel: number
  /** Shop availability: appears after this many missions completed. */
  unlock: number
  /** Prototype gear: requires the data core with this id. */
  core?: string
  blurb: string
  quip: string
  levels?: string[]
  // reactor
  output?: number
  capacity?: number
  // shield
  shieldCap?: number
  shieldRegen?: number
  shieldDelay?: number
  shieldCost?: number
  // hull
  hull?: number
  speedMul?: number
  // special
  specialCost?: number
  tags?: string[]
}

const F = (d: Omit<ItemDef, 'slot' | 'maxLevel'>): ItemDef => ({ ...d, slot: 'front', maxLevel: 8 })
const R = (d: Omit<ItemDef, 'slot' | 'maxLevel'>): ItemDef => ({ ...d, slot: 'rear', maxLevel: 5 })
const Pd = (d: Omit<ItemDef, 'slot' | 'maxLevel'>): ItemDef => ({ ...d, slot: 'pod', maxLevel: 3 })

export const ITEMS: ItemDef[] = [
  // ───────── FRONT GUNS ─────────
  F({
    id: 'pulse', name: 'Ember Pulse', price: 1200, unlock: 0,
    blurb: 'Rapid amber bolts. Honest, efficient, grows into a wall of fire.',
    quip: 'Came with the ship. Like the smell.',
    levels: ['Single bolt', 'Twin bolts', 'Triple bolts', 'Adds diagonal bolts', 'Heavy bolts pierce one target',
      'Wider forward battery', 'Faster cycle, wide flankers', 'Ember Storm: piercing lances that burst on impact'],
  }),
  F({
    id: 'hail', name: 'Hailstorm', price: 2200, unlock: 0,
    blurb: 'Short-range pellet fan. Brutal up close, useless from afar. Fly into their face.',
    quip: "Point it at the problem. Get closer. Closer than that.",
    levels: ['5-pellet fan', 'Wider fan', '7 pellets, harder hits', 'Longer reach', 'Flechettes pierce one target',
      '10-pellet fan', 'Adds a heavy center slug', 'Pellets shatter into shrapnel at range'],
  }),
  F({
    id: 'hornet', name: 'Hornet Rack', price: 3200, unlock: 0,
    blurb: 'Homing micro-missiles. Look where you want to fly, not where they are.',
    quip: 'Fire and forget. I forget a lot, it works for me.',
    levels: ['2 missiles per salvo', '3 missiles', '4 missiles with small blasts', 'Faster salvos', '6 missiles',
      'Bigger blasts, harder hits', '8 missiles', 'Missile wall: 10 per salvo'],
  }),
  F({
    id: 'arc', name: 'Arc Coil', price: 4200, unlock: 1,
    blurb: 'Lightning that finds its own targets and jumps between them. Aim is optional.',
    quip: "Don't lick it.",
    levels: ['Arc jumps once', 'Jumps twice', 'Longer reach, more damage', 'Forks: two primary arcs', 'Jumps three times',
      'Much longer reach', 'Three primary arcs', 'Storm Crown: five jumps, arcs stagger their guns'],
  }),
  F({
    id: 'bloom', name: 'Bloom Mortar', price: 4800, unlock: 2,
    blurb: 'Slow shells that burst into rings of shrapnel. Area denial for the lazy and the wise.',
    quip: "It's a flower. A very angry flower.",
    levels: ['1 shell, 6 shards', '8 shards', 'Twin shells', 'Wider blast', 'Shards pierce',
      'Triple shells', 'Faster cycle, 12 shards', 'Chain bloom: every shard pops again'],
  }),
  F({
    id: 'helix', name: 'Helix Weaver', price: 5600, unlock: 2,
    blurb: 'Twin piercing strands that weave across your lane. Covers width, rewards patience.',
    quip: 'Pretty. Also cuts through armor. Mostly pretty.',
    levels: ['Twin strand', 'Wider weave', 'Adds a center strand', 'Strands pierce three targets', 'Second, wider helix',
      'Faster weave', 'Strands pierce everything', 'Double helix sweeps the whole lane'],
  }),
  F({
    id: 'sunline', name: 'Sunline', price: 8800, unlock: 3,
    blurb: 'A continuous beam. Hungry for power. Stops at the first target until it learns not to.',
    quip: 'Bring a bigger reactor. No, bigger.',
    levels: ['Thin beam', 'Hotter beam', 'Wider beam', 'Hotter still', 'Beam pierces all + twin sub-beams',
      'Wide beam', 'Sub-beams angle outward', 'Solar Lance: everything it touches burns'],
  }),
  F({
    id: 'rail', name: 'Needle Rail', price: 11000, unlock: 4,
    blurb: 'Hypersonic rails that pass through everything in a line. Slow cycle, enormous hits.',
    quip: 'Ever wanted to hit six ships with one bullet? Now you can want it harder.',
    levels: ['One rail', 'Heavier rail', 'Faster cycle', 'Twin rails', 'Rails emit shock bursts',
      'Faster cycle', 'Triple rails', 'Rails leave a static scar'],
  }),
  F({
    id: 'chorus', name: 'Chorus', price: 9000, unlock: 0, core: 'core_chorus',
    blurb: "A Choir weapon, torn from a pod that tried to run. It sings. It shouldn't.",
    quip: "I'm not touching that. Take it. Take it away.",
    levels: ['Growing sonic crescents', 'Wider crescents', 'Twin crescents', 'Crescents resonate on hit', 'Triple crescents',
      'Faster song', 'Crescents grow huge', 'Full choir: five-part harmony'],
    tags: ['prototype'],
  }),

  // ───────── REAR / AUX ─────────
  R({
    id: 'stinger', name: 'Tail Stinger', price: 1100, unlock: 0,
    blurb: 'Rear-firing bolts. For the ones that sneak up behind.',
    quip: 'Rear-view mirror with opinions.',
    levels: ['Single rear bolt', 'Twin rear bolts', 'Adds rear diagonals', 'Bolts pierce', 'Full rear battery'],
  }),
  R({
    id: 'flank', name: 'Wide Flank', price: 1800, unlock: 0,
    blurb: 'Fires sideways. Flankers, turrets, anything beside you.',
    quip: 'Side-eye, weaponised.',
    levels: ['One shot per side', 'Two per side, one angled up', 'Three-shot side fans', 'Faster cycle', 'Four per side, piercing'],
  }),
  R({
    id: 'mines', name: 'Mine Layer', price: 2600, unlock: 1,
    blurb: 'Drops proximity mines that drift behind you. Lead enemies into your garden.',
    quip: "Leave little presents. Don't step on them. Actually you can't. Probably.",
    levels: ['Slow mine drops', 'Bigger blasts', 'Two mines per drop', 'Faster drops', 'Cluster mines'],
  }),
  R({
    id: 'burner', name: 'Backburner', price: 3400, unlock: 2,
    blurb: 'A cone of fire behind the ship. Also doubles as a threat display.',
    quip: 'Your exhaust, but worse. For them.',
    levels: ['Short rear flame', 'Longer flame', 'Adds side jets', 'Hotter flame', 'Inferno wake'],
  }),
  R({
    id: 'halo', name: 'Halo Emitter', price: 6000, unlock: 0, core: 'core_halo',
    blurb: 'Rhythmic radial pulses around the hull. Found somewhere very strange.',
    quip: 'It hums in time with something. I asked it what. It hummed.',
    levels: ['Slow pulse', 'Wider pulse', 'Faster pulse', 'Pulses erase small bullets', 'Double pulse'],
    tags: ['prototype'],
  }),

  // ───────── PODS ─────────
  Pd({
    id: 'wasp', name: 'Wasp Drone', price: 1400, unlock: 0,
    blurb: 'A little gun on a little drone. Fires with you.',
    quip: 'Loyal. Stupid. Loyal.',
    levels: ['Light gun', 'Faster, harder', 'Twin guns'],
  }),
  Pd({
    id: 'viper', name: 'Viper Pod', price: 2600, unlock: 0,
    blurb: 'Periodic homing missiles with a real punch.',
    quip: 'Every second, a small bad day for someone.',
    levels: ['Missile every 1.1 s', 'Missile every 0.8 s', 'Twin missiles'],
  }),
  Pd({
    id: 'aegis', name: 'Aegis Orb', price: 3000, unlock: 1,
    blurb: 'An orbiting orb that eats enemy bullets and grinds anything it touches.',
    quip: 'A moon with a job.',
    levels: ['Slow orbit', 'Larger orb, faster orbit', 'Orb pulses on each block'],
  }),
  Pd({
    id: 'spark', name: 'Spark Tender', price: 3400, unlock: 1,
    blurb: 'Zaps whatever gets close. Always on, even when you are not firing.',
    quip: 'Personal space, enforced.',
    levels: ['Short zaps', 'Longer reach', 'Zaps jump to a second target'],
  }),
  Pd({
    id: 'lantern', name: 'Lantern', price: 4200, unlock: 2,
    blurb: 'Charges while you fire, then releases a heavy piercing orb.',
    quip: 'Patience, bottled.',
    levels: ['Heavy orb every 1.6 s', 'Heavier orb', 'Orb detonates at the end'],
  }),
  Pd({
    id: 'mirror', name: 'Mirror Pod', price: 7200, unlock: 3,
    blurb: 'Copies your front gun at reduced power. The better your gun, the better this is.',
    quip: 'Twice the gun, one and a half the bill.',
    levels: ['35% echo', '45% echo', '55% echo'],
  }),

  // ───────── REACTORS ─────────
  { id: 'r1', name: 'Tinder Cell', slot: 'reactor', price: 600, maxLevel: 1, unlock: 0, output: 55, capacity: 90,
    blurb: 'Stock courier reactor.', quip: "It's… a reactor. Technically." },
  { id: 'r2', name: 'Kiln Mk II', slot: 'reactor', price: 2600, maxLevel: 1, unlock: 0, output: 85, capacity: 130,
    blurb: 'Solid mid-range output.', quip: 'Runs hot. You will too.' },
  { id: 'r3', name: 'Forge Core', slot: 'reactor', price: 6200, maxLevel: 1, unlock: 1, output: 125, capacity: 180,
    blurb: 'Military-grade. Feeds heavy guns.', quip: 'Fell off a frigate. Twice.' },
  { id: 'r4', name: 'Solar Heart', slot: 'reactor', price: 13500, maxLevel: 1, unlock: 3, output: 180, capacity: 240,
    blurb: 'Enough power to run a beam and a shield at once.', quip: 'Do not look directly at the invoice.' },
  { id: 'r5', name: 'Nova Engine', slot: 'reactor', price: 24000, maxLevel: 1, unlock: 4, output: 260, capacity: 320,
    blurb: 'Capital-ship output in a courier frame.', quip: 'The frame will hold. I think the frame will hold.' },
  { id: 'r6', name: 'Choir Shard', slot: 'reactor', price: 18000, maxLevel: 1, unlock: 0, core: 'core_shard', output: 340, capacity: 200,
    blurb: 'A fragment of the Choir, humming with borrowed power. Small reserve, absurd output.', quip: 'It whispers at night. I moved it to your ship.', tags: ['prototype'] },

  // ───────── SHIELDS ─────────
  { id: 's1', name: 'Veil', slot: 'shield', price: 500, maxLevel: 1, unlock: 0, shieldCap: 30, shieldRegen: 14, shieldDelay: 1.3, shieldCost: 1,
    blurb: 'Thin but quick to recover.', quip: 'Better than a strongly worded letter.' },
  { id: 's2', name: 'Bulwark', slot: 'shield', price: 3400, maxLevel: 1, unlock: 0, shieldCap: 80, shieldRegen: 11, shieldDelay: 3, shieldCost: 1.5,
    blurb: 'Deep reserves, slow to come back, thirsty.', quip: 'Heavy. Reliable. Like my ex-husband.' },
  { id: 's3', name: 'Reflex Screen', slot: 'shield', price: 5200, maxLevel: 1, unlock: 1, shieldCap: 50, shieldRegen: 15, shieldDelay: 2, shieldCost: 1,
    blurb: 'When it breaks, it detonates outward and erases nearby bullets (8 s cooldown).', quip: 'It gets angry when it loses. Relatable.' },
  { id: 's4', name: 'Aegis Lattice', slot: 'shield', price: 14000, maxLevel: 1, unlock: 3, shieldCap: 140, shieldRegen: 24, shieldDelay: 2.4, shieldCost: 1.6,
    blurb: 'Fleet-grade shielding. Needs a serious reactor.', quip: 'Admiralty surplus. Very surplus. Do not ask which admiral.' },
  { id: 's5', name: 'Leech Weave', slot: 'shield', price: 8000, maxLevel: 1, unlock: 0, core: 'core_leech', shieldCap: 70, shieldRegen: 0, shieldDelay: 0, shieldCost: 0,
    blurb: 'Draws no power. Regenerates only by killing.', quip: 'Feed it and it feeds you.', tags: ['prototype'] },

  // ───────── HULL ─────────
  { id: 'h1', name: 'Plating Mk I', slot: 'hull', price: 400, maxLevel: 1, unlock: 0, hull: 100, speedMul: 1, blurb: 'Courier-grade ceramic.', quip: 'Keeps the air in.' },
  { id: 'h2', name: 'Plating Mk II', slot: 'hull', price: 1600, maxLevel: 1, unlock: 0, hull: 150, speedMul: 1, blurb: 'Layered ceramic.', quip: 'Keeps the air in, harder.' },
  { id: 'h3', name: 'Plating Mk III', slot: 'hull', price: 4600, maxLevel: 1, unlock: 1, hull: 210, speedMul: 1, blurb: 'Composite armor.', quip: 'Now it keeps bullets out too.' },
  { id: 'h4', name: 'Plating Mk IV', slot: 'hull', price: 9500, maxLevel: 1, unlock: 3, hull: 290, speedMul: 0.95, blurb: 'Heavy armor. Slightly slower.', quip: 'You will feel it in the turns.' },
  { id: 'h5', name: 'Plating Mk V', slot: 'hull', price: 18000, maxLevel: 1, unlock: 4, hull: 380, speedMul: 0.9, blurb: 'Bastion-grade. Noticeably slower.', quip: 'A flying bunker. A slow flying bunker.' },
  { id: 'h6', name: 'Ghost Frame', slot: 'hull', price: 9000, maxLevel: 1, unlock: 0, core: 'core_ghost', hull: 120, speedMul: 1.15,
    blurb: 'Light alien lattice. Faster ship, smaller hit core.', quip: 'Weighs nothing. Costs everything.', tags: ['prototype'] },

  // ───────── SPECIALS ─────────
  { id: 'nova', name: 'Nova Charge', slot: 'special', price: 800, maxLevel: 1, unlock: 0, specialCost: 100,
    blurb: 'Expanding shockwave: erases bullets, damages everything nearby.', quip: 'The panic button. Push it.' },
  { id: 'overclock', name: 'Overclock', slot: 'special', price: 3000, maxLevel: 1, unlock: 0, specialCost: 100,
    blurb: '7 seconds of double fire rate with zero energy cost.', quip: 'Voids the warranty. What warranty.' },
  { id: 'phase', name: 'Phase Drive', slot: 'special', price: 3600, maxLevel: 1, unlock: 1, specialCost: 80,
    blurb: '3 seconds out of phase: untouchable, faster, and you shred whatever you fly through.', quip: 'Be somewhere else. Loudly.' },
  { id: 'swarm', name: 'Swarm Rack', slot: 'special', price: 6200, maxLevel: 1, unlock: 2, specialCost: 100,
    blurb: 'Empties forty homing missiles into the sky.', quip: 'Why choose a target when you can choose all of them.' },
  { id: 'singularity', name: 'Singularity', slot: 'special', price: 8400, maxLevel: 1, unlock: 3, specialCost: 100,
    blurb: 'Opens a gravity well that swallows bullets and drags ships in.', quip: 'Illegal in four systems. Five, now.' },
]

export const ITEM: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

/** Cost to go from `level` to `level + 1`. Escalates so maxing a gun is a real commitment. */
export function upgradeCost(def: ItemDef, level: number): number {
  if (level >= def.maxLevel) return Infinity
  // One curve per slot type, independent of purchase price: an expensive gun is a
  // bigger entry ticket, not a permanently unaffordable upgrade track.
  const base = def.slot === 'front' ? 700 : def.slot === 'rear' ? 520 : 1500
  const proto = def.tags?.includes('prototype') ? 1.15 : 1
  return Math.round((base * proto * Math.pow(level, 1.5)) / 50) * 50
}

/** Total credits sunk into an item at a level (base + all upgrades). */
export function investedValue(def: ItemDef, level: number): number {
  let v = def.price
  for (let l = 1; l < level; l++) v += upgradeCost(def, l)
  return v
}

export const SELL_RATIO = 0.8
export const sellValue = (def: ItemDef, level: number) => Math.floor(investedValue(def, level) * SELL_RATIO)
