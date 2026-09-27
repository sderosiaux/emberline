/** Secret level — a pastel dreamscape: perspective grid, geometric flowers, soft static. */
import { rng } from '../../core/math'
import {
  Fader, H, Scroller, TILE_H, TileSet, W, blit, cached, cachedSeeded, canvas, cloudSprite, hex, type Background, type Ctx, type Job,
} from './kit'

const TAU = Math.PI * 2
export const PETALS = ['#f4b6c8', '#c7b3f2', '#a9e3cf', '#f7d9a8', '#a8d2f2', '#f0c4e8']

/** Geometric flower: layered polygon petals around a faceted core, soft shadow. */
export function geoFlower(ctx: Ctx, x: number, y: number, R: number, seed: number) {
  const r = rng(seed)
  const n = r.int(5, 9)
  const c1 = r.pick(PETALS), c2 = r.pick(PETALS)
  const rot = r.range(0, TAU)
  const petals = (rad: number, col: string, dx: number, dy: number, sharp: number) => {
    ctx.fillStyle = col
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * TAU
      const ca = Math.cos(a), sa = Math.sin(a)
      const w = (TAU / n) * 0.42
      ctx.beginPath()
      ctx.moveTo(x + dx, y + dy)
      ctx.lineTo(x + dx + Math.cos(a - w) * rad * sharp, y + dy + Math.sin(a - w) * rad * sharp)
      ctx.lineTo(x + dx + ca * rad, y + dy + sa * rad)
      ctx.lineTo(x + dx + Math.cos(a + w) * rad * sharp, y + dy + Math.sin(a + w) * rad * sharp)
      ctx.closePath()
      ctx.fill()
    }
  }
  petals(R, 'rgba(90,70,130,0.18)', R * 0.18, R * 0.24, 0.6)
  petals(R, c1, 0, 0, 0.6)
  // facet shading: the half of each petal facing away from the light
  ctx.save()
  ctx.globalCompositeOperation = 'source-atop'
  const g = ctx.createLinearGradient(x - R, y - R, x + R, y + R)
  g.addColorStop(0, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(80,60,120,0.25)')
  ctx.fillStyle = g
  ctx.fillRect(x - R, y - R, R * 2, R * 2)
  ctx.restore()
  petals(R * 0.62, c2, 0, 0, 0.55)
  ctx.fillStyle = '#fff4d8'
  ctx.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * TAU
    const px = x + Math.cos(a) * R * 0.2, py = y + Math.sin(a) * R * 0.2
    if (i === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  }
  ctx.closePath()
  ctx.fill()
  ctx.fillStyle = 'rgba(200,150,120,0.5)'
  ctx.beginPath(); ctx.arc(x + R * 0.05, y + R * 0.05, R * 0.09, 0, TAU); ctx.fill()
}

function* flowerTile(seed: number, v: number): Job<HTMLCanvasElement> {
  const [c, x] = canvas(W, TILE_H)
  const r = rng(seed * 61 + v)
  // stepping-stone tiles and dotted paths
  for (let i = 0; i < 18; i++) {
    const px = r.range(20, W - 20), py = r.range(30, TILE_H - 30), s = r.range(10, 22)
    x.fillStyle = 'rgba(80,60,130,0.12)'
    x.fillRect(px + 3, py + 4, s, s)
    x.fillStyle = `rgba(255,255,255,${r.range(0.25, 0.45)})`
    x.fillRect(px, py, s, s)
  }
  yield
  for (let i = 0; i < 8; i++) {
    const R = r.range(18, 40)
    geoFlower(x, r.range(R, W - R), r.range(R + 10, TILE_H - R - 10), R, r.int(1, 1e6))
  }
  return c
}

function shapeSprite(kind: number, col: string) {
  const [c, x] = canvas(64, 64)
  x.strokeStyle = col
  x.fillStyle = col
  x.lineWidth = 3
  x.beginPath()
  if (kind === 0) x.arc(32, 32, 22, 0, TAU)
  else if (kind === 1) { x.moveTo(32, 8); x.lineTo(56, 50); x.lineTo(8, 50); x.closePath() }
  else if (kind === 2) { x.moveTo(32, 6); x.lineTo(58, 32); x.lineTo(32, 58); x.lineTo(6, 32); x.closePath() }
  else x.rect(12, 12, 40, 40)
  if (kind === 2) { x.globalAlpha = 0.35; x.fill(); x.globalAlpha = 1 }
  x.stroke()
  return c
}

/** Pastel striped sun hanging past the grid horizon. */
function sunSprite() {
  const R = 150
  const [c, x] = canvas(R * 2, R * 2)
  const g = x.createLinearGradient(0, 0, 0, R * 2)
  g.addColorStop(0, '#fff0c8')
  g.addColorStop(0.55, '#ffc8d6')
  g.addColorStop(1, '#e6b4f0')
  x.fillStyle = g
  x.beginPath(); x.arc(R, R, R, 0, TAU); x.fill()
  x.globalCompositeOperation = 'destination-out'
  for (let i = 0; i < 7; i++) {
    const y = R * 1.05 + i * i * 2.4 + i * 10
    x.fillRect(0, y, R * 2, 2 + i * 1.6)
  }
  return c
}

function staticBand() {
  const [c, x] = canvas(W, 48)
  const r = rng(808)
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = r.pick(['rgba(255,255,255,0.7)', 'rgba(120,90,180,0.6)', 'rgba(130,220,200,0.6)', 'rgba(250,170,200,0.6)'])
    x.fillRect(r.range(0, W), r.range(0, 48), r.range(1, 6), 1)
  }
  return c
}

export function createGarden(seed = 1): Background {
  const tex = cached('garden|tex', () => ({
    blobs: ['#f6c9d8', '#d6c8f6', '#bff0de', '#fbe3c0'].map((col, i) => cloudSprite(420, 320, 500 + i, col, 0.42, 2.5)),
    shapes: [0, 1, 2, 3].map(k => shapeSprite(k, ['#ffffff', '#f7c6dc', '#c6f2e2', '#d9ccff'][k])),
    band: staticBand(),
    sun: sunSprite(),
  }))
  const tiles = cachedSeeded(`garden|${seed}`, () => new TileSet(3, v => flowerTile(seed, v)))
  const ground = new Scroller(tiles, seed)
  const r = rng(seed * 4 + 1)
  const glitchy = new Fader(0, 1.5)
  let t = 0, gpos = 0, glitch = 0, gy = 0, gh = 0, nextGlitch = 2
  const blobs = tex.blobs.map((img, i) => ({ img, x: r.range(0, W), y: i * 220 - 100, f: r.range(0.2, 0.35) }))
  const shapes = Array.from({ length: 9 }, (_, i) => ({ img: tex.shapes[i % 4], x: r.range(0, W), y: r.range(0, H), rot: r.range(0, TAU), vr: r.range(-0.4, 0.4), s: r.range(0.3, 0.8), f: r.range(0.45, 0.7) }))
  const [ta, tb, tc, td] = ['#b7a4dd', '#9ed9c4', '#e3b9cf', '#a9c6ea'].map(hex)

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      glitchy.step(dt)
      gpos += (scroll * 0.004 + 0.05) * dt
      for (const b of blobs) {
        b.y += (scroll * b.f + 4) * dt
        if (b.y - 200 > H) { b.y -= H + 600; b.x = r.range(0, W) }
      }
      for (const s of shapes) {
        s.y += (scroll * s.f + 6) * dt
        s.rot += s.vr * dt
        if (s.y > H + 40) { s.y = -40; s.x = r.range(0, W) }
      }
      glitch = Math.max(0, glitch - dt)
      nextGlitch -= dt * (1 + glitchy.e * 4)
      if (nextGlitch <= 0) {
        glitch = r.range(0.12, 0.3)
        gy = r.range(0, H - 60)
        gh = r.range(10, 48)
        nextGlitch = r.range(2.5, 6)
      }
    },
    drawBase(ctx) {
      ctx.save()
      // dreamy sky-floor gradient, hue slowly drifting
      const k = 0.5 + 0.5 * Math.sin(t * 0.08)
      const mix = (a: number[], b: number[]) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`
      const g = ctx.createLinearGradient(0, 0, 0, H)
      g.addColorStop(0, mix(ta, tc))
      g.addColorStop(1, mix(tb, td))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, W, H)
      blit(ctx, tex.sun, W / 2, 30 + Math.sin(t * 0.3) * 6, 0, 1, 0.55)
      for (const b of blobs) blit(ctx, b.img, b.x, b.y, 0, 1.3, 0.45)
      drawGrid(ctx, gpos)
      for (const s of shapes) blit(ctx, s.img, s.x, s.y, s.rot, s.s, 0.45)
      ground.draw(ctx)
      if (glitch > 0) {
        // displaced slice + chromatic ghost
        const off = (Math.random() - 0.5) * 24
        ground.strip(ctx, gy, gh, off)
        ctx.globalCompositeOperation = 'screen'
        ctx.fillStyle = 'rgba(120,255,230,0.18)'
        ctx.fillRect(0, gy, W, gh)
        ctx.globalCompositeOperation = 'source-over'
      }
      ctx.restore()
    },
    drawOver(ctx) {
      ctx.save()
      if (glitch > 0) {
        ctx.globalAlpha = 0.22 + glitchy.e * 0.1
        ctx.drawImage(tex.band, (Math.random() - 0.5) * 40, gy - 10, W, gh + 20)
      }
      // slow rolling scanline band
      const sy = (t * 40) % (H + 120) - 60
      ctx.globalAlpha = 0.06 + glitchy.e * 0.06
      ctx.fillStyle = '#ffffff'
      for (let y = sy; y < sy + 60; y += 3) ctx.fillRect(0, y, W, 1)
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'glitch') glitchy.t = 1
      else if (name === 'calm' || name === 'bloom') glitchy.t = 0
    },
  }
}

/** Receding floor grid: vanishing point above the top edge, rows stream toward the camera. */
function drawGrid(ctx: Ctx, pos: number) {
  const vy = -240, F = 240 * 7, step = 0.5
  ctx.lineWidth = 1
  const z0 = F / (0 - vy), z1 = F / (H + 40 - vy)
  const first = Math.ceil((z1 + (pos % step)) / step) * step - (pos % step)
  for (let z = first; z < z0; z += step) {
    const y = vy + F / z
    const a = Math.min(1, (y + 40) / H)
    ctx.strokeStyle = `rgba(255,255,255,${0.1 + a * 0.3})`
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }
  const vx = W / 2
  const fade = ctx.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(255,255,255,0.06)')
  fade.addColorStop(1, 'rgba(255,255,255,0.4)')
  ctx.strokeStyle = fade
  ctx.beginPath()
  for (let i = -14; i <= 14; i++) {
    const bx = vx + i * 70
    // start where the ray enters the playfield
    const t0 = (0 - vy) / (H - vy)
    ctx.moveTo(vx + (bx - vx) * t0, 0)
    ctx.lineTo(bx, H)
  }
  ctx.stroke()
}
