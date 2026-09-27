import type { Campaign, DifficultyId } from './campaign'
import { DIFFICULTIES, START_LOADOUT, newCampaign } from './campaign'
import { ITEM } from '../data/items'
import { MISSIONS } from '../data/missions'

export interface Settings {
  master: number
  music: number
  sfx: number
  shake: 'full' | 'reduced' | 'off'
  effects: 'high' | 'low'
  alwaysFire: boolean
  showFps: boolean
  /** 0 = uncapped (render at display refresh). */
  fpsCap: 60 | 0
}

export interface Records {
  bestScore: number
  missionBest: Record<string, number>
  completedDifficulties: DifficultyId[]
  secretsEver: string[]
}

export const DEFAULT_SETTINGS: Settings = { master: 0.8, music: 0.7, sfx: 0.8, shake: 'full', effects: 'high', alwaysFire: false, showFps: false, fpsCap: 60 }
const DEFAULT_RECORDS: Records = { bestScore: 0, missionBest: {}, completedDifficulties: [], secretsEver: [] }

const K = { campaign: 'emberline.campaign.v1', settings: 'emberline.settings.v1', records: 'emberline.records.v1' }

/** Storage shim so pure logic can be tested in node. */
export interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void }
let store: Store | null = typeof localStorage !== 'undefined' ? localStorage : null
export function setStore(s: Store) { store = s }

function read<T>(k: string): T | null {
  if (!store) return null
  try {
    const v = store.getItem(k)
    return v ? (JSON.parse(v) as T) : null
  } catch { return null }
}
function write(k: string, v: unknown) {
  if (!store) return
  try { store.setItem(k, JSON.stringify(v)) } catch { /* quota or private mode: play without saving */ }
}

export function loadCampaign(): Campaign | null {
  const c = read<Campaign>(K.campaign)
  if (!c || c.version !== 1 || !c.loadout?.front) return null
  return normalizeCampaign(c)
}

/** Repair saves from older builds: unknown items fall back to stock parts, missing fields to defaults. */
export function normalizeCampaign(raw: Campaign): Campaign {
  const diff = raw.difficulty in DIFFICULTIES ? raw.difficulty : 'gunship'
  const base = newCampaign(diff)
  const c: Campaign = { ...base, ...raw, difficulty: diff, stats: { ...base.stats, ...(raw.stats ?? {}) } }
  const L = { ...START_LOADOUT, ...raw.loadout }
  const okOwned = (o: unknown, slot: string) => !!o && typeof o === 'object' && ITEM[(o as { id: string }).id]?.slot === slot
  const lvl = (o: { id: string; level: number }) => ({ id: o.id, level: Math.max(1, Math.min(ITEM[o.id].maxLevel, Math.floor(o.level) || 1)) })
  L.front = okOwned(L.front, 'front') ? lvl(L.front) : { ...START_LOADOUT.front }
  L.rear = okOwned(L.rear, 'rear') ? lvl(L.rear!) : null
  L.podL = okOwned(L.podL, 'pod') ? lvl(L.podL!) : null
  L.podR = okOwned(L.podR, 'pod') ? lvl(L.podR!) : null
  for (const k of ['reactor', 'shield', 'hull'] as const) if (ITEM[L[k]]?.slot !== k) L[k] = START_LOADOUT[k]
  if (L.special && ITEM[L.special]?.slot !== 'special') L.special = START_LOADOUT.special
  c.loadout = L
  if (!Number.isFinite(c.credits)) c.credits = 0
  for (const k of ['completed', 'cores', 'secrets'] as const) if (!Array.isArray(c[k])) c[k] = []
  if (c.detour && !MISSIONS[c.detour]) c.detour = null
  if (!Number.isFinite(c.next)) c.next = 0
  return c
}
export const saveCampaign = (c: Campaign) => write(K.campaign, c)
export const clearCampaign = () => store?.removeItem(K.campaign)

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...(read<Partial<Settings>>(K.settings) ?? {}) })
export const saveSettings = (s: Settings) => write(K.settings, s)

export const loadRecords = (): Records => ({ ...DEFAULT_RECORDS, ...(read<Partial<Records>>(K.records) ?? {}) })
export const saveRecords = (r: Records) => write(K.records, r)

export function resetAll() {
  if (!store) return
  for (const k of Object.values(K)) store.removeItem(k)
}
