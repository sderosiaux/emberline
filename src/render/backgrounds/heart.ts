/** M7 — the Choir citadel: machine-organic megastructure of bone ribs, organ pipes and pulsing veins. */
import { clamp, rng, smoothstep } from '../../core/math'
import {
  FH, FW, Fader, H, Scroller, TILE_H, TileSet, W, blit, cMix, cMul, cOut, cSet, cached, cachedSeeded, canvas, cloudSprite,
  field, grid, hash3, lut, slope, softDot, tileNoise, upscale, wrapX, type Background, type Ctx, type Job, fillFrame } from './kit'

const FLESH = lut([[0, '#110b1f'], [0.35, '#1d1433'], [0.6, '#2c1f48'], [0.85, '#3e2d5c'], [1, '#54406e']])
const TAU = Math.PI * 2

/** Top-down organ-pipe cluster: tubes as bone rims around dark throats. */
export function organPipes(ctx: Ctx, cx: number, cy: number, R: number, seed: number) {
  const r = rng(seed)
  const tubes: [number, number, number][] = []
  for (let i = 0; i < 60 && tubes.length < 18; i++) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * R * 0.75
    const tr = r.range(R * 0.12, R * 0.26) * (1 - d / R * 0.5)
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d
    if (tubes.every(([u, v, w]) => Math.hypot(u - x, v - y) > (w + tr) * 0.8)) tubes.push([x, y, tr])
  }
  // taller tubes near the middle: longer shadows
  tubes.sort((a, b) => a[1] - b[1])
  ctx.fillStyle = 'rgba(6,2,12,0.45)'
  for (const [x, y, tr] of tubes) {
    const hgt = 1 - Math.hypot(x - cx, y - cy) / R
    ctx.beginPath(); ctx.arc(x + tr * (0.4 + hgt), y + tr * (0.5 + hgt * 1.2), tr, 0, TAU); ctx.fill()
  }
  for (const [x, y, tr] of tubes) {
    const g = ctx.createRadialGradient(x - tr * 0.4, y - tr * 0.4, tr * 0.1, x, y, tr)
    g.addColorStop(0, '#d9ccb2')
    g.addColorStop(0.6, '#a39279')
    g.addColorStop(1, '#5e5060')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(x, y, tr, 0, TAU); ctx.fill()
    const h = ctx.createRadialGradient(x + tr * 0.1, y + tr * 0.1, 0, x, y, tr * 0.7)
    h.addColorStop(0, '#07030d')
    h.addColorStop(0.7, '#1c1028')
    h.addColorStop(1, '#4a3a4c')
    ctx.fillStyle = h
    ctx.beginPath(); ctx.arc(x + tr * 0.06, y + tr * 0.06, tr * 0.68, 0, TAU); ctx.fill()
    ctx.strokeStyle = 'rgba(40,20,40,0.5)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.arc(x, y, tr * 0.85, 0, TAU); ctx.stroke()
  }
}

/** Arching bone rib seen from above: tapered, segmented, with a soft cast shadow. */
export function boneRib(ctx: Ctx, x0: number, x1: number, y: number, bow: number, thick: number, seed: number) {
  const r = rng(seed)
  const pts: [number, number][] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push([x0 + (x1 - x0) * t, y - Math.sin(t * Math.PI) * bow])
  }
  // tapered band as one filled polygon (per-segment strokes leave beads at the joints)
  const band = (dx: number, dy: number, w: number, col: string) => {
    const L: [number, number][] = [], R: [number, number][] = []
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      const nx = -(b[1] - a[1]) / l, ny = (b[0] - a[0]) / l
      const hw = (w / 2) * (0.55 + 0.45 * Math.sin((i / (pts.length - 1)) * Math.PI))
      L.push([pts[i][0] + dx + nx * hw, pts[i][1] + dy + ny * hw])
      R.push([pts[i][0] + dx - nx * hw, pts[i][1] + dy - ny * hw])
    }
    ctx.fillStyle = col
    ctx.beginPath()
    L.forEach(([u, v], i) => (i ? ctx.lineTo(u, v) : ctx.moveTo(u, v)))
    for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1])
    ctx.closePath()
    ctx.fill()
  }
  band(thick * 0.8, thick * 1.2, thick * 1.1, 'rgba(6,2,12,0.35)')
  band(0, 0, thick, '#8e8070')
  band(-thick * 0.12, -thick * 0.18, thick * 0.6, '#c3b59c')
  band(-thick * 0.2, -thick * 0.3, thick * 0.18, 'rgba(240,230,210,0.6)')
  // segment joints
  ctx.strokeStyle = 'rgba(40,24,40,0.55)'
  ctx.lineWidth = 1.2
  for (let i = 2; i < pts.length - 2; i += r.int(2, 3)) {
    const [px, py] = pts[i]
    ctx.beginPath(); ctx.moveTo(px - 1, py - thick * 0.45); ctx.lineTo(px + 1, py + thick * 0.45); ctx.stroke()
  }
}

/** Layers: [surface | vein glow | collapse cracks]. */
function* genTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const n = tileNoise(seed, v)
  const P = FH
  const vein = new Float32Array(FW * FH), ribm = new Float32Array(FW * FH)
  const hf = yield* grid(FW, FH, (x, y) => {
    const i = y * FW + x
    const wx = x + (n.fbm(x, y, 64, 64, 3, 1) - 0.5) * 60
    const membrane = n.ridge(wx, y, 64, 64, 4, 2)
    const mask = smoothstep(clamp((n.fbm(x, y, 128, 128, 2, 3) - 0.5) * 4, 0, 1))
    // rib folds bowed into arches; integer frequency along y keeps them periodic per tile
    const bow = Math.sin((x / FW) * Math.PI) * 26
    const ph = ((y + bow) / P) * TAU * 16 + (n.fbm(wx, y, 128, 64, 3, 4) - 0.5) * 10
    const rib = Math.pow(Math.abs(Math.sin(ph)), 0.5) * mask
    ribm[i] = rib
    const vr = n.ridge(wx, y, 48, 48, 4, 5)
    const vr2 = n.ridge(x, y, 16, 16, 3, 6)
    vein[i] = Math.max(smoothstep(clamp((vr - 0.94) * 22, 0, 1)), smoothstep(clamp((vr2 - 0.955) * 25, 0, 1)) * 0.5) * (1 - rib * 0.6)
    return membrane * 0.45 + rib * 0.35 + n.fbm(x, y, 128, 128, 3, 7) * 0.3
  })
  const low = yield* field(FW, FH, (x, y, o, i) => {
    const k = y * FW + x
    const sl = slope(hf, FW, FH, x, y) * 10
    cSet(FLESH, hf[k] * 1.1 - 0.05)
    // bone crests on the ribs
    const rb = ribm[k]
    cMix(170, 158, 138, smoothstep(clamp((rb - 0.75) * 5, 0, 1)) * 0.55)
    const vv = vein[k]
    cMix(104, 64, 104, vv * 0.5)
    if (sl > 0) cMix(210, 190, 200, clamp(sl, 0, 1) * 0.3)
    else cMix(5, 2, 12, clamp(-sl, 0, 1) * 0.6)
    cMul(0.97 + hash3(x, y, 3) * 0.06)
    cOut(o, i)
  })
  const [c, x] = canvas(W * 3, TILE_H)
  x.drawImage(upscale(low, W, TILE_H)[0], 0, 0)
  // vein glow layer
  const glow = yield* field(FW, FH, (gx, gy, o, i) => {
    const vv = vein[gy * FW + gx]
    o[i] = 176; o[i + 1] = 112; o[i + 2] = 160; o[i + 3] = vv * 170
  })
  x.imageSmoothingQuality = 'high'
  x.drawImage(glow, W, 0, W, TILE_H)
  const r = rng(seed * 41 + v)
  // bone ribs and organ-pipe clusters
  for (let i = 0; i < r.int(1, 2); i++) {
    const y = r.range(160, TILE_H - 160)
    boneRib(x, r.range(-60, 80), r.range(W - 80, W + 60), y, r.range(30, 70), r.range(12, 20), r.int(1, 1e6))
  }
  for (let i = 0; i < r.int(2, 3); i++) {
    const R = r.range(28, 50)
    organPipes(x, r.range(R, W - R), r.range(R + 20, TILE_H - R - 20), R, r.int(1, 1e6))
  }
  // vein nodes: soft glands (on both layers)
  const gland = softDot(32, '#c890b8', 0.2)
  for (let i = 0; i < 10; i++) {
    const px = r.range(20, W - 20), py = r.range(20, TILE_H - 20)
    const rr = r.range(4, 8)
    const g = x.createRadialGradient(px - 1, py - 1, 0, px, py, rr)
    g.addColorStop(0, '#b77aa0')
    g.addColorStop(1, '#3a2248')
    x.fillStyle = g
    x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill()
    x.drawImage(gland, W + px - rr * 2.5, py - rr * 2.5, rr * 5, rr * 5)
  }
  yield
  // collapse cracks (layer 2)
  x.save()
  x.translate(W * 2, 0)
  x.globalCompositeOperation = 'lighter'
  for (let k = 0; k < 5; k++) {
    let px = r.range(40, W - 40), py = r.range(80, TILE_H - 300)
    const pts: [number, number][] = [[px, py]]
    let a = r.range(0, TAU)
    for (let s = 0; s < 18; s++) {
      a += r.range(-0.7, 0.7)
      px += Math.cos(a) * r.range(8, 18)
      py += Math.abs(Math.sin(a)) * r.range(6, 16)
      pts.push([px, py])
    }
    for (const [lw, col] of [[10, 'rgba(255,70,40,0.18)'], [4, 'rgba(255,120,70,0.55)'], [1.4, 'rgba(255,225,190,0.9)']] as const) {
      x.lineWidth = lw
      x.strokeStyle = col
      x.beginPath()
      pts.forEach(([u, w], i) => (i ? x.lineTo(u, w) : x.moveTo(u, w)))
      x.stroke()
    }
  }
  x.restore()
  return c
}

/** The abyss between the parted halves: receding rib rings and the core's glow far below. */
function drawChasm(ctx: Ctx, g: number, pos: number, b: number) {
  const x0 = W / 2 - g * 1.3, w = g * 2.6
  const bg = ctx.createLinearGradient(x0, 0, x0 + w, 0)
  bg.addColorStop(0, '#05010a')
  bg.addColorStop(0.5, '#2a0714')
  bg.addColorStop(1, '#05010a')
  ctx.fillStyle = bg
  ctx.fillRect(x0, 0, w, H)
  // inner rib rings at two depths (slower = deeper)
  for (const [f, a, s] of [[0.35, 0.25, 0.55], [0.6, 0.4, 0.8]] as const) {
    const step = 46
    const off = (pos * f) % step
    ctx.strokeStyle = `rgba(150,110,120,${a})`
    ctx.lineWidth = 3 * s
    for (let y = -step + off; y < H + step; y += step) {
      ctx.beginPath()
      ctx.ellipse(W / 2, y, g * s * 1.1, 10 * s, 0, 0, Math.PI)
      ctx.stroke()
    }
  }
  const glow = ctx.createRadialGradient(W / 2, H * 0.5, 0, W / 2, H * 0.5, g * 1.2 + 40)
  glow.addColorStop(0, `rgba(255,90,70,${0.35 + b * 0.35})`)
  glow.addColorStop(1, 'rgba(255,60,50,0)')
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = glow
  ctx.fillRect(x0, 0, w, H)
  ctx.globalCompositeOperation = 'source-over'
}

/** Bone plates lining a parted edge, overlapping like an iris diaphragm. */
function irisPlates(ctx: Ctx, edge: (y: number, side: number) => number, side: number, g: number, pos: number) {
  const step = 30
  const off = pos % step
  const reach = 10 + g * 0.16
  for (let y = -step + off; y < H + step; y += step) {
    const ex = edge(y, side)
    const tip = ex - side * reach
    ctx.fillStyle = 'rgba(6,2,12,0.5)'
    ctx.beginPath(); ctx.moveTo(ex + side * 4, y - 16 + 4); ctx.quadraticCurveTo(tip + 4, y + 2, ex + side * 4, y + 20); ctx.closePath(); ctx.fill()
    const pg = ctx.createLinearGradient(ex, y - 16, tip, y + 16)
    pg.addColorStop(0, '#6e5e60')
    pg.addColorStop(0.5, '#b6a68e')
    pg.addColorStop(1, '#5a4652')
    ctx.fillStyle = pg
    ctx.beginPath(); ctx.moveTo(ex + side * 2, y - 18); ctx.quadraticCurveTo(tip, y - 2, ex + side * 2, y + 17); ctx.closePath(); ctx.fill()
    ctx.strokeStyle = 'rgba(240,225,200,0.45)'
    ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(ex + side * 2, y - 18); ctx.quadraticCurveTo(tip, y - 2, tip + side * 2, y); ctx.stroke()
  }
}

/** Heartbeat envelope: a strong beat then a softer echo. */
function beat(phase: number) {
  const p = phase % 1
  return Math.exp(-((p / 0.07) ** 2)) + 0.55 * Math.exp(-(((p - 0.22) / 0.07) ** 2))
}

interface Mote { x: number; y: number; v: number; s: number; ph: number }
interface Chunk { x: number; y: number; vy: number; rot: number; vr: number; s: number }

export function createHeart(seed = 1): Background {
  const tiles = cachedSeeded(`heart|${seed}`, () => new TileSet(3, v => genTile(seed, v)))
  const tex = cached('heart|tex', () => ({
    mote: softDot(16, '#b89acb', 0.1),
    haze: cloudSprite(420, 320, 333, '#6b4a86', 0.5, 2.5),
    core: softDot(256, '#8a1f35', 0),
    chunk: (() => {
      const [c, x] = canvas(24, 20)
      x.fillStyle = '#2a1d34'
      x.beginPath(); x.moveTo(3, 5); x.lineTo(18, 2); x.lineTo(22, 14); x.lineTo(8, 18); x.closePath(); x.fill()
      x.strokeStyle = 'rgba(200,170,160,0.5)'
      x.beginPath(); x.moveTo(3, 5); x.lineTo(18, 2); x.stroke()
      return c
    })(),
  }))
  const ground = new Scroller(tiles, seed)
  const r = rng(seed * 9 + 4)
  const core = new Fader(0, 3), collapse = new Fader(0, 1.5)
  let t = 0, shake = 0, bp = 0
  const motes: Mote[] = Array.from({ length: 40 }, () => ({ x: r.range(0, W), y: r.range(0, H), v: r.range(6, 20), s: r.range(0.4, 1), ph: r.range(0, 6) }))
  const chunks: Chunk[] = Array.from({ length: 16 }, () => ({ x: r.range(0, W), y: r.range(-H, 0), vy: r.range(120, 260), rot: 0, vr: r.range(-3, 3), s: r.range(0.6, 1.6) }))
  const hazes = [0, 1, 2].map(i => ({ x: r.range(0, W), y: i * 300 }))

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      core.step(dt)
      collapse.step(dt)
      shake = collapse.e * 3
      bp += dt / (1.7 - core.e * 0.8 - collapse.e * 0.4)
      for (const m of motes) {
        m.y += (scroll * 0.4 - m.v) * dt
        m.x += Math.sin(t * 0.7 + m.ph) * 8 * dt
        if (m.y < -10) { m.y = H + 10; m.x = r.range(0, W) }
        if (m.y > H + 10) m.y = -10
        m.x = wrapX(m.x, 10)
      }
      if (collapse.v > 0) for (const c of chunks) {
        c.y += (c.vy + scroll) * dt
        c.rot += c.vr * dt
        if (c.y > H + 30) { c.y = -30 - r.range(0, 300); c.x = r.range(0, W) }
      }
      for (const h of hazes) {
        h.y += (scroll * 1.3 + 5) * dt
        if (h.y - 200 > H) { h.y -= H + 600; h.x = r.range(0, W) }
      }
    },
    drawBase(ctx) {
      ctx.save()
      const ce = core.e, co = collapse.e
      const b = beat(bp)
      const dx = shake ? (Math.random() - 0.5) * shake * 2 : 0
      const dy = shake ? (Math.random() - 0.5) * shake * 2 : 0
      const veins = 0.12 + b * (0.3 + ce * 0.25)
      const layers = (ox: number) => {
        ground.draw(ctx, dx + ox, dy)
        ctx.globalAlpha = veins
        ground.draw(ctx, dx + ox, dy, W)
        ctx.globalAlpha = 1
        if (co > 0) {
          ctx.globalCompositeOperation = 'lighter'
          ctx.globalAlpha = co * (0.65 + 0.35 * Math.sin(t * 17) * Math.sin(t * 7.3))
          ground.draw(ctx, dx + ox, dy, W * 2)
          ctx.globalAlpha = 1
          ctx.globalCompositeOperation = 'source-over'
        }
      }
      if (ce <= 0.001) layers(0)
      else {
        // the citadel opens: both halves slide apart over a chasm down to the core
        const g = ce * 92
        const pos = ground.pos
        const edge = (y: number, side: number) => W / 2 + side * (g + g * 0.2 * Math.sin((y - pos) * 0.028) + g * 0.08 * Math.sin((y - pos) * 0.09))
        drawChasm(ctx, g, pos, b)
        for (const side of [-1, 1]) {
          ctx.save()
          ctx.beginPath()
          ctx.moveTo(side < 0 ? -10 : W + 10, -10)
          for (let y = -10; y <= H + 10; y += 10) ctx.lineTo(edge(y, side), y)
          ctx.lineTo(side < 0 ? -10 : W + 10, H + 10)
          ctx.closePath()
          ctx.clip()
          layers(side * g)
          ctx.restore()
          irisPlates(ctx, edge, side, g, pos)
        }
      }
      if (ce > 0) {
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = `rgba(210,110,120,${ce * 0.45})`
        fillFrame(ctx)
        // the core far below: a slow red throb rising out of the chasm
        ctx.globalCompositeOperation = 'screen'
        ctx.globalAlpha = ce * (0.3 + b * 0.35)
        ctx.drawImage(tex.core, W / 2 - 300, H * 0.45 - 360, 600, 720)
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75)
        v.addColorStop(0, 'rgba(10,2,8,0)')
        v.addColorStop(1, `rgba(10,2,8,${ce * 0.6})`)
        ctx.fillStyle = v
        fillFrame(ctx)
      }
      if (co > 0) {
        for (const c of chunks) blit(ctx, tex.chunk, c.x, c.y, c.rot, c.s, co * 0.9)
      }
      ctx.restore()
    },
    drawOver(ctx) {
      ctx.save()
      const ce = core.e, co = collapse.e
      for (const h of hazes) blit(ctx, tex.haze, h.x, h.y, 0, 1.4, 0.1 + ce * 0.05)
      ctx.globalCompositeOperation = 'lighter'
      for (const m of motes) {
        const a = (0.18 + 0.12 * Math.sin(t * 2 + m.ph)) * (1 - co * 0.5)
        blit(ctx, tex.mote, m.x, m.y, 0, m.s, a)
      }
      ctx.globalCompositeOperation = 'source-over'
      if (co > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, H)
        g.addColorStop(0, `rgba(40,10,20,${co * 0.25})`)
        g.addColorStop(1, 'rgba(40,10,20,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'core') { core.t = 1; collapse.t = 0 }
      else if (name === 'collapse') { core.t = 1; collapse.t = 1 }
      else if (name === 'surface') { core.t = 0; collapse.t = 0 }
    },
  }
}
