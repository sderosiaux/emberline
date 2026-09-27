import type { Player } from './player'
import type { World } from './world'
import { PW, PH } from './consts'

/**
 * Heuristic pilot used for the title-screen attract mode and automated
 * playtests. Samples a few candidate moves and picks the least dangerous one
 * that also lines up with a target. Not a perfect player — deliberately so.
 */
const REACH: Record<string, number> = { arc: 210, hail: 240 }

export function autopilot(skill = 1) {
  let aimX = PW / 2
  let aimY = 0
  let retarget = 0
  return (p: Player, w: World, dt: number) => {
    retarget -= dt
    if (retarget <= 0) {
      retarget = 0.4
      let best = null as null | { x: number; y: number; score: number }
      for (const e of w.enemies) {
        if (e.dead || e.y < 0 || e.y > p.y - 40 || e.s.civilian || e.armor <= 0 || w.isShielded(e)) continue
        const sc = e.maxHp > 300 ? 3 : 1
        const d = Math.abs(e.x - p.x)
        const score = sc * 400 - d + (e.layer === 'air' ? 80 : 0)
        if (!best || score > best.score) best = { x: e.x, y: e.y, score }
      }
      aimX = best ? best.x : PW / 2 + Math.sin(w.time * 0.5) * 120
      aimY = best ? best.y : 0
    }
    const dirs = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]
    let bestDir = dirs[0], bestScore = -Infinity
    const horizon = 0.28
    const speed = p.speed
    for (const [dx, dy] of dirs) {
      const nx = p.x + dx * speed * horizon, ny = p.y + dy * speed * horizon
      if (nx < 20 || nx > PW - 20 || ny < PH * 0.45 || ny > PH - 30) continue
      let danger = 0
      for (const b of w.bullets.items) {
        if (!b.active) continue
        for (const t of [0.08, 0.16, horizon]) {
          const bx = b.x + b.vx * t, by = b.y + b.vy * t
          const px = p.x + dx * speed * t, py = p.y + dy * speed * t
          const d2 = (bx - px) ** 2 + (by - py) ** 2
          const r = (b.r + p.hitR + 10 / skill)
          if (d2 < r * r) danger += 1000 / (t + 0.05)
          else if (d2 < (r * 3) ** 2) danger += 30
        }
      }
      for (const e of w.enemies) {
        if (e.dead || e.layer !== 'air' || e.contact <= 0) continue
        const d2 = (e.x - nx) ** 2 + (e.y - ny) ** 2
        if (d2 < (e.r + 30) ** 2) danger += 800
      }
      for (const l of w.lasers) {
        const ex = Math.cos(l.ang), ey = Math.sin(l.ang)
        const rx = nx - l.x, ry = ny - l.y
        const t = Math.max(0, Math.min(l.len, rx * ex + ry * ey))
        const d = Math.sqrt((rx - ex * t) ** 2 + (ry - ey * t) ** 2)
        const wr = l.width / 2 + 16
        // graded so candidate moves that head out of the beam win over staying inside
        if (d < wr) danger += 600 + (wr - d) * 25
      }
      const align = -Math.abs(nx - aimX) * 0.8
      // short-range guns need to close in; everything else hangs back
      const reach = REACH[p.loadout.front.id] ?? 9999
      const homeY = Math.max(PH * 0.5, Math.min(PH - 150, aimY + reach))
      const home = -Math.abs(ny - homeY) * 0.3
      let loot = 0
      for (const k of w.pickups.items) if (k.active && (k.x - nx) ** 2 + (k.y - ny) ** 2 < 120 * 120) loot += 25
      const score = -danger + align + home + loot
      if (score > bestScore) { bestScore = score; bestDir = [dx, dy] }
    }
    let near = 0
    for (const b of w.bullets.items) if (b.active && (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < 90 * 90) near++
    return { mx: bestDir[0], my: bestDir[1], fire: true, special: near > 7 || p.hull < p.maxHull * 0.3 }
  }
}
