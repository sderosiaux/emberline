import type { MissionDef } from '../../game/level'
import { F } from '../../game/level'
import { PW, PH } from '../../game/consts'
import { registerEnemy } from '../enemies'
import { spawnGardener } from '../../game/bosses/gardener'
import { LineMover, GroundMover } from '../../game/movers'
import { canFire, onScreen, enemySfx } from '../../game/patterns'
import { BulletKind, PickupKind } from '../../game/entities'
import type { Enemy } from '../../game/entities'
import { P, C } from '../../render/particles'
import { rand, TAU, lerp, angleDiff } from '../../core/math'
import type { World } from '../../game/world'
import { drawSprite, getSprite } from '../../render/sprites'

/**
 * Songbirds fly as a murmuration: every bird springs toward its own slot on a
 * breathing, turning ellipse around a shared flock centre that drifts along a
 * path. The lag of the springs is what makes the flock pour and fold.
 */
class Flock {
  constructor(public t0: number, public dur: number, public path: (u: number) => [number, number], public spread: number) {}
}

class FlockMover {
  constructor(private f: Flock, private i: number) {}
  update(e: Enemy, w: World, dt: number) {
    const t = w.time - this.f.t0
    const u = t / this.f.dur
    if (u > 1) {
      e.x += e.vx * dt; e.y += e.vy * dt
      if (e.y > PH + 60 || e.x < -80 || e.x > PW + 80 || e.y < -120) e.gone = true
      return
    }
    const [cx, cy] = this.f.path(u)
    const a = this.i * 2.399963 + t * 0.9
    const R = this.f.spread * (0.45 + 0.55 * Math.abs(Math.sin(t * 0.7 + this.i * 0.37)))
    const tx = cx + Math.cos(a) * R, ty = cy + Math.sin(a) * R * 0.55
    e.vx += ((tx - e.x) * 7 - e.vx * 3.2) * dt
    e.vy += ((ty - e.y) * 7 - e.vy * 3.2) * dt
    e.x += e.vx * dt; e.y += e.vy * dt
    const want = Math.atan2(e.vy, e.vx) - Math.PI / 2
    e.rot += angleDiff(e.rot, want) * Math.min(1, dt * 8)
  }
}

/** Spawn n songbirds bunched at the path start. */
function flock(n: number, dur: number, spread: number, path: (u: number) => [number, number]) {
  return (w: World) => {
    const f = new Flock(w.time, dur, path, spread)
    const [x, y] = path(0)
    for (let i = 0; i < n; i++) {
      const e = w.spawn('garden_songbird', x + rand(-20, 20), y + rand(-20, 20), { mover: new FlockMover(f, i) })
      e.noCull = true
    }
  }
}
const sPath = (x0: number, y0: number, x1: number, y1: number, amp: number, waves = 1) => (u: number): [number, number] =>
  [lerp(x0, x1, u) + Math.sin(u * Math.PI * 2 * waves) * amp, lerp(y0, y1, u) + Math.sin(u * Math.PI) * 50]
const loopPath = (cx: number, cy: number, r: number, from: -1 | 1) => (u: number): [number, number] => {
  const a = from < 0 ? Math.PI + u * TAU * 1.1 : -u * TAU * 1.1
  const k = Math.min(1, u * 4)
  return [cx + Math.cos(a) * r * k + (1 - k) * (from < 0 ? -210 : 210), cy + Math.sin(a) * r * 0.5 + u * 230 - (1 - k) * 50]
}

registerEnemy({
  id: 'garden_songbird', hp: 22, r: 10, sprite: 'garden_songbird', layer: 'air', score: 80, credits: 10, charge: 2, explode: 'small', contact: 15,
  init(e) { e.s.f = rand(1.5, 5) },
  update(e, w, dt) {
    if (e.s.orbit) {
      // Gardener's own flock: circle it, widening, then glide down past you
      const root = e.data as Enemy | null
      e.s.oa += dt * 1.3
      e.s.or = Math.min(220, (e.s.or ?? 78) + dt * 39)
      if (root && !root.dead && e.age < 6) {
        const tx = root.x + Math.cos(e.s.oa) * e.s.or, ty = root.y + Math.sin(e.s.oa) * e.s.or * 0.7
        e.vx = (tx - e.x) * 4; e.vy = (ty - e.y) * 4
        e.x += e.vx * dt; e.y += e.vy * dt
        e.rot = e.s.oa
      } else {
        if (!e.mover) { const a = Math.atan2(w.player.y - e.y, w.player.x - e.x); e.mover = new LineMover(Math.cos(a) * 170, Math.sin(a) * 170, true) }
      }
    }
    e.s.f -= dt * w.diff.fireRate
    if (e.s.f <= 0) {
      e.s.f = rand(4, 7)
      if (canFire(w, e) && Math.random() < 0.45) {
        w.fire(e.x, e.y + 6, w.aim(e.x, e.y, 130), 130, BulletKind.Ring, 10)
        enemySfx(w, e.x)
      }
    }
  },
})

registerEnemy({
  id: 'garden_flower', hp: 220, r: 18, sprite: 'garden_flower', layer: 'ground', score: 400, credits: 45, charge: 5, explode: 'medium', target: true,
  init(e) { e.s.t = rand(1, 2.2); e.s.open = 0 },
  update(e, w, dt) {
    e.s.open = Math.max(0, e.s.open - dt)
    e.s.t -= dt * w.diff.fireRate
    if (e.s.t > 0 || !onScreen(e, 20) || e.y > w.player.y - 60 || !w.player.alive) return
    e.s.t = 4.6
    e.s.open = 1.4
    const n = e.elite ? 12 : 9
    const off = rand(0, TAU)
    for (const sgn of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const b = w.fire(e.x, e.y, off + (i / n) * TAU, 80, BulletKind.Ring, 10)
        if (b) { b.curve = sgn * 0.55; b.ttl = 6.5 }
      }
    }
    for (let i = 0; i < 8; i++) w.parts.spawn(P.Glow, e.x, e.y, rand(-60, 60), rand(-60, 60), 0.6, 5, 1, C.gold, 2, true)
    enemySfx(w, e.x, true)
  },
  drawBody(ctx, e, w) {
    const open = e.s.open > 0
    // living flowers glow gold as a bloom gathers — tells them apart from the scenery
    const k = open ? 1 : Math.min(1, Math.max(0.25, 1 - e.s.t / 2))
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(255,214,120,${0.25 + 0.5 * k})`
    ctx.lineWidth = 1.5 + k * 1.5
    ctx.beginPath(); ctx.arc(e.x, e.y, 22 + (1 - k) * 8, 0, TAU); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    drawSprite(ctx, getSprite(open ? 'garden_flower_open' : 'garden_flower'), e.x, e.y, w.time * 0.3 + e.id, e.scale * (open ? 1 + Math.sin(e.s.open * 6) * 0.04 : 1), 1, e.flash)
  },
})

registerEnemy({
  id: 'garden_fruit', hp: 50, r: 15, sprite: 'garden_fruit', layer: 'air', score: 300, credits: 0, charge: 6, explode: 'small', contact: 0,
  update(e, w) { e.rot = Math.sin(w.time * 1.4 + e.id) * 0.25 },
  onDeath(e, w) {
    if (w.preview) return
    for (let i = 0; i < 9; i++) w.pickup(PickupKind.CreditBig, e.x + rand(-8, 8), e.y + rand(-8, 8), Math.round(34 * w.diff.creditMul))
    for (let i = 0; i < 14; i++) w.parts.spawn(P.Glow, e.x, e.y, rand(-180, 180), rand(-180, 180), rand(0.4, 0.8), 5, 1, C.credit, 3)
    w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.4, 10, 60, C.credit)
  },
})

const flowers = (...xs: number[]) => (w: World) => {
  xs.forEach((x, i) => w.after(i * 0.15, () => w.spawn('garden_flower', x, -40 - (i % 2) * 30, { mover: new GroundMover() })))
}

export const garden: MissionDef = {
  id: 'garden', num: '??', name: 'Static Garden', biome: 'garden', track: 'secret', scroll: 40,
  briefing: [
    '...',
    'no signal from fleet. transponder reads a place that is not on any chart.',
    'the instruments say you are flying through a garden.',
    'they also say you are standing still.',
  ],
  script(L) {
    const V = '???'
    const X = (f: number) => PW * f
    L.at(0.5).radio(V, 'you are not supposed to be here.', 'odd')
    L.at(2.5).radio(V, 'stay a while.', 'odd')
    L.at(3.5).do(flock(16, 9, 80, sPath(X(0.5), -60, X(0.2), PH + 80, 210, 1)))
    L.at(7).wave('garden_fruit', 3, 1.1, F.drift(X(0.7), -12, 50))
    L.at(8.5).do(flowers(X(0.2), X(0.4), X(0.6), X(0.8)))
    L.at(11).do(flock(18, 10, 90, sPath(PW + 60, 100, -80, 360, 0, 1)))
    L.at(14.5).radio('KESTREL', 'Halloran? ...Nothing. Static and birdsong.')
    L.at(16).do(flowers(X(0.12), X(0.88))).wave('garden_fruit', 1, 0, F.drift(X(0.5), 0, 45))
    L.at(18).do(flock(20, 11, 105, loopPath(X(0.5), 170, 220, -1)))
    L.at(25).gate(12)

    L.at(26.5).radio(V, 'they sing when you are near. they do not mean it unkindly.', 'odd')
    L.at(27.5).do(flowers(X(0.1), X(0.26), X(0.42), X(0.58), X(0.74), X(0.9)))
    L.at(31).do(flock(14, 9, 75, sPath(-60, 70, PW + 60, 430, 90, 1.5))).do(flock(14, 9, 75, sPath(PW + 60, 70, -60, 430, 90, 1.5)))
    L.at(35.5).do((w) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU
        w.spawn('garden_fruit', PW / 2 + Math.cos(a) * 100, -80 + Math.sin(a) * 40, { mover: new LineMover(0, 55) })
      }
    })
    L.at(37).radio(V, 'take them. they grow back.', 'odd')
    L.at(39.5).do(flowers(X(0.3), X(0.5), X(0.7))).do(flock(18, 10, 95, loopPath(X(0.5), 185, 210, 1)))
    L.at(46).gate(12)

    // murmuration: three flocks folding through each other
    L.at(47.5).radio(V, 'listen.', 'odd').intensity(3)
    L.at(48.5).do(flock(18, 12, 80, sPath(X(0.2), -60, X(0.8), PH + 60, 180, 2)))
    L.at(49.7).do(flock(18, 12, 80, sPath(X(0.8), -60, X(0.2), PH + 60, 180, 2)))
    L.at(51).do(flock(24, 12, 120, loopPath(X(0.5), 205, 240, -1)))
    L.at(53).do((w) => {
      w.spawn('garden_flower', X(0.5), -50, { mover: new GroundMover(), elite: true })
      w.spawn('garden_flower', X(0.15), -90, { mover: new GroundMover() })
      w.spawn('garden_flower', X(0.85), -90, { mover: new GroundMover() })
    })
    L.at(55.5).wave('garden_fruit', 4, 0.7, F.drift(X(0.3), 20, 50))
    L.at(60.5).gate(12)

    // the orchard: rich and quiet, then not quiet
    L.at(62).intensity(1).radio(V, 'this is the orchard. nothing here is afraid of you.', 'odd')
    L.at(63).wave('garden_fruit', 5, 0.8, F.drift(X(0.22), 6, 45)).wave('garden_fruit', 5, 0.8, F.drift(X(0.78), -6, 45))
    L.at(66.5).do(flowers(X(0.1), X(0.9)))
    L.at(69).intensity(2).do(flowers(X(0.28), X(0.5), X(0.72))).do(flock(16, 9, 80, sPath(-60, 135, PW + 60, 220, 60, 1)))
    L.at(72.5).do(flowers(X(0.4), X(0.6))).do(flock(16, 9, 80, sPath(PW + 60, 135, -60, 255, 60, 1)))
    L.at(77.5).gate(12)

    // the hedge: a wall of blooms, flocks pouring through its gaps
    L.at(79).intensity(3).radio(V, 'the hedge. it grew here for you.', 'odd')
    L.at(80).do(flowers(X(0.08), X(0.22), X(0.36), X(0.64), X(0.78), X(0.92)))
    L.at(82).do(flock(20, 11, 90, sPath(X(0.5), -60, X(0.5), PH + 80, 0, 1)))
    L.at(85).do(flock(14, 9, 70, sPath(-60, 90, PW + 60, 300, 70, 1))).do(flock(14, 9, 70, sPath(PW + 60, 90, -60, 300, 70, 1)))
    L.at(88).wave('garden_fruit', 3, 0.6, F.drift(X(0.5), 0, 50))
    L.at(89).do(flowers(X(0.3), X(0.5), X(0.7)))
    L.at(91).do(flock(22, 12, 110, loopPath(X(0.5), 190, 230, 1)))
    L.at(97).gate(12)

    L.at(99).intensity(1).scroll(12, 5).radio(V, 'the gardener is awake now. be polite.', 'odd')
    L.at(102.5).do((w) => spawnGardener(w))
    L.at(103.5).until('boss_dead')
    L.at(107.5).radio(V, 'go on, then. the door is behind you. it was always behind you.', 'odd')
    L.at(110.5).do(() => {})
  },
}
