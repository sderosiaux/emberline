/** M2 — ocean world: turquoise shallows over deep teal, reefs, sandbars, fog. */
import { clamp, rng, smoothstep } from '../../core/math'
import {
  FH, FS, FW, Fader, H, Scroller, TILE_H, TileSet, W, blit, cMix, cMul, cOut, cSet, cached, cachedSeeded, canvas, cloudSprite,
  drain, field, grid, hash3, lut, slope, tile2, tileNoise, upscale, wrapX, type Background, type Job,
} from './kit'
import { pebble } from './motifs'

const WATER = lut([
  [0, '#08394a'], [0.3, '#0b5363'], [0.46, '#107482'], [0.56, '#1d9a9f'],
  [0.63, '#3dbdb2'], [0.69, '#7ad6c6'], [0.72, '#b9e6d4'],
])
const SAND = lut([[0, '#d8c595'], [1, '#efe1b8']])
const VARIANTS = 3
const SHORE = 0.715

/** Packs three W-wide layers: [water+land | surf A | surf B]. Surf layers crossfade to animate the shoreline. */
function* genTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const n = tileNoise(seed, v)
  const reef = new Float32Array(FW * FH)
  const hf = yield* grid(FW, FH, (x, y) => {
    const wx = x + (n.fbm(x, y, 64, 64, 2, 3) - 0.5) * 50
    let d = n.fbm(wx, y, 128, 128, 4, 1) * 0.85 + n.fbm(x, y, 256, 256, 2, 2) * 0.3 - 0.08
    // sandbars: long ridged shoals
    const bar = n.ridge(wx, y, 96, 32, 3, 4)
    d += Math.max(0, bar - 0.84) * 0.6 * smoothstep(clamp((d - 0.4) * 5, 0, 1))
    reef[y * FW + x] = smoothstep(clamp((n.fbm(x, y, 32, 32, 3, 5) - 0.5) * 6, 0, 1)) * smoothstep(clamp((d - 0.52) * 10, 0, 1))
    return d
  })
  const low = yield* field(FW, FH, (x, y, o, i) => {
    const k = y * FW + x
    const d = hf[k]
    const sl = slope(hf, FW, FH, x, y) * 14
    if (d > SHORE) {
      cSet(SAND, (d - SHORE) * 6 + hash3(x, y, 3) * 0.2)
      cMix(160, 150, 120, smoothstep(clamp((SHORE + 0.012 - d) * 80, 0, 1)) * 0.5) // wet sand rim
      if (sl > 0) cMix(255, 250, 230, clamp(sl * 1.4, 0, 1) * 0.5)
      else cMix(150, 130, 100, clamp(-sl * 1.4, 0, 1) * 0.5)
    } else {
      cSet(WATER, d)
      // submerged relief reads through clear water
      const depthVis = smoothstep(clamp((d - 0.4) * 4, 0, 1))
      if (sl > 0) cMix(210, 255, 240, clamp(sl, 0, 1) * 0.35 * depthVis)
      else cMix(8, 60, 70, clamp(-sl, 0, 1) * 0.4 * depthVis)
      const r = reef[k]
      if (r > 0) {
        const cn = n.fbm(x, y, 6, 4, 2, 9)
        cMix(66, 128, 110, r * 0.5)
        cMix(150, 110, 110, r * smoothstep(clamp((cn - 0.55) * 6, 0, 1)) * 0.45)
        cMix(30, 80, 80, r * smoothstep(clamp((0.4 - cn) * 6, 0, 1)) * 0.5)
      }
      // wind streaks on the surface
      cMix(200, 240, 235, (n.val(x, y, 48, 2, 7) - 0.5) * 0.12)
    }
    cMul(0.985 + hash3(x, y, 5) * 0.03)
    cOut(o, i)
  })
  const [c, ctx] = canvas(W * 3, TILE_H)
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(upscale(low, W, TILE_H)[0], 0, 0)
  // surf rings at two phases (packed into layers 1 and 2)
  for (let layer = 1; layer <= 2; layer++) {
    const off = layer === 1 ? 0.004 : 0.014
    const surf = yield* field(FW, FH, (x, y, o, i) => {
      const d = hf[y * FW + x]
      const e = Math.abs(d - (SHORE - off))
      const a = clamp(1 - e / 0.004, 0, 1) * (0.6 + n.val(x, y, 4, 4, 20 + layer) * 0.4)
      const edge = clamp(1 - Math.abs(d - SHORE) / 0.003, 0, 1)
      o[i] = 240; o[i + 1] = 252; o[i + 2] = 248; o[i + 3] = Math.max(a * 200, edge * 150)
    })
    ctx.drawImage(surf, W * layer, 0, W, TILE_H)
  }
  // beach debris and drift rocks on land
  const r = rng(hashSeed(seed, v))
  for (let i = 0; i < 400; i++) {
    const x = r.range(0, W), y = r.range(8, TILE_H - 8)
    const d = hf[Math.min(FH - 1, (y / FS) | 0) * FW + ((x / FS) | 0)]
    if (d > SHORE + 0.02) pebble(ctx, x, y, r.range(1.5, 3.5), r.int(1, 1e6), '#b8ae94', '#6f6a5c', 'rgba(90,80,60,0.25)')
    else if (d > 0.58 && d < 0.68 && r.chance(0.3)) {
      ctx.fillStyle = 'rgba(20,70,70,0.25)'
      ctx.beginPath(); ctx.arc(x, y, r.range(2, 5), 0, Math.PI * 2); ctx.fill()
    }
  }
  return c
}
const hashSeed = (a: number, b: number) => (hash3(a, b, 57) * 1e9) | 0

/** Doubly-periodic caustic network: integer-frequency waves wrap perfectly. */
function caustics(size: number, seed: number) {
  const r = rng(seed)
  const waves = Array.from({ length: 4 }, () => ({ kx: r.int(-3, 3) || 1, ky: r.int(-3, 3) || 2, p: r.range(0, 6.28) }))
  const T = Math.PI * 2
  return drain(field(size, size, (x, y, o, i) => {
    const u = x / size, v = y / size
    const wu = u + 0.08 * Math.sin(T * (2 * v + u) + 1.3), wv = v + 0.08 * Math.sin(T * (u * 3 - v) + 0.4)
    let s = 0
    for (const w of waves) s += Math.sin(T * (w.kx * wu * 2 + w.ky * wv * 2) + w.p)
    const c = Math.pow(1 - Math.abs(s / 4), 14)
    o[i] = 225; o[i + 1] = 255; o[i + 2] = 245; o[i + 3] = c * 255
  }))
}

/** Soft sun glints on wave crests. */
function glints(size: number, seed: number) {
  const [c, x] = canvas(size, size)
  const r = rng(seed)
  for (let i = 0; i < 26; i++) {
    const px = r.range(0, size), py = r.range(0, size), l = r.range(6, 18)
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      x.strokeStyle = `rgba(235,255,250,${r.range(0.25, 0.45)})`
      x.lineWidth = r.range(1, 1.8)
      x.beginPath()
      x.arc(px + ox, py + oy + l, l, -Math.PI * 0.72, -Math.PI * 0.28)
      x.stroke()
    }
  }
  return c
}

function whaleSprite() {
  const [c, x] = canvas(70, 190)
  x.fillStyle = 'rgba(4,30,40,1)'
  x.beginPath()
  x.ellipse(35, 70, 18, 62, 0, 0, Math.PI * 2)
  x.fill()
  x.beginPath(); x.moveTo(35, 120); x.quadraticCurveTo(10, 185, 4, 178); x.quadraticCurveTo(30, 160, 35, 150)
  x.quadraticCurveTo(40, 160, 66, 178); x.quadraticCurveTo(60, 185, 35, 120); x.fill()
  x.beginPath(); x.ellipse(14, 60, 5, 22, 0.6, 0, Math.PI * 2); x.ellipse(56, 60, 5, 22, -0.6, 0, Math.PI * 2); x.fill()
  return c
}

interface Fog { x: number; y: number; s: number; img: HTMLCanvasElement; vx: number }
interface Drop { x: number; y: number; l: number }

export function createGlasswater(seed = 1): Background {
  const tiles = cachedSeeded(`glass|${seed}`, () => new TileSet(VARIANTS, v => genTile(seed, v)))
  const tex = cached('glass|tex', () => ({
    caus: caustics(256, 9), glint: glints(280, 4), whale: whaleSprite(),
    fogs: [0, 1, 2].map(i => cloudSprite(420, 260, 70 + i, '#eaf6f4', 0.44, 3)),
  }))
  const ground = new Scroller(tiles, seed)
  const r = rng(seed * 7 + 3)
  const storm = new Fader(0, 2.5)
  let t = 0, flash = 0, nextFlash = 3
  const fogs: Fog[] = tex.fogs.map((img, i) => ({ img, x: r.range(0, W), y: i * 300 - 200, s: r.range(1, 1.5), vx: r.range(-8, 8) }))
  const drops: Drop[] = Array.from({ length: 140 }, () => ({ x: r.range(0, W), y: r.range(0, H), l: r.range(10, 22) }))
  const whale = { x: -300, y: 0, on: false, next: 6 }

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      storm.step(dt)
      for (const f of fogs) {
        f.y += scroll * 1.35 * dt + 4 * dt
        f.x += (f.vx + 6) * dt
        if (f.y - 200 > H) { f.y -= H + 500; f.x = r.range(0, W) }
      }
      for (const d of drops) {
        d.y += 900 * dt
        d.x -= 220 * dt
        if (d.y > H + 20) { d.y -= H + 40; d.x = r.range(0, W + 200) }
        d.x = wrapX(d.x, 30)
      }
      if (storm.v > 0.5) {
        nextFlash -= dt
        if (nextFlash <= 0) { flash = 1; nextFlash = r.range(3, 8) }
      }
      flash = Math.max(0, flash - dt * 2.2)
      whale.next -= dt
      if (!whale.on && whale.next <= 0) { whale.on = true; whale.x = r.range(80, W - 80); whale.y = -200 }
      if (whale.on) {
        whale.y += scroll * dt * 0.8 + 12 * dt
        whale.x += Math.sin(t * 0.3) * 6 * dt
        if (whale.y > H + 200) { whale.on = false; whale.next = r.range(18, 30) }
      }
    },
    drawBase(ctx) {
      const pos = ground.pos
      ground.draw(ctx)
      ctx.save()
      if (whale.on) blit(ctx, tex.whale, whale.x, whale.y, 0.05 * Math.sin(t * 0.5), 1, 0.16)
      // caustics: two drifting layers, 'overlay' fades them out in deep water
      ctx.globalCompositeOperation = 'overlay'
      ctx.globalAlpha = 0.22 - storm.e * 0.14
      tile2(ctx, tex.caus, t * 9, pos + t * 6, 1.7)
      tile2(ctx, tex.caus, -t * 7 + 90, pos - t * 5 + 40, 2.3)
      ctx.globalCompositeOperation = 'source-over'
      // shoreline surf breathing between two baked rings
      const surf = 0.5 + 0.5 * Math.sin(t * 1.4)
      ctx.globalAlpha = 0.55 + storm.e * 0.3
      ground.draw(ctx, 0, 0, W)
      ctx.globalAlpha = (0.35 + storm.e * 0.3) * surf
      ground.draw(ctx, 0, 0, W * 2)
      // twinkling crest glints
      const g = Math.sin(t * 1.7)
      ctx.globalAlpha = (0.35 + 0.35 * g) * (1 - storm.e * 0.6)
      tile2(ctx, tex.glint, t * 4, pos + t * 3)
      ctx.globalAlpha = (0.35 - 0.35 * g) * (1 - storm.e * 0.6)
      tile2(ctx, tex.glint, -t * 3 + 140, pos + 130)
      ctx.globalAlpha = 1
      const s = storm.e
      if (s > 0) {
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = `rgba(70,90,120,${s * 0.7})`
        ctx.fillRect(0, 0, W, H)
      }
      if (flash > 0) {
        ctx.globalCompositeOperation = 'screen'
        const f = flash * (0.6 + 0.4 * Math.sin(flash * 40))
        ctx.fillStyle = `rgba(190,215,255,${f * 0.35 * s})`
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
    },
    drawOver(ctx) {
      ctx.save()
      const s = storm.e
      for (const f of fogs) blit(ctx, f.img, f.x > W + 200 ? f.x - W - 400 : f.x, f.y, 0, f.s, 0.22 + s * 0.1)
      for (const f of fogs) if (f.x > W + 200) f.x -= W + 400
      if (s > 0.02) {
        ctx.strokeStyle = `rgba(200,220,235,${0.22 * s})`
        ctx.lineWidth = 1
        ctx.beginPath()
        for (const d of drops) { ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.25, d.y + d.l) }
        ctx.stroke()
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, `rgba(40,55,70,${0.18 * s})`)
        g.addColorStop(1, 'rgba(40,55,70,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'storm') storm.t = 1
      else if (name === 'calm') storm.t = 0
    },
  }
}

