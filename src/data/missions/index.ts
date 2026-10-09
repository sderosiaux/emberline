import type { MissionDef } from '../../game/level'
import { m1 } from './m1'
import { m2 } from './m2'
import { m3 } from './m3'
import { m4 } from './m4'
import { garden } from './garden'
import { m5 } from './m5'
import { m6 } from './m6'
import { m7 } from './m7'

export const MISSIONS: Record<string, MissionDef> = { m1, m2, m3, m4, garden, m5, m6, m7 }
/** Main campaign order. Secret missions (garden) are detours inserted by in-mission discoveries. */
export const ORDER: string[] = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7']

/** Arcade run: five stages back to back, no hangar in between. */
export const ARCADE_STAGES: string[] = ['m1', 'm2', 'm3', 'm4', 'm5']
