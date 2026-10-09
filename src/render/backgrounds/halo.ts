/** M5 — orbital shipyard: a vast station hull over a planet far below. */
import { clamp, rng } from '../../core/math'
import {
  Fader, H, Scroller, SeamNoise, TILE_H, TileSet, W, cachedSeeded, canvas, field, lut, softDot,
  starTile, type Background, type Ctx, type Job, fillFrame } from './kit'
import { Parallax, nebulaTile } from './space'

const PLANET = lut([[0, '#0c2238'], [0.45, '#17405e'], [0.7, '#2c6680'], [1, '#6f9fb2']])
/** Hull edges at every tile seam, so any variant can follow any other. */
const SEAM_L = 70, SEAM_R = W - 70

type Rect = [number, number, number, number]

function bevelRect(x: Ctx, [rx, ry, rw, rh]: Rect, fill: string, hi = 'rgba(255,255,255,0.55)', lo = 'rgba(40,46,60,0.55)') {
  x.fillStyle = fill
  x.fillRect(rx, ry, rw, rh)
  x.fillStyle = hi
  x.fillRect(rx, ry, rw, 1)
  x.fillRect(rx, ry, 1, rh)
  x.fillStyle = lo
  x.fillRect(rx, ry + rh - 1, rw, 1)
  x.fillRect(rx + rw - 1, ry, 1, rh)
}

/** Layers packed side by side: [hull | running lights A | running lights B]. */
function* hullTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const [c, x] = canvas(W * 3, TILE_H)
  const r = rng(seed * 77 + v * 13 + 1)
  const lights: [number, number, number][] = [] // x, y, group
  // split the tile into segments; each is a wide module or a narrow truss spine
  const segs: { y0: number; y1: number; l: number; r: number; truss: boolean }[] = []
  let y = 0
  while (y < TILE_H) {
    const h = Math.min(TILE_H - y, r.range(150, 320))
    const first = y === 0, last = y + h >= TILE_H - 60
    const hh = last ? TILE_H - y : h
    const truss = !first && !last && r.chance(0.3)
    const l = first || last ? SEAM_L : truss ? 200 : r.range(20, 120)
    const rr = first || last ? SEAM_R : truss ? W - 200 : W - r.range(20, 120)
    segs.push({ y0: y, y1: y + hh, l, r: rr, truss })
    y += hh
  }
  // shadow cast by the hull onto the void (reads as height above the planet)
  x.fillStyle = 'rgba(0,6,16,0.45)'
  for (const s of segs) x.fillRect(s.l + 14, s.y0 + 18, s.r - s.l, s.y1 - s.y0)
  for (const s of segs) {
    if (s.truss) {
      // open lattice spine
      const cx = (s.l + s.r) / 2
      for (const ox of [-60, 60]) bevelRect(x, [cx + ox - 8, s.y0, 16, s.y1 - s.y0], '#8d94a0')
      x.strokeStyle = '#7a818d'
      x.lineWidth = 5
      for (let yy = s.y0; yy < s.y1 - 10; yy += 40) {
        x.beginPath(); x.moveTo(cx - 60, yy); x.lineTo(cx + 60, yy + 40); x.moveTo(cx + 60, yy); x.lineTo(cx - 60, yy + 40); x.stroke()
        bevelRect(x, [cx - 60, yy, 120, 6], '#a3aab5')
      }
      bevelRect(x, [cx - 14, s.y0, 28, s.y1 - s.y0], '#b3b9c3')
      for (let yy = s.y0 + 20; yy < s.y1; yy += 60) lights.push([cx + 60, yy, 0], [cx - 60, yy + 30, 1])
      continue
    }
    // base plate
    bevelRect(x, [s.l, s.y0, s.r - s.l, s.y1 - s.y0], '#a6acb6')
    // panel grid with per-panel tone
    for (let py = s.y0; py < s.y1; ) {
      const ph = Math.min(s.y1 - py, r.pick([24, 32, 48]))
      for (let px = s.l; px < s.r; ) {
        const pw = Math.min(s.r - px, r.pick([28, 36, 44, 60]))
        const tone = 160 + r.int(-10, 12)
        bevelRect(x, [px, py, pw, ph], `rgb(${tone},${tone + 5},${tone + 13})`, 'rgba(255,255,255,0.35)', 'rgba(60,66,80,0.4)')
        if (r.chance(0.12)) {
          x.fillStyle = 'rgba(80,86,100,0.5)'
          for (const [ax, ay] of [[3, 3], [pw - 4, 3], [3, ph - 4], [pw - 4, ph - 4]]) x.fillRect(px + ax, py + ay, 1.5, 1.5)
        }
        px += pw
      }
      py += ph
    }
    // painted livery bands and sector blocks
    if (r.chance(0.5)) {
      const col = r.pick(['rgba(70,140,150,0.45)', 'rgba(190,110,70,0.4)'])
      const by = r.range(s.y0 + 10, s.y1 - 30)
      x.fillStyle = col
      x.fillRect(s.l, by, s.r - s.l, 5)
      x.fillRect(s.l, by + 9, s.r - s.l, 2)
      for (let k = 0; k < 3; k++) x.fillRect(s.l + 14 + k * 9, by + 16, 6, 10)
    }
    // chamfered step where this module meets its neighbour
    x.fillStyle = 'rgba(40,46,60,0.35)'
    x.fillRect(s.l, s.y1 - 3, s.r - s.l, 3)
    // features
    const span = s.r - s.l
    const trench = r.chance(0.6)
    if (trench) {
      const tw = r.range(36, 56), tx = s.l + r.range(0.3, 0.6) * span
      x.fillStyle = '#5d646f'
      x.fillRect(tx, s.y0, tw, s.y1 - s.y0)
      x.fillStyle = 'rgba(20,24,32,0.5)'
      x.fillRect(tx, s.y0, 6, s.y1 - s.y0)
      for (let k = 0; k < 3; k++) {
        const px = tx + 10 + k * ((tw - 16) / 3)
        x.fillStyle = '#8a919c'
        x.fillRect(px, s.y0, 5, s.y1 - s.y0)
        x.fillStyle = 'rgba(255,255,255,0.35)'
        x.fillRect(px, s.y0, 1.5, s.y1 - s.y0)
      }
      for (let yy = s.y0 + 12; yy < s.y1; yy += 26) bevelRect(x, [tx, yy, tw, 4], '#767d88')
      x.fillStyle = 'rgba(255,255,255,0.5)'
      x.fillRect(tx + tw, s.y0, 1, s.y1 - s.y0)
    }
    // superstructure blocks with cast shadows
    const nb = r.int(1, 3)
    for (let b = 0; b < nb; b++) {
      const bw = r.range(40, 110), bh = r.range(30, Math.min(120, s.y1 - s.y0 - 30))
      const bx = s.l + r.range(10, span - bw - 10), by = r.range(s.y0 + 12, s.y1 - bh - 12)
      x.fillStyle = 'rgba(30,36,50,0.35)'
      x.fillRect(bx + 8, by + 10, bw, bh)
      bevelRect(x, [bx, by, bw, bh], '#bcc2cb', 'rgba(255,255,255,0.8)', 'rgba(50,56,70,0.6)')
      x.fillStyle = 'rgba(255,255,255,0.12)'
      x.fillRect(bx + 4, by + 4, bw - 8, bh * 0.4)
      if (r.chance(0.6)) {
        // window rows
        for (let wy = by + 8; wy < by + bh - 6; wy += 9)
          for (let wx = bx + 6; wx < bx + bw - 6; wx += 7) {
            x.fillStyle = r.chance(0.7) ? 'rgba(255,226,170,0.55)' : 'rgba(40,50,64,0.6)'
            x.fillRect(wx, wy, 3, 4)
          }
      } else {
        x.fillStyle = '#a2a9b4'
        x.beginPath(); x.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.3, 0, Math.PI * 2); x.fill()
        x.strokeStyle = 'rgba(255,255,255,0.5)'
        x.lineWidth = 1.5
        x.beginPath(); x.arc(bx + bw / 2, by + bh / 2, Math.min(bw, bh) * 0.3, Math.PI * 0.9, Math.PI * 1.6); x.stroke()
      }
    }
    // docking bay
    if (r.chance(0.5) && s.y1 - s.y0 > 140) {
      const dw = r.range(70, 100), dh = r.range(50, 70)
      const left = r.chance(0.5)
      const dx = left ? s.l : s.r - dw, dy = r.range(s.y0 + 20, s.y1 - dh - 20)
      x.fillStyle = '#b8a45c'
      x.fillRect(dx - 4, dy - 4, dw + 8, dh + 8)
      x.save()
      x.beginPath(); x.rect(dx - 4, dy - 4, dw + 8, dh + 8); x.clip()
      x.strokeStyle = '#3a3a40'
      x.lineWidth = 4
      for (let k = -dh; k < dw + dh; k += 12) { x.beginPath(); x.moveTo(dx + k, dy - 6); x.lineTo(dx + k - dh - 10, dy + dh + 6); x.stroke() }
      x.restore()
      const g = x.createLinearGradient(dx, dy, dx, dy + dh)
      g.addColorStop(0, '#12161e')
      g.addColorStop(1, '#262c38')
      x.fillStyle = g
      x.fillRect(dx, dy, dw, dh)
      for (let k = 0; k < 4; k++) lights.push([dx + 6 + k * ((dw - 12) / 3), dy + dh - 5, 2])
    }
    // vents and hatches
    for (let k = 0; k < r.int(2, 6); k++) {
      const vx = s.l + r.range(10, span - 40), vy = r.range(s.y0 + 8, s.y1 - 20)
      x.fillStyle = '#6f7682'
      x.fillRect(vx, vy, 26, 10)
      x.fillStyle = '#3c424c'
      for (let g = 0; g < 5; g++) x.fillRect(vx + 2 + g * 5, vy + 2, 3, 6)
    }
    // running lights along the rims
    for (let yy = s.y0 + 16; yy < s.y1 - 8; yy += 48) lights.push([s.l + 4, yy, 0], [s.r - 4, yy + 24, 1])
  }
  yield
  // weathering: soft grime multiplied onto the hull only
  const n = new SeamNoise(TILE_H / 4, seed * 3 + v, seed * 3 + 99)
  const grime = yield* field(W / 4, TILE_H / 4, (gx, gy, o, i) => {
    const g = n.fbm(gx, gy, 32, 32, 4, 1)
    const streak = n.fbm(gx, gy, 4, 64, 2, 2)
    const k = 255 - clamp((g - 0.45) * 160 + (streak - 0.5) * 40, 0, 70)
    o[i] = k; o[i + 1] = k; o[i + 2] = k + 4
  })
  const [gm, gx] = canvas(W, TILE_H)
  gx.drawImage(grime, 0, 0, W, TILE_H)
  gx.globalCompositeOperation = 'destination-in' // grime must not tint the void
  gx.drawImage(c, 0, 0, W, TILE_H, 0, 0, W, TILE_H)
  x.globalCompositeOperation = 'multiply'
  x.drawImage(gm, 0, 0)
  x.globalCompositeOperation = 'source-over'
  // light layers
  const dot = softDot(10, '#7fe0c0', 0.2), red = softDot(10, '#e0645a', 0.2), warm = softDot(10, '#d8c090', 0.2)
  for (const [lx, ly, g] of lights) {
    const img = g === 2 ? warm : g === 0 ? red : dot
    const layer = g === 1 ? 2 : 1
    x.drawImage(img, W * layer + lx - 5, ly - 5)
  }
  return c
}

/** Planet surface seen through the gaps, with a curved limb and atmosphere. */
function planetLimb() {
  const [c, x] = canvas(W, H)
  const cx = -W * 1.1, cy = H * 0.55, R = W * 1.75
  const g = x.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.06)
  g.addColorStop(0, 'rgba(120,200,255,0)')
  g.addColorStop(0.5, 'rgba(120,200,255,0)')
  g.addColorStop(0.85, 'rgba(150,215,255,0.5)')
  g.addColorStop(0.9, 'rgba(90,150,220,0.25)')
  g.addColorStop(1, 'rgba(40,80,160,0)')
  x.fillStyle = g
  x.fillRect(0, 0, W, H)
  return c
}

interface Girder { y: number; kind: number }

export function createHalo(seed = 1): Background {
  const tex = cachedSeeded(`halo|tex|${seed}`, () => ({
    planet: nebulaTile(seed * 5 + 2, { base: PLANET, gas: [210, 225, 235], lane: [10, 30, 50], gasAmt: 0.6, laneAmt: 0.4 }),
    stars: starTile(W, 900, seed + 40, 160, ['#dfe8ff', '#ffffff'], 0.4, 1.2, 0.3, 0.8),
    limb: planetLimb(),
    pool: softDot(128, '#ffb060', 0),
  }))
  const tiles = cachedSeeded(`halo|${seed}`, () => new TileSet(3, v => hullTile(seed, v)))
  const ground = new Scroller(tiles, seed)
  const planet = new Parallax(tex.planet, 0.12, 4)
  const stars = new Parallax(tex.stars, 0.05, 2)
  const interior = new Fader(0, 2.5)
  let t = 0
  const girders: Girder[] = [0, 1, 2].map(i => ({ y: -i * 320, kind: i % 2 }))

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      planet.update(dt, scroll)
      stars.update(dt, scroll)
      interior.step(dt)
      for (const g of girders) {
        g.y += (scroll * 1.8 + 30) * dt
        if (g.y > H + 60) g.y -= 960
      }
    },
    drawBase(ctx) {
      ctx.save()
      const it = interior.e
      // far: planet below, its limb curving away into space on the right
      ctx.fillStyle = '#05070f'
      fillFrame(ctx)
      stars.draw(ctx, 0.8)
      ctx.save()
      ctx.beginPath()
      ctx.arc(-W * 1.1, H * 0.55, W * 1.75 * 0.965, 0, Math.PI * 2)
      ctx.clip()
      planet.draw(ctx)
      const shade = ctx.createLinearGradient(0, 0, W, 0)
      shade.addColorStop(0, 'rgba(0,0,0,0)')
      shade.addColorStop(1, 'rgba(0,8,20,0.55)')
      ctx.fillStyle = shade
      fillFrame(ctx)
      ctx.restore()
      ctx.drawImage(tex.limb, 0, 0)
      ground.draw(ctx)
      // running lights: two alternating groups, docking lights steady
      ctx.globalCompositeOperation = 'lighter'
      const a = Math.sin(t * 3.2) > 0.3 ? 0.7 : 0.2
      const b = Math.sin(t * 3.2 + 2.5) > 0.3 ? 0.7 : 0.2
      ctx.globalAlpha = a
      ground.draw(ctx, 0, 0, W)
      ctx.globalAlpha = b
      ground.draw(ctx, 0, 0, W * 2)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      if (it > 0) {
        // enclosed dock: dim everything, warm sodium pools, dark side walls
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = `rgba(70,62,78,${it * 0.8})`
        fillFrame(ctx)
        ctx.globalCompositeOperation = 'lighter'
        const off = (ground.pos * 1.0) % 240
        for (let y = -240 + off; y < H + 120; y += 240)
          for (const x of [W * 0.25, W * 0.75]) {
            ctx.globalAlpha = it * 0.22
            ctx.drawImage(tex.pool, x - 150, y - 110, 300, 220)
          }
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        for (const side of [0, 1]) {
          const g = ctx.createLinearGradient(side ? W : 0, 0, side ? W - 60 : 60, 0)
          g.addColorStop(0, `rgba(12,10,16,${it * 0.9})`)
          g.addColorStop(1, 'rgba(12,10,16,0)')
          ctx.fillStyle = g
          ctx.fillRect(side ? W - 60 : 0, 0, 60, H)
        }
      }
      ctx.restore()
    },
    drawOver(ctx) {
      const it = interior.e
      if (it <= 0.01) return
      ctx.save()
      ctx.globalAlpha = it
      for (const g of girders) {
        const y = g.y
        // overhead girder silhouette, warm rim from the dock lights below
        ctx.fillStyle = 'rgba(18,16,22,0.85)'
        ctx.fillRect(0, y, W, 16)
        ctx.fillStyle = 'rgba(255,170,90,0.35)'
        ctx.fillRect(0, y + 15, W, 1.5)
        ctx.fillStyle = 'rgba(18,16,22,0.85)'
        for (let x = 0; x < W; x += 56) {
          ctx.beginPath(); ctx.moveTo(x, y + 16); ctx.lineTo(x + 28, y + 16); ctx.lineTo(x + 14, y + 30); ctx.closePath(); ctx.fill()
        }
        if (g.kind === 1) {
          ctx.fillRect(0, y - 26, W, 6)
          ctx.fillStyle = 'rgba(255,190,120,0.5)'
          for (let x = 30; x < W; x += 120) ctx.fillRect(x, y + 6, 10, 3)
        }
      }
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'interior') interior.t = 1
      else if (name === 'exterior') interior.t = 0
    },
  }
}

