import type { Loadout } from './campaign'
import { shipStats } from './campaign'
import { createFront, createRear, Sunline } from './weapons'
import type { Player } from './player'
import type { World } from './world'

const POD_DRAW: Record<string, (l: number) => number> = {
  wasp: (l) => (l >= 2 ? 1 / 0.12 : 1 / 0.16),
  viper: (l) => 6 / (l >= 2 ? 0.8 : 1.1),
  aegis: () => 0,
  spark: () => 2 / 0.3,
  lantern: () => 22 / 1.6,
  mirror: () => 0,
}

/**
 * Sustained energy draw while holding fire, vs reactor output. This is the
 * number that makes "big gun + small reactor" a visible decision in the shop.
 */
export function powerBudget(l: Loadout) {
  const st = shipStats(l)
  const stub = null as unknown as Player
  const ws = null as unknown as World
  const g = createFront(l.front.id, l.front.level, stub, ws)
  const mirrors = [l.podL, l.podR].filter((p) => p?.id === 'mirror').length
  let front = g instanceof Sunline ? g.drain() : g.cost() / g.interval()
  front *= 1 + 0.3 * mirrors
  let rear = 0
  if (l.rear) { const r = createRear(l.rear.id, l.rear.level, stub, ws); rear = r.cost() / r.interval() }
  let pods = 0
  for (const p of [l.podL, l.podR]) if (p) pods += POD_DRAW[p.id]?.(p.level) ?? 0
  const shield = st.leech ? 0 : st.shieldRegen * st.shieldCost
  const weapons = front + rear + pods
  return { output: st.output, weapons, shield, draw: weapons + shield }
}
