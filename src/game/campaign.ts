import { ITEM, upgradeCost, sellValue, type ItemDef, type Slot } from '../data/items'

export interface Owned { id: string; level: number }

export interface Loadout {
  front: Owned
  rear: Owned | null
  podL: Owned | null
  podR: Owned | null
  reactor: string
  shield: string
  hull: string
  special: string | null
}

export type SlotKey = keyof Loadout

export type DifficultyId = 'courier' | 'gunship' | 'warhawk' | 'emberline'

export interface Difficulty {
  id: DifficultyId
  name: string
  desc: string
  bulletSpeed: number
  fireRate: number
  enemyHp: number
  damageTaken: number
  creditMul: number
  eliteChance: number
  /** Enemies lead their aim, bosses use extra attacks. */
  sharp: boolean
  /** Destroyed Choir craft release a spark of revenge fire. */
  revenge: boolean
}

export const DIFFICULTIES: Record<DifficultyId, Difficulty> = {
  courier: { id: 'courier', name: 'Courier', desc: 'Slower bullets, gentler fire. For enjoying the ride.', bulletSpeed: 0.8, fireRate: 0.7, enemyHp: 0.85, damageTaken: 0.65, creditMul: 1, eliteChance: 0, sharp: false, revenge: false },
  gunship: { id: 'gunship', name: 'Gunship', desc: 'The intended experience. Exciting, fair.', bulletSpeed: 1, fireRate: 1, enemyHp: 1, damageTaken: 1, creditMul: 1, eliteChance: 0.04, sharp: false, revenge: false },
  warhawk: { id: 'warhawk', name: 'Warhawk', desc: 'Enemies lead their shots, elites appear often, bosses gain new attacks. +15% credits.', bulletSpeed: 1.12, fireRate: 1.25, enemyHp: 1.1, damageTaken: 1.25, creditMul: 1.15, eliteChance: 0.12, sharp: true, revenge: false },
  emberline: { id: 'emberline', name: 'Emberline', desc: 'Everything from Warhawk, and the Choir fires back as it dies. +30% credits.', bulletSpeed: 1.22, fireRate: 1.4, enemyHp: 1.2, damageTaken: 1.5, creditMul: 1.3, eliteChance: 0.2, sharp: true, revenge: true },
}

export interface Campaign {
  version: 1
  difficulty: DifficultyId
  credits: number
  loadout: Loadout
  /** Index into the campaign mission order of the next mission to fly. */
  next: number
  completed: string[]
  cores: string[]
  secrets: string[]
  /** Secret missions unlocked but not yet flown. */
  detour: string | null
  score: number
  stats: { kills: number; deaths: number; time: number; earned: number }
  finished: boolean
}

export const START_LOADOUT: Loadout = {
  front: { id: 'pulse', level: 1 },
  rear: null,
  podL: null,
  podR: null,
  reactor: 'r1',
  shield: 's1',
  hull: 'h1',
  special: 'nova',
}

export function newCampaign(difficulty: DifficultyId): Campaign {
  return {
    version: 1, difficulty, credits: 1000, loadout: structuredClone(START_LOADOUT), next: 0,
    completed: [], cores: [], secrets: [], detour: null, score: 0,
    stats: { kills: 0, deaths: 0, time: 0, earned: 0 }, finished: false,
  }
}

export const SLOT_FOR: Record<Slot, SlotKey[]> = {
  front: ['front'], rear: ['rear'], pod: ['podL', 'podR'], reactor: ['reactor'], shield: ['shield'], hull: ['hull'], special: ['special'],
}

/** Slots that must always hold something: they can be replaced but not emptied. */
const MANDATORY: SlotKey[] = ['front', 'reactor', 'shield', 'hull']

export function ownedAt(l: Loadout, slot: SlotKey): Owned | null {
  const v = l[slot]
  if (v === null) return null
  if (typeof v === 'string') return { id: v, level: 1 }
  return v
}

export function setSlot(l: Loadout, slot: SlotKey, o: Owned | null): Loadout {
  const n = structuredClone(l)
  switch (slot) {
    case 'front': if (!o) throw new Error('front is mandatory'); n.front = o; break
    case 'rear': n.rear = o; break
    case 'podL': n.podL = o; break
    case 'podR': n.podR = o; break
    case 'reactor': case 'shield': case 'hull':
      if (!o) throw new Error(`${slot} is mandatory`)
      n[slot] = o.id; break
    case 'special': n.special = o ? o.id : null; break
  }
  return n
}

export function tradeInValue(c: Campaign, slot: SlotKey): number {
  const o = ownedAt(c.loadout, slot)
  return o ? sellValue(ITEM[o.id], o.level) : 0
}

export type ShopResult = { ok: true; campaign: Campaign } | { ok: false; reason: string }

export function isAvailable(c: Campaign, def: ItemDef): boolean {
  if (def.core) return c.cores.includes(def.core)
  return c.completed.length >= def.unlock
}

/** Net price of buying into a slot = price − trade-in of what's there. */
export function netPrice(c: Campaign, itemId: string, slot: SlotKey): number {
  return ITEM[itemId].price - tradeInValue(c, slot)
}

export function buy(c: Campaign, itemId: string, slot: SlotKey): ShopResult {
  const def = ITEM[itemId]
  if (!def) return { ok: false, reason: 'Unknown item' }
  if (!SLOT_FOR[def.slot].includes(slot)) return { ok: false, reason: 'Wrong slot' }
  if (!isAvailable(c, def)) return { ok: false, reason: 'Not in stock' }
  const cur = ownedAt(c.loadout, slot)
  if (cur && cur.id === itemId) return { ok: false, reason: 'Already installed' }
  const cost = netPrice(c, itemId, slot)
  if (cost > c.credits) return { ok: false, reason: 'Not enough credits' }
  return {
    ok: true,
    campaign: { ...c, credits: c.credits - cost, loadout: setSlot(c.loadout, slot, { id: itemId, level: 1 }) },
  }
}

export function upgrade(c: Campaign, slot: SlotKey): ShopResult {
  const cur = ownedAt(c.loadout, slot)
  if (!cur) return { ok: false, reason: 'Empty slot' }
  const def = ITEM[cur.id]
  if (cur.level >= def.maxLevel) return { ok: false, reason: 'Fully upgraded' }
  const cost = upgradeCost(def, cur.level)
  if (cost > c.credits) return { ok: false, reason: 'Not enough credits' }
  return {
    ok: true,
    campaign: { ...c, credits: c.credits - cost, loadout: setSlot(c.loadout, slot, { id: cur.id, level: cur.level + 1 }) },
  }
}

export function sell(c: Campaign, slot: SlotKey): ShopResult {
  if (MANDATORY.includes(slot)) return { ok: false, reason: 'Replace it instead — a ship needs one' }
  const cur = ownedAt(c.loadout, slot)
  if (!cur) return { ok: false, reason: 'Empty slot' }
  return {
    ok: true,
    campaign: { ...c, credits: c.credits + sellValue(ITEM[cur.id], cur.level), loadout: setSlot(c.loadout, slot, null) },
  }
}

/** Derived ship stats from a loadout — used by the player and the shop readout. */
export function shipStats(l: Loadout) {
  const r = ITEM[l.reactor], s = ITEM[l.shield], h = ITEM[l.hull]
  return {
    output: r.output!, capacity: r.capacity!,
    shieldCap: s.shieldCap!, shieldRegen: s.shieldRegen!, shieldDelay: s.shieldDelay!, shieldCost: s.shieldCost!,
    hull: h.hull!, speedMul: h.speedMul ?? 1,
    reflex: l.shield === 's3', leech: l.shield === 's5', ghost: l.hull === 'h6',
  }
}
export type ShipStats = ReturnType<typeof shipStats>
