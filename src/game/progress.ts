import type { Campaign } from './campaign'
import type { MissionResult } from './session'
import { ORDER } from '../data/missions'

/** Which mission is next for this campaign (detours take priority). */
export function nextMissionId(c: Campaign): string | null {
  if (c.detour) return c.detour
  return ORDER[c.next] ?? null
}

/** Main-campaign index used for scaling rewards (detours use the index of the mission they interrupt). */
export function missionIndex(c: Campaign): number {
  return Math.min(c.next, ORDER.length - 1)
}

export function applyResult(c: Campaign, r: MissionResult): Campaign {
  const id = r.mission.id
  const wasDetour = c.detour === id
  const n: Campaign = {
    ...c,
    credits: c.credits + r.total,
    score: c.score + r.score,
    completed: c.completed.includes(id) ? c.completed : [...c.completed, id],
    cores: [...new Set([...c.cores, ...r.cores])],
    secrets: [...new Set([...c.secrets, ...r.secrets])],
    stats: { ...c.stats, kills: c.stats.kills + r.stats.kills, time: c.stats.time + r.stats.time, earned: c.stats.earned + r.total },
    detour: wasDetour ? null : r.warp,
    next: wasDetour ? c.next : c.next + 1,
  }
  if (!wasDetour && n.next >= ORDER.length && !n.detour) n.finished = true
  return n
}
