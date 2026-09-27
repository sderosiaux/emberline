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
  [lerp(x0, x1, u) + Math.sin(u * Math.PI * 2 * waves) * amp, lerp(y0, y1, u) + Math.sin(u * Math.PI) * 60]
const loopPath = (cx: number, cy: number, r: number, from: -1 | 1) => (u: number): [number, number] => {
  const a = from < 0 ? Math.PI + u * TAU * 1.1 : -u * TAU * 1.1
  const k = Math.min(1, u * 4)
  return [cx + Math.cos(a) * r * k + (1 - k) * (from < 0 ? -140 : 140), cy + Math.sin(a) * r * 0.6 + u * 260 - (1 - k) * 60]
}

registerEnemy({
  id: 'garden_songbird', hp: 22, r: 10, sprite: 'garden_songbird', layer: 'air', score: 80, credits: 10, charge: 2, explode: 'small', contact: 15,
  init(e) { e.s.f = rand(1.5, 5) },
  update(e, w, dt) {
    if (e.s.orbit) {
      // Gardener's own flock: circle it, widening, then glide down past you
      const root = e.data as Enemy | null
      e.s.oa += dt * 1.3
      e.s.or = Math.min(170, (e.s.or ?? 60) + dt * 30)
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
    const k = open ? 1 : Math.max(0.25, 1 - e.s.t / 2)
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
    L.at(0.5).radio(V, 'you are not supposed to be here.', 'odd')
    L.at(3).radio(V, 'stay a while.', 'odd')
    L.at(4).do(flock(12, 9, 60, sPath(PW * 0.5, -60, PW * 0.2, PH + 80, 140, 1)))
    L.at(8).wave('garden_fruit', 2, 1.4, F.drift(PW * 0.7, -10, 50))
    L.at(10).do(flowers(140, 280, 420))
    L.at(13).do(flock(14, 10, 70, sPath(PW + 60, 120, -80, 420, 0, 1)))
    L.at(17).radio('KESTREL', 'Halloran? ...Nothing. Static and birdsong.')
    L.at(19).do(flowers(90, 470)).wave('garden_fruit', 1, 0, F.drift(PW / 2, 0, 45))
    L.at(22).do(flock(16, 11, 80, loopPath(PW / 2, 200, 160, -1)))
    L.at(30).gate()

    L.at(32).radio(V, 'they sing when you are near. they do not mean it unkindly.', 'odd')
    L.at(33).do(flowers(80, 180, 280, 380, 480))
    L.at(37).do(flock(10, 9, 55, sPath(-60, 80, PW + 60, 500, 60, 1.5))).do(flock(10, 9, 55, sPath(PW + 60, 80, -60, 500, 60, 1.5)))
    L.at(42).do((w) => {
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU
        w.spawn('garden_fruit', PW / 2 + Math.cos(a) * 70, -80 + Math.sin(a) * 40, { mover: new LineMover(0, 55) })
      }
    })
    L.at(44).radio(V, 'take them. they grow back.', 'odd')
    L.at(47).do(flowers(200, 360)).do(flock(14, 10, 70, loopPath(PW / 2, 220, 150, 1)))
    L.at(55).gate()

    // murmuration: three flocks folding through each other
    L.at(57).radio(V, 'listen.', 'odd').intensity(3)
    L.at(58).do(flock(14, 12, 60, sPath(PW * 0.2, -60, PW * 0.8, PH + 60, 120, 2)))
    L.at(59.5).do(flock(14, 12, 60, sPath(PW * 0.8, -60, PW * 0.2, PH + 60, 120, 2)))
    L.at(61).do(flock(18, 12, 90, loopPath(PW / 2, 240, 170, -1)))
    L.at(63).do((w) => { w.spawn('garden_flower', PW / 2, -50, { mover: new GroundMover(), elite: true }) })
    L.at(66).wave('garden_fruit', 3, 0.8, F.drift(PW * 0.3, 15, 50))
    L.at(72).gate()

    // the orchard: rich and quiet, then not quiet
    L.at(74).intensity(1).radio(V, 'this is the orchard. nothing here is afraid of you.', 'odd')
    L.at(75).wave('garden_fruit', 4, 0.9, F.drift(PW * 0.25, 5, 45)).wave('garden_fruit', 4, 0.9, F.drift(PW * 0.75, -5, 45))
    L.at(79).do(flowers(60, 500))
    L.at(82).intensity(2).do(flowers(160, 400)).do(flock(12, 9, 60, sPath(-60, 160, PW + 60, 260, 40, 1)))
    L.at(86).do(flowers(280)).do(flock(12, 9, 60, sPath(PW + 60, 160, -60, 300, 40, 1)))
    L.at(92).gate()

    L.at(94).intensity(1).scroll(12, 5).radio(V, 'the gardener is awake now. be polite.', 'odd')
    L.at(98).do((w) => spawnGardener(w))
    L.at(99).until('boss_dead')
    L.at(103).radio(V, 'go on, then. the door is behind you. it was always behind you.', 'odd')
    L.at(106).do(() => {})
  },
}
