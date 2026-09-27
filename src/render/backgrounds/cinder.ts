/** M1 — desert refinery planet in bright daylight. */
import { clamp, rng, smoothstep } from '../../core/math'
import {
  FH, FW, Fader, H, Scroller, TILE_H, W, blit, cMix, cMul, cOut, cSet, cached, cachedSeeded, canvas, cloudSprite, field,
  SeamNoise, FS, TileSet, grid, hash3, lut, slope, tileNoise, upscale, wrapX, wrapY, type Background, type Ctx, type Job,
} from './kit'
import { mesa, pebble } from './motifs'

const SAND = lut([[0, '#a8744a'], [0.35, '#c48f5c'], [0.7, '#d9aa72'], [1, '#e8c18c']])
const VARIANTS = 3

function* genTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const n = tileNoise(seed, v)
  const salt = new Float32Array(FW * FH), riv = new Float32Array(FW * FH)
  const hf = yield* grid(FW, FH, (x, y) => {
    const i = y * FW + x
    const macro = n.fbm(x, y, 128, 128, 3, 1)
    const wx = x + (n.fbm(x, y, 64, 64, 2, 2) - 0.5) * 80
    const dr = n.ridge(wx, y, 64, 16, 3, 3)
    const dune = dr * dr
    const dm = smoothstep(clamp((n.fbm(x, y, 128, 64, 2, 4) - 0.3) * 3, 0, 1))
    const s = smoothstep(clamp((n.fbm(x, y, 128, 128, 3, 5) - 0.6) * 12, 0, 1))
    const pres = smoothstep(clamp((n.fbm(x, y, 256, 256, 2, 9) - 0.45) * 5, 0, 1))
    const rv = Math.abs(n.fbm(x + (n.val(x, y, 32, 32, 6) - 0.5) * 30, y, 128, 128, 3, 7) - 0.5) + (1 - pres) * 0.2
    const r = 1 - smoothstep(clamp((rv - 0.012) / 0.03, 0, 1))
    salt[i] = s
    riv[i] = r * (1 - s)
    let h = macro * 0.5 + dune * dm * 0.38 + n.fbm(x, y, 16, 16, 2, 8) * 0.06
    h = h + (0.22 - h) * s * 0.92
    h -= r * 0.12 + (1 - smoothstep(clamp((rv - 0.03) / 0.05, 0, 1))) * 0.05
    return h
  })
  const low = yield* field(FW, FH, (x, y, o, i) => {
    const k = y * FW + x
    const h = hf[k]
    const sl = slope(hf, FW, FH, x, y) * 11
    cSet(SAND, (h - 0.15) / 0.65)
    // salt flat: pale crust with polygonal cracks
    const s = salt[k]
    if (s > 0) {
      const cr = n.ridge(x, y, 12, 8, 2, 20)
      cMix(233, 224, 204, s * 0.85)
      cMix(160, 130, 110, s * smoothstep(clamp((cr - 0.86) * 8, 0, 1)) * 0.6)
    }
    const r = riv[k]
    if (r > 0) {
      // cracked mud floor with pale sand bars along the channel
      cMix(150, 112, 84, r * 0.7)
      cMix(222, 196, 156, r * smoothstep(clamp((n.val(x, y, 6, 16, 12) - 0.62) * 5, 0, 1)) * 0.6)
      if (hash3(x, y, 99) > 0.86) cMix(96, 70, 54, r * 0.45)
    }
    // hillshade: warm light, cool violet shadow
    if (sl > 0) cMix(255, 236, 200, clamp(sl, 0, 1) * 0.45)
    else cMix(110, 78, 92, clamp(-sl, 0, 1) * 0.55)
    cMul(0.97 + hash3(x, y, 7) * 0.06)
    cOut(o, i)
  })
  const [c, ctx] = upscale(low, W, TILE_H)
  const r = rng(hashSeed(seed, v))
  road(ctx, n)
  // tyre tracks from refinery traffic
  for (let t = 0; t < 2; t++) tracks(ctx, r.range(60, W - 60), r.range(140, TILE_H - 500), r.next() * 1e4)
  // scrub and scattered rocks
  for (let i = 0; i < 70; i++) {
    const cxs = r.range(0, W), cys = r.range(20, TILE_H - 20)
    const x = cxs + r.range(-10, 10), y = cys + r.range(-8, 8)
    const s = r.range(1.2, 3)
    ctx.fillStyle = 'rgba(80,50,40,0.22)'
    ctx.beginPath(); ctx.ellipse(x + s * 0.6, y + s * 0.8, s, s * 0.8, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = r.chance(0.5) ? '#8a7a4c' : '#76704a'
    ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 40; i++) pebble(ctx, r.range(0, W), r.range(12, TILE_H - 12), r.range(2, 5), r.int(1, 1e6))
  // mesas (kept off the seams)
  const m = r.int(1, 2)
  for (let i = 0; i < m; i++) {
    const rx = r.range(45, 80)
    mesa(ctx, r.range(60, W - 60), 180 + ((TILE_H - 420) * (i + r.next())) / m, rx, rx * r.range(0.6, 0.9), r.int(1, 1e6))
  }
  return c
}

/** Graded haul road; its x at the seams comes from seam lattice rows so it joins across tiles. */
function road(ctx: Ctx, n: SeamNoise) {
  const pts: [number, number, number][] = []
  for (let y = -8; y <= TILE_H + 8; y += 8) {
    const fy = y / FS
    const x = W * 0.15 + n.fbm(3.5, fy, 1, 128, 2, 50) * W * 0.7
    const on = smoothstep(clamp((n.val(3.5, fy, 1, 256, 51) - 0.35) * 5, 0, 1))
    pts.push([x, y, on])
  }
  ctx.save()
  const seg = (w: number, style: string, dash: number[] = [], off = 0) => {
    ctx.lineWidth = w
    ctx.setLineDash(dash)
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, a] = pts[i], [x1, y1] = pts[i + 1]
      if (a < 0.02) continue
      ctx.globalAlpha = a
      ctx.strokeStyle = style
      ctx.beginPath(); ctx.moveTo(x0 + off, y0); ctx.lineTo(x1 + off, y1); ctx.stroke()
    }
  }
  seg(16, 'rgba(120,80,56,0.18)')
  seg(11, 'rgba(226,196,150,0.55)')
  seg(1.4, 'rgba(110,70,48,0.35)', [3, 3], -3)
  seg(1.4, 'rgba(110,70,48,0.35)', [3, 3], 3)
  ctx.restore()
}

const hashSeed = (a: number, b: number) => (hash3(a, b, 31) * 1e9) | 0

function tracks(ctx: Ctx, x: number, y: number, seed: number) {
  const r = rng(seed)
  let a = Math.PI / 2 + r.range(-0.6, 0.6)
  const pts: [number, number][] = []
  for (let i = 0; i < 90; i++) {
    pts.push([x, y])
    a += r.range(-0.08, 0.08)
    x += Math.cos(a) * 4
    y += Math.sin(a) * 4
  }
  ctx.save()
  ctx.setLineDash([2, 2.5])
  ctx.lineWidth = 1.4
  ctx.strokeStyle = 'rgba(96,60,40,0.28)'
  for (const off of [-3.5, 3.5]) {
    ctx.beginPath()
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1]
      const l = Math.hypot(x1 - x0, y1 - y0) || 1
      const nx = (-(y1 - y0) / l) * off, ny = ((x1 - x0) / l) * off
      if (i === 0) ctx.moveTo(x0 + nx, y0 + ny)
      else ctx.lineTo(x0 + nx, y0 + ny)
    }
    ctx.stroke()
  }
  ctx.restore()
}

function devilSprite() {
  const [c, x] = canvas(110, 110)
  const r = rng(77)
  for (let i = 0; i < 520; i++) {
    const t = r.next()
    const a = t * 14 + r.range(-0.3, 0.3)
    const d = 4 + t * 48 + r.range(-4, 4)
    x.fillStyle = `rgba(236,208,160,${(1 - t) * 0.22})`
    const s = 1 + (1 - t) * 3
    x.beginPath(); x.arc(55 + Math.cos(a) * d, 55 + Math.sin(a) * d * 0.9, s, 0, Math.PI * 2); x.fill()
  }
  const g = x.createRadialGradient(55, 55, 0, 55, 55, 22)
  g.addColorStop(0, 'rgba(240,215,170,0.4)')
  g.addColorStop(1, 'rgba(240,215,170,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 110, 110)
  return c
}

interface Devil { x: number; y: number; vx: number; age: number; life: number; rot: number; s: number }
interface Streak { x: number; y: number; l: number; a: number; v: number }

export function createCinder(seed = 1): Background {
  const tiles = cachedSeeded(`cinder|${seed}`, () => new TileSet(VARIANTS, v => genTile(seed, v)))
  const shadows = cached('cinder|shadows', () => [0, 1, 2].map(i => cloudSprite(360, 240, 400 + i, '#4a2a2a', 0.42, 3.5)))
  const devil = cached('cinder|devil', devilSprite)
  const ground = new Scroller(tiles, seed)
  const r = rng(seed * 13 + 5)
  const dusk = new Fader(0, 2.5)
  let t = 0
  const cs = shadows.map((img, i) => ({ img, x: r.range(0, W), y: i * 330, s: r.range(1.1, 1.6) }))
  const devils: Devil[] = []
  let nextDevil = 3
  const streaks: Streak[] = Array.from({ length: 14 }, () => ({ x: r.range(0, W), y: r.range(0, H), l: r.range(40, 140), a: r.range(0.04, 0.09), v: r.range(160, 260) }))

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      dusk.step(dt)
      for (const c of cs) {
        c.y += scroll * dt + 6 * dt
        c.x += 10 * dt
        if (c.y - 200 > H) { c.y -= H + 600; c.x = r.range(0, W) }
      }
      nextDevil -= dt
      if (nextDevil <= 0 && devils.length < 2) {
        devils.push({ x: r.range(40, W - 40), y: r.range(-40, H * 0.4), vx: r.range(-18, 18), age: 0, life: r.range(7, 11), rot: 0, s: r.range(0.7, 1.1) })
        nextDevil = r.range(5, 11)
      }
      for (let i = devils.length - 1; i >= 0; i--) {
        const d = devils[i]
        d.age += dt
        d.y += scroll * dt + 8 * dt
        d.x += d.vx * dt + Math.sin(t * 1.7 + i) * 12 * dt
        d.rot -= dt * 5
        if (d.age > d.life || d.y > H + 80) devils.splice(i, 1)
      }
      for (const s of streaks) {
        s.x += s.v * dt
        s.y += scroll * 1.3 * dt
        if (s.x - s.l > W) { s.x = -s.l - r.range(0, 200); s.y = r.range(0, H) }
        s.y = wrapY(s.y, 10)
      }
    },
    drawBase(ctx) {
      ground.draw(ctx)
      // heat shimmer: re-blit thin ground strips with a travelling horizontal wobble
      const band = wrapY(H - ((t * 40) % (H + 300)), 150)
      for (let i = 0; i < 18; i++) {
        const y = band + i * 5
        const dx = Math.sin(t * 7 + i * 0.9) * 1.3 * Math.sin((i / 18) * Math.PI)
        ground.strip(ctx, y, 5, dx)
      }
      for (const c of cs) blit(ctx, c.img, c.x, c.y, 0, c.s, 0.35 + dusk.e * 0.15)
      const d = dusk.e
      if (d > 0) {
        ctx.save()
        ctx.globalCompositeOperation = 'multiply'
        const g = ctx.createLinearGradient(0, 0, W, H)
        g.addColorStop(0, `rgba(255,170,110,${d * 0.45})`)
        g.addColorStop(1, `rgba(170,80,90,${d * 0.6})`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'screen'
        const s = ctx.createRadialGradient(0, 0, 0, 0, 0, W * 1.1)
        s.addColorStop(0, `rgba(255,140,60,${d * 0.25})`)
        s.addColorStop(1, 'rgba(255,140,60,0)')
        ctx.fillStyle = s
        ctx.fillRect(0, 0, W, H)
        ctx.restore()
      }
    },
    drawOver(ctx) {
      ctx.save()
      // rising heat haze bands
      for (let i = 0; i < 3; i++) {
        const y = wrapY(H - ((t * 14 + i * 260) % (H + 200)), 100)
        const g = ctx.createLinearGradient(0, y - 60, 0, y + 60)
        g.addColorStop(0, 'rgba(255,238,210,0)')
        g.addColorStop(0.5, `rgba(255,238,210,${0.07 - dusk.e * 0.03})`)
        g.addColorStop(1, 'rgba(255,238,210,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, y - 60, W, 120)
      }
      ctx.lineWidth = 1
      for (const s of streaks) {
        ctx.strokeStyle = `rgba(240,214,170,${s.a})`
        ctx.beginPath(); ctx.moveTo(s.x - s.l, s.y); ctx.lineTo(s.x, s.y + s.l * 0.08); ctx.stroke()
      }
      for (const d of devils) {
        const f = Math.min(1, d.age / 1.5, (d.life - d.age) / 1.5)
        blit(ctx, devil, wrapX(d.x, 60), d.y, d.rot, d.s, 0.55 * f)
        blit(ctx, devil, d.x + 6, d.y - 14, d.rot * 1.3, d.s * 0.7, 0.35 * f)
      }
      if (dusk.e > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, H * 0.5)
        g.addColorStop(0, `rgba(255,120,60,${dusk.e * 0.12})`)
        g.addColorStop(1, 'rgba(255,120,60,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H * 0.5)
      }
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'dusk') dusk.t = 1
      else if (name === 'day' || name === 'noon') dusk.t = 0
    },
  }
}
