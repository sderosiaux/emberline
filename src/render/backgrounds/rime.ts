/** M3 — frozen colony: snowfields, cracked ice sheets, frozen lakes, frost pine ridges. */
import { clamp, rng, smoothstep } from '../../core/math'
import {
  FH, FS, FW, Fader, H, Scroller, TILE_H, TileSet, W, blit, cMix, cMul, cOut, cSet, cached, cachedSeeded, canvas, cloudSprite,
  field, grid, hash3, li, lut, slope, softDot, tileNoise, upscale, wrapX, type Background, type Ctx, type Job, type SeamNoise,
} from './kit'
import { pine } from './motifs'

const SNOW = lut([[0, '#98abc0'], [0.35, '#b9c8d7'], [0.7, '#d2dce6'], [1, '#e4ebf1']])
const ICE = lut([[0, '#7aa6c2'], [0.5, '#95bfd6'], [1, '#b8d8e8']])
const LAKE = lut([[0, '#3e6582'], [0.6, '#5a82a0'], [1, '#86aac2']])
const VARIANTS = 3

function* genTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const n = tileNoise(seed, v)
  const ice = new Float32Array(FW * FH), lake = new Float32Array(FW * FH), rid = new Float32Array(FW * FH)
  const hf = yield* grid(FW, FH, (x, y) => {
    const i = y * FW + x
    const wx = x + (n.fbm(x, y, 64, 64, 2, 2) - 0.5) * 60
    const macro = n.fbm(x, y, 128, 128, 4, 1)
    const ridge = n.ridge(wx, y, 128, 128, 3, 3)
    const sastrugi = n.fbm(x * 0.8 + y * 0.5, y, 32, 8, 2, 4)
    const lk = smoothstep(clamp((n.fbm(x, y, 128, 128, 3, 5) - 0.63) * 14, 0, 1))
    const ic = smoothstep(clamp((n.fbm(x, y, 64, 128, 3, 6) - 0.56) * 8, 0, 1)) * (1 - lk)
    lake[i] = lk
    ice[i] = ic
    rid[i] = smoothstep(clamp((ridge - 0.8) * 6, 0, 1)) * (1 - lk) * (1 - ic)
    let h = macro * 0.55 + ridge * ridge * 0.35 + sastrugi * 0.05
    h = h + (0.3 - h) * lk * 0.95
    h = h + (0.4 - h) * ic * 0.6
    return h
  })
  const low = yield* field(FW, FH, (x, y, o, i) => {
    const k = y * FW + x
    const h = hf[k]
    const sl = slope(hf, FW, FH, x, y) * 12
    cSet(SNOW, (h - 0.2) / 0.6)
    const ic = ice[k]
    if (ic > 0) {
      const streak = n.fbm(x, y * 0.5 + x * 0.2, 48, 4, 2, 8)
      const j = li(streak)
      cMix(ICE[j], ICE[j + 1], ICE[j + 2], ic * 0.85)
      const cr = n.ridge(x, y, 24, 16, 3, 9)
      cMix(225, 240, 250, ic * smoothstep(clamp((cr - 0.95) * 30, 0, 1)) * 0.8)
      cMix(90, 130, 160, ic * smoothstep(clamp((cr - 0.965) * 30, 0, 1)) * 0.5)
    }
    const lk = lake[k]
    if (lk > 0) {
      const d = n.fbm(x, y, 32, 32, 3, 10)
      const j = li(d)
      cMix(LAKE[j], LAKE[j + 1], LAKE[j + 2], lk * 0.95)
      const cr = n.ridge(x, y, 32, 32, 3, 11)
      cMix(205, 228, 242, lk * smoothstep(clamp((cr - 0.955) * 40, 0, 1)) * 0.7)
      cMix(40, 70, 95, lk * smoothstep(clamp((cr - 0.975) * 60, 0, 1)) * 0.4)
      if (hash3(x, y, 12) > 0.995) cMix(230, 244, 250, lk * 0.6)
      // pale rim where snow drifts onto the ice
      cMix(225, 236, 244, smoothstep(clamp((0.55 - lk) * 3, 0, 1)) * lk * 1.2)
    }
    if (sl > 0) cMix(255, 250, 240, clamp(sl, 0, 1) * 0.55)
    else cMix(96, 122, 168, clamp(-sl, 0, 1) * 0.6)
    // shaded forest floor under the canopy (crowns are painted as vectors afterwards)
    cMix(150, 170, 186, smoothstep(clamp((rid[k] - 0.4) * 3, 0, 1)) * 0.35)
    cMul(0.985 + hash3(x, y, 5) * 0.03)
    cOut(o, i)
  })
  const [c, ctx] = upscale(low, W, TILE_H)
  const roadPts = road(ctx, n)
  const onRoad = (x: number, y: number) => {
    const p = roadPts[Math.max(0, Math.min(roadPts.length - 1, Math.round((y + 8) / 8)))]
    return p[2] > 0.1 && Math.abs(p[0] - x) < 16
  }
  const r = rng(hashSeed(seed, v))
  // pines along the frost ridges
  // conifer stands: distinct trees in clumps, each with its own cast shadow, snow showing between
  const trees: [number, number, number][] = []
  for (let i = 0; i < 900; i++) {
    const x0 = r.range(0, W), y0 = r.range(20, TILE_H - 20)
    const k0 = Math.min(FH - 1, (y0 / FS) | 0) * FW + ((x0 / FS) | 0)
    if (rid[k0] < 0.4 || r.next() > 0.35) continue
    const n = r.int(3, 9)
    for (let j = 0; j < n; j++) {
      const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 16
      const x = x0 + Math.cos(a) * d, y = y0 + Math.sin(a) * d
      if (y < 12 || y > TILE_H - 12 || onRoad(x, y)) continue
      if (trees.some(([u, v, s]) => Math.abs(u - x) < s * 1.1 && Math.abs(v - y) < s * 1.1)) continue
      trees.push([x, y, r.range(4.5, 8)])
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = r.range(0, W), y = r.range(12, TILE_H - 12)
    const k = Math.min(FH - 1, (y / FS) | 0) * FW + ((x / FS) | 0)
    if (rid[k] > 0.15 && lake[k] < 0.1 && !onRoad(x, y)) trees.push([x, y, r.range(3.5, 6)])
  }
  yield
  // shadows first so no crown is darkened by a neighbour's shadow
  ctx.fillStyle = 'rgba(70,95,140,0.3)'
  for (const [x, y, s] of trees) { ctx.beginPath(); ctx.ellipse(x + s * 1.3, y + s * 1.5, s * 1.5, s * 0.75, 0.75, 0, Math.PI * 2); ctx.fill() }
  trees.sort((a, b) => a[1] - b[1])
  for (let i = 0; i < trees.length; i++) {
    const [x, y, s] = trees[i]
    pine(ctx, x, y, s, r.int(1, 1e6), '#1f3a40', '#3f6664', 0.55, false)
    if (i % 300 === 299) yield
  }
  return c
}
const hashSeed = (a: number, b: number) => (hash3(a, b, 71) * 1e9) | 0

/** Plowed colony road with snow berms; joins across tiles via seam lattice rows. */
function road(ctx: Ctx, n: SeamNoise) {
  const pts: [number, number, number][] = []
  for (let y = -8; y <= TILE_H + 8; y += 8) {
    const fy = y / FS
    const x = W * 0.2 + n.fbm(7.5, fy, 1, 256, 2, 60) * W * 0.6
    const on = smoothstep(clamp((n.val(7.5, fy, 1, 256, 61) - 0.3) * 5, 0, 1))
    pts.push([x, y, on])
  }
  const seg = (w: number, style: string, off = 0, dash: number[] = []) => {
    ctx.lineWidth = w
    ctx.strokeStyle = style
    ctx.setLineDash(dash)
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, a] = pts[i], [x1, y1] = pts[i + 1]
      if (a < 0.02) continue
      ctx.globalAlpha = a
      ctx.beginPath(); ctx.moveTo(x0 + off, y0); ctx.lineTo(x1 + off, y1); ctx.stroke()
    }
  }
  ctx.save()
  seg(18, 'rgba(250,252,255,0.8)', -2)
  seg(18, 'rgba(120,145,175,0.35)', 2)
  seg(13, '#a9b8c6')
  seg(1.5, 'rgba(90,110,130,0.35)', -3.5)
  seg(1.5, 'rgba(90,110,130,0.35)', 3.5)
  seg(1.2, 'rgba(230,200,120,0.35)', 0, [8, 10])
  ctx.restore()
  return pts
}

/** Snowflake readable on bright snow: pale core, cool blue-grey rim. */
function flakeSprite() {
  const [c, x] = canvas(12, 12)
  const g = x.createRadialGradient(5.5, 5.5, 0, 6, 6, 6)
  g.addColorStop(0, 'rgba(250,252,255,1)')
  g.addColorStop(0.45, 'rgba(206,220,236,0.95)')
  g.addColorStop(0.75, 'rgba(120,145,178,0.55)')
  g.addColorStop(1, 'rgba(120,145,178,0)')
  x.fillStyle = g
  x.fillRect(0, 0, 12, 12)
  return c
}

interface Flake { x: number; y: number; z: number; ph: number }

export function createRime(seed = 1): Background {
  const tiles = cachedSeeded(`rime|${seed}`, () => new TileSet(VARIANTS, v => genTile(seed, v)))
  const tex = cached('rime|tex', () => ({
    flake: flakeSprite(),
    flakeShadow: softDot(12, '#4a6282', 0),
    drift: [0, 1].map(i => cloudSprite(420, 120, 90 + i, '#f4f8ff', 0.48, 3, 0.03)),
    haze: cloudSprite(512, 400, 95, '#eef3f8', 0.35, 2),
  }))
  const ground = new Scroller(tiles, seed)
  const r = rng(seed * 11 + 1)
  const bliz = new Fader(0, 3), clear = new Fader(0, 3)
  let t = 0
  const flakes: Flake[] = Array.from({ length: 280 }, () => ({ x: r.range(0, W), y: r.range(0, H), z: r.chance(0.7) ? r.range(0.3, 0.7) : r.range(0.8, 1.2), ph: r.range(0, 6.28) }))
  const drifts = [0, 1, 2, 3].map(i => ({ x: r.range(-200, W), y: r.range(0, H), img: tex.drift[i % 2], v: r.range(50, 90) }))
  const hazes = [0, 1, 2].map(i => ({ x: r.range(0, W), y: i * 320 }))

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      bliz.step(dt)
      clear.step(dt)
      const wind = 20 + bliz.e * 220
      for (const f of flakes) {
        f.y += (30 + 50 * f.z + scroll * 0.6 * f.z + bliz.e * 120 * f.z) * dt
        f.x += (Math.sin(t * 1.3 + f.ph) * 10 + wind * f.z) * dt
        if (f.y > H + 10) { f.y = -10; f.x = r.range(-40, W) }
        f.x = wrapX(f.x, 10)
      }
      for (const d of drifts) {
        d.x += (d.v + bliz.e * 200) * dt
        d.y += scroll * dt
        if (d.x - 250 > W || d.y - 80 > H) { d.x = -260 - r.range(0, 200); d.y = r.range(-60, H) }
      }
      for (const h of hazes) {
        h.y += (scroll * 1.4 + 10) * dt
        h.x += (15 + bliz.e * 120) * dt
        if (h.y - 250 > H) { h.y -= H + 700; h.x = r.range(0, W) }
        h.x = wrapX(h.x, 300)
      }
    },
    drawBase(ctx) {
      ground.draw(ctx)
      // spindrift sweeping across the snow
      for (const d of drifts) blit(ctx, d.img, d.x, d.y, 0, 1, 0.22 + bliz.e * 0.2, 0.7)
    },
    drawOver(ctx) {
      ctx.save()
      const b = bliz.e, c = clear.e
      // light haze patches; whiteout in blizzard
      for (const h of hazes) blit(ctx, tex.haze, h.x, h.y, 0, 1.3, 0.12 + b * 0.3 - c * 0.1)
      if (b > 0) {
        ctx.fillStyle = `rgba(226,234,244,${b * 0.26})`
        ctx.fillRect(0, 0, W, H)
      }
      const count = Math.round(90 - c * 55 + b * 190)
      for (let i = 0; i < count; i++) {
        const f = flakes[i]
        const s = (3 + f.z * 5) * (1 + b * 0.3)
        // soft shadow on the snow below the flake (nearer flakes cast further)
        ctx.globalAlpha = 0.28 * (1 - b * 0.6)
        ctx.drawImage(tex.flakeShadow, f.x - s / 2 + s * 0.6, f.y - s / 2 + s * 0.9, s, s)
        ctx.globalAlpha = 0.6 + f.z * 0.35
        if (b > 0.3 && f.z > 0.8) {
          // wind-smeared flakes in the blizzard
          ctx.drawImage(tex.flake, f.x - s * 1.5, f.y - s / 2, s * 3, s)
        } else ctx.drawImage(tex.flake, f.x - s / 2, f.y - s / 2, s, s)
      }
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'blizzard') { bliz.t = 1; clear.t = 0 }
      else if (name === 'clear') { bliz.t = 0; clear.t = 1 }
      else if (name === 'snow') { bliz.t = 0; clear.t = 0 }
    },
  }
}
