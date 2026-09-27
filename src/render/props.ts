/**
 * Ground set-pieces placed by level scripts. They scroll with the ground and are
 * drawn under ground enemies: top-down, lit from the upper-left, cast shadows to
 * the lower-right kept inside the sprite bounds, palettes matching the biome
 * backgrounds (see render/backgrounds).
 */
import { SUPERSAMPLE, defineSprite, type Painter } from './sprites'
import { rng } from '../core/math'
import { blob, hex, lut, path, rgba, smoothPath, type Ctx } from './backgrounds/kit'
import { mesa, pebble, pine, rockSprite, wreck, WRECK_PAL, type HullPal } from './backgrounds/motifs'
import { boneRib, organPipes } from './backgrounds/heart'
import { geoFlower } from './backgrounds/garden'

const TAU = Math.PI * 2
const SHADOW = 'rgba(40,24,30,0.32)'

function lg(x: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = x.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}
function rg(x: Ctx, cx: number, cy: number, r: number, stops: [number, string][], fx = cx, fy = cy) {
  const g = x.createRadialGradient(fx, fy, 0, cx, cy, r)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}
function disc(x: Ctx, cx: number, cy: number, r: number, fill: string | CanvasGradient) {
  x.fillStyle = fill
  x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill()
}
function box(x: Ctx, bx: number, by: number, bw: number, bh: number, fill: string | CanvasGradient, sh = 0, rr = 0) {
  if (sh) { x.fillStyle = SHADOW; x.beginPath(); x.roundRect(bx + sh * 0.7, by + sh, bw, bh, rr); x.fill() }
  x.fillStyle = fill
  x.beginPath(); x.roundRect(bx, by, bw, bh, rr); x.fill()
  x.fillStyle = 'rgba(255,255,255,0.35)'
  x.fillRect(bx + rr * 0.3, by, bw - rr * 0.6, 1)
  x.fillRect(bx, by + rr * 0.3, 1, bh - rr * 0.6)
  x.fillStyle = 'rgba(0,0,0,0.3)'
  x.fillRect(bx + rr * 0.3, by + bh - 1, bw - rr * 0.6, 1)
  x.fillRect(bx + bw - 1, by + rr * 0.3, 1, bh - rr * 0.6)
}
/** Vertical cylinder seen from above (tank, tower): lit disc + roof ring + shadow. */
function tank(x: Ctx, cx: number, cy: number, r: number, body = '#d8d2c4', sh = 1) {
  disc(x, cx + r * 0.5 * sh, cy + r * 0.65 * sh, r, SHADOW)
  disc(x, cx, cy, r, rg(x, cx, cy, r, [[0, '#fbf6ea'], [0.55, body], [1, '#8a8274']], cx - r * 0.4, cy - r * 0.4))
  x.strokeStyle = 'rgba(80,70,60,0.45)'
  x.lineWidth = 1
  x.beginPath(); x.arc(cx, cy, r * 0.72, 0, TAU); x.stroke()
  disc(x, cx + r * 0.1, cy + r * 0.1, r * 0.14, 'rgba(90,80,70,0.6)')
}
function hazard(x: Ctx, bx: number, by: number, bw: number, bh: number, a = '#b9a35e', b = '#34343a', step = 10) {
  x.save()
  x.beginPath(); x.rect(bx, by, bw, bh); x.clip()
  x.fillStyle = a
  x.fillRect(bx, by, bw, bh)
  x.strokeStyle = b
  x.lineWidth = step / 2.4
  for (let k = -bh; k < bw + bh; k += step) { x.beginPath(); x.moveTo(bx + k, by - 2); x.lineTo(bx + k - bh - 4, by + bh + 2); x.stroke() }
  x.restore()
}
function lamp(x: Ctx, cx: number, cy: number, r: number, col: string) {
  x.save()
  x.globalCompositeOperation = 'lighter'
  disc(x, cx, cy, r * 2.2, rg(x, cx, cy, r * 2.2, [[0, rgba(col, 0.55)], [1, rgba(col, 0)]]))
  x.restore()
  disc(x, cx, cy, r * 0.6, col)
}

// ───────────────────────────── cinder ─────────────────────────────

const rail: Painter = (x, w, h) => {
  const r = rng(11)
  x.fillStyle = 'rgba(70,45,35,0.25)'
  x.fillRect(0, 6, w, h - 3)
  x.fillStyle = '#8f7d6a'
  x.fillRect(0, 3, w, h - 7)
  // ballast: wraps at the tile edges so segments chain seamlessly
  for (let i = 0; i < 120; i++) {
    const px = r.range(0, w), py = r.range(4, h - 5), s = r.range(0.8, 1.8)
    x.fillStyle = r.chance(0.5) ? 'rgba(60,48,40,0.45)' : 'rgba(200,185,165,0.4)'
    for (const o of [0, -w, w]) x.fillRect(px + o, py, s, s)
  }
  for (let sx = 2; sx < w; sx += 10) {
    x.fillStyle = 'rgba(40,24,18,0.35)'
    x.fillRect(sx + 1, 5, 6, h - 8)
    x.fillStyle = '#6e5540'
    x.fillRect(sx, 4, 6, h - 9)
    x.fillStyle = 'rgba(255,230,200,0.18)'
    x.fillRect(sx, 4, 6, 1)
  }
  for (const ry of [8, 16]) {
    x.fillStyle = 'rgba(30,20,20,0.4)'
    x.fillRect(0, ry + 2, w, 2)
    x.fillStyle = '#6d7078'
    x.fillRect(0, ry, w, 2.4)
    x.fillStyle = '#d9dde3'
    x.fillRect(0, ry, w, 0.9)
  }
}

function pipeH(x: Ctx, w: number, y: number, d: number) {
  x.fillStyle = 'rgba(60,35,30,0.3)'
  x.fillRect(0, y + d * 0.55, w, d * 0.7)
  // supports every 35px, flanges every 70 (both divide the tile)
  for (let sx = 17.5; sx < w; sx += 35) {
    x.fillStyle = '#6d5a4a'
    x.fillRect(sx - 3, y - 2, 6, d + 4)
  }
  x.fillStyle = lg(x, 0, y, 0, y + d, [[0, '#f0e6d4'], [0.35, '#c9b89c'], [1, '#6f604e']])
  x.fillRect(0, y, w, d)
  for (let fx = 35; fx < w; fx += 70) {
    x.fillStyle = lg(x, 0, y - 1.5, 0, y + d + 1.5, [[0, '#e8dcc6'], [1, '#5e5040']])
    x.fillRect(fx - 2.5, y - 1.5, 5, d + 3)
  }
  x.fillStyle = 'rgba(160,80,40,0.25)'
  x.fillRect(0, y + d * 0.7, w, 1.2)
}
const pipelineH: Painter = (x, w) => pipeH(x, w, 4, 9)
const pipelineV: Painter = (x, w, h) => {
  x.save()
  x.translate(w, 0)
  x.rotate(Math.PI / 2)
  // rotated frame: light must still come from the upper-left → mirror the gradient
  x.scale(1, -1)
  x.translate(0, -w)
  pipeH(x, h, 4, 9)
  x.restore()
}

const refinery: Painter = (x, w, h) => {
  const r = rng(21)
  // concrete pad with stains
  box(x, 8, 8, w - 20, h - 20, '#b9ab94', 8, 4)
  for (let i = 0; i < 8; i++) disc(x, r.range(20, w - 30), r.range(20, h - 30), r.range(6, 16), 'rgba(80,65,50,0.12)')
  x.strokeStyle = 'rgba(90,75,60,0.35)'
  x.lineWidth = 1
  for (let gx = 8; gx < w - 12; gx += 30) { x.beginPath(); x.moveTo(gx, 8); x.lineTo(gx, h - 12); x.stroke() }
  // pipe rack
  x.fillStyle = 'rgba(50,35,30,0.3)'
  x.fillRect(22, 78, w - 50, 12)
  for (let k = 0; k < 4; k++) {
    x.fillStyle = ['#c9b89c', '#9aa9a8', '#c29372', '#b8b0a0'][k]
    x.fillRect(18, 72 + k * 3, w - 50, 2.4)
  }
  // distillation columns: tall → long shadows
  for (const [cx, cy, rr] of [[40, 40, 14], [72, 34, 10], [98, 44, 12]] as const) {
    x.fillStyle = SHADOW
    x.beginPath(); x.moveTo(cx - rr * 0.7, cy + rr * 0.7); x.lineTo(cx + rr * 0.7, cy - rr * 0.7); x.lineTo(cx + rr * 2.2, cy + rr * 1.6); x.lineTo(cx + rr * 0.8, cy + rr * 3); x.closePath(); x.fill()
    tank(x, cx, cy, rr, '#d6cfbf', 0)
    x.strokeStyle = 'rgba(70,60,50,0.6)'
    x.beginPath(); x.arc(cx, cy, rr * 1.15, -0.4, 1.4); x.stroke()
  }
  // storage spheres and a tank row
  for (const [cx, cy] of [[140, 36], [164, 60]]) tank(x, cx, cy, 13, '#e2dccf')
  for (let k = 0; k < 3; k++) tank(x, 40 + k * 32, 112, 12, '#cfc5b0')
  // control building
  box(x, 128, 96, 44, 28, lg(x, 128, 96, 172, 124, [[0, '#e9e1d2'], [1, '#a59a88']]), 5, 2)
  x.fillStyle = 'rgba(60,110,120,0.7)'
  for (let k = 0; k < 5; k++) x.fillRect(132 + k * 8, 100, 5, 3)
  hazard(x, 128, 120, 44, 4)
  // flare: warm glow, not too bright
  lamp(x, 112, 18, 3.5, '#ffb070')
}

const tankFarm: Painter = (x, w, h) => {
  box(x, 4, 4, w - 14, h - 14, '#b3a58d', 6, 3)
  x.strokeStyle = 'rgba(110,90,70,0.7)'
  x.lineWidth = 2
  x.strokeRect(10, 10, w - 26, h - 26)
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) tank(x, 32 + col * 40, 34 + row * 40, 15, row ? '#cfc6b3' : '#ddd6c6')
  x.fillStyle = '#8f8676'
  x.fillRect(10, h / 2 - 7, w - 26, 3)
  x.fillStyle = 'rgba(255,255,255,0.4)'
  x.fillRect(10, h / 2 - 7, w - 26, 1)
}

const mesaProp: Painter = (x, w, h) => mesa(x, w * 0.42, h * 0.42, w * 0.32, h * 0.3, 4242, 0.9)

const pad: Painter = (x, w, h) => {
  const cx = w / 2 - 3, cy = h / 2 - 3, R = w * 0.42
  const oct = (rr: number, dx = 0, dy = 0) => {
    x.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + TAU / 16
      if (i === 0) x.moveTo(cx + dx + Math.cos(a) * rr, cy + dy + Math.sin(a) * rr)
      else x.lineTo(cx + dx + Math.cos(a) * rr, cy + dy + Math.sin(a) * rr)
    }
    x.closePath()
  }
  x.fillStyle = SHADOW; oct(R, 4, 5); x.fill()
  x.fillStyle = lg(x, 0, 0, w, h, [[0, '#c9c2b4'], [1, '#8e8678']]); oct(R); x.fill()
  x.strokeStyle = 'rgba(240,235,220,0.65)'
  x.lineWidth = 2
  x.beginPath(); x.arc(cx, cy, R * 0.62, 0, TAU); x.stroke()
  x.fillStyle = 'rgba(230,190,110,0.75)'
  x.fillRect(cx - 9, cy - 11, 4, 22); x.fillRect(cx + 5, cy - 11, 4, 22); x.fillRect(cx - 5, cy - 2, 10, 4)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + TAU / 16
    lamp(x, cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, 1.6, i % 2 ? '#9fe8d8' : '#f0d8a0')
  }
}

const flareStack: Painter = (x, w, h) => {
  const cx = w * 0.4, cy = h * 0.4
  // a tall stack: long shadow toward the lower-right
  x.strokeStyle = 'rgba(40,24,30,0.3)'
  x.lineWidth = 7
  x.beginPath(); x.moveTo(cx, cy); x.lineTo(w - 3, h - 3); x.stroke()
  disc(x, cx, cy, 9, rg(x, cx, cy, 9, [[0, '#e9e0d0'], [0.7, '#a89a86'], [1, '#5c5044']], cx - 3, cy - 3))
  disc(x, cx, cy, 5.5, '#2a211c')
  x.save()
  x.globalCompositeOperation = 'lighter'
  disc(x, cx, cy, 14, rg(x, cx, cy, 14, [[0, 'rgba(255,200,120,0.75)'], [0.4, 'rgba(255,130,60,0.35)'], [1, 'rgba(255,90,40,0)']]))
  x.restore()
}

// ───────────────────────────── glasswater ─────────────────────────────

function island(x: Ctx, w: number, h: number, seed: number, trees: number) {
  const r = rng(seed)
  const cx = w * 0.48, cy = h * 0.48
  const rx = w * 0.36, ry = h * 0.34
  const shore = blob(cx, cy, rx, ry, seed, 0.3)
  // shallows and surf halo
  x.fillStyle = 'rgba(130,225,205,0.45)'; smoothPath(x, blob(cx, cy, rx * 1.3, ry * 1.3, seed, 0.3)); x.fill()
  x.strokeStyle = 'rgba(240,255,250,0.7)'; x.lineWidth = 2; smoothPath(x, shore.map(([u, v]) => [cx + (u - cx) * 1.08, cy + (v - cy) * 1.08])); x.stroke()
  x.fillStyle = lg(x, cx - rx, cy - ry, cx + rx, cy + ry, [[0, '#f3e6bf'], [1, '#cdb88a']]); smoothPath(x, shore); x.fill()
  // vegetation and rocks inland
  const inner = blob(cx - 2, cy - 2, rx * 0.66, ry * 0.62, seed + 1, 0.35)
  x.fillStyle = 'rgba(40,70,40,0.35)'; smoothPath(x, inner, 3, 4); x.fill()
  x.fillStyle = lg(x, cx - rx, cy - ry, cx + rx, cy + ry, [[0, '#7fa35c'], [1, '#3f6a3e']]); smoothPath(x, inner); x.fill()
  for (let i = 0; i < trees; i++) {
    const a = r.range(0, TAU), d = Math.sqrt(r.next()) * 0.6
    pine(x, cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, r.range(4, 7), r.int(1, 1e6), '#2f5a36', '#6d9a4e', 0)
  }
  for (let i = 0; i < trees / 3; i++) pebble(x, cx + r.range(-rx, rx) * 0.8, cy + r.range(-ry, ry) * 0.8, r.range(2, 4), r.int(1, 1e6), '#b3ab98', '#6d675a', 'rgba(40,50,40,0.3)')
}
const islandS: Painter = (x, w, h) => island(x, w, h, 71, 7)
const islandL: Painter = (x, w, h) => {
  island(x, w, h, 73, 26)
  // jetty and a hut
  x.fillStyle = 'rgba(20,50,60,0.3)'; x.fillRect(w * 0.72 + 3, h * 0.55 + 3, 50, 5)
  x.fillStyle = '#8a6e52'; x.fillRect(w * 0.72, h * 0.55, 50, 5)
  box(x, w * 0.56, h * 0.44, 18, 14, '#b28a66', 3, 2)
}

const oilRig: Painter = x => {
  const r = rng(31)
  // legs in the water with foam rings
  for (const [lx, ly] of [[30, 30], [130, 30], [30, 130], [130, 130]]) {
    disc(x, lx + 10, ly + 12, 10, 'rgba(10,40,50,0.35)')
    x.strokeStyle = 'rgba(235,255,250,0.6)'; x.lineWidth = 1.5
    x.beginPath(); x.arc(lx, ly, 10, 0, TAU); x.stroke()
    disc(x, lx, ly, 7, '#5a5f66')
  }
  // deck (shadow on the water first)
  x.fillStyle = 'rgba(10,40,50,0.4)'; x.fillRect(34, 36, 124, 124)
  box(x, 22, 22, 124, 124, lg(x, 22, 22, 146, 146, [[0, '#b8bcc2'], [1, '#6f747c']]), 0, 3)
  x.strokeStyle = 'rgba(40,44,50,0.4)'; x.lineWidth = 1
  for (let gx = 22; gx < 146; gx += 12) { x.beginPath(); x.moveTo(gx, 22); x.lineTo(gx, 146); x.stroke() }
  // helipad
  disc(x, 56, 56, 22, '#4a5058')
  x.strokeStyle = 'rgba(230,220,180,0.8)'; x.lineWidth = 2
  x.beginPath(); x.arc(56, 56, 18, 0, TAU); x.stroke()
  x.fillStyle = 'rgba(230,220,180,0.8)'
  x.fillRect(49, 47, 3, 18); x.fillRect(60, 47, 3, 18); x.fillRect(52, 54, 8, 3)
  // derrick lattice (tall → shadow)
  x.strokeStyle = 'rgba(10,40,50,0.35)'; x.lineWidth = 8
  x.beginPath(); x.moveTo(112, 70); x.lineTo(162, 128); x.stroke()
  x.strokeStyle = '#c9a15c'; x.lineWidth = 1.5
  x.strokeRect(100, 58, 24, 24)
  x.beginPath(); x.moveTo(100, 58); x.lineTo(124, 82); x.moveTo(124, 58); x.lineTo(100, 82); x.stroke()
  disc(x, 112, 70, 4, '#e0c080')
  // crane arm
  x.strokeStyle = '#a58a4e'; x.lineWidth = 4
  x.beginPath(); x.moveTo(40, 120); x.lineTo(100, 150); x.stroke()
  disc(x, 40, 120, 7, '#8a8e94')
  // containers
  for (let i = 0; i < 5; i++) box(x, 70 + (i % 3) * 22, 100 + Math.floor(i / 3) * 14, 20, 11, r.pick(['#8a5a48', '#4f7a80', '#9a8a58', '#6a6e78']), 2, 1)
  lamp(x, 22, 22, 2, '#ff8a70'); lamp(x, 146, 146, 2, '#ff8a70')
}

const buoy: Painter = (x, w, h) => {
  disc(x, w / 2 + 1.5, h / 2 + 2, 4.5, 'rgba(10,40,50,0.35)')
  x.strokeStyle = 'rgba(240,255,250,0.6)'; x.lineWidth = 1
  x.beginPath(); x.arc(w / 2, h / 2, 6, 0, TAU); x.stroke()
  disc(x, w / 2, h / 2, 4.5, rg(x, w / 2, h / 2, 4.5, [[0, '#ffb09a'], [1, '#b44a3a']], w / 2 - 1.5, h / 2 - 1.5))
  disc(x, w / 2, h / 2, 1.6, '#f4efe4')
}

const carrier: Painter = (x, w, h) => {
  const r = rng(99)
  const cx = w * 0.47
  const hull = () => {
    x.beginPath()
    x.moveTo(cx, 6)
    x.bezierCurveTo(cx + 70, 40, cx + 120, 130, cx + 122, 220)
    x.lineTo(cx + 124, h - 40); x.lineTo(cx + 110, h - 10); x.lineTo(cx - 110, h - 10); x.lineTo(cx - 124, h - 40)
    x.lineTo(cx - 122, 220)
    x.bezierCurveTo(cx - 120, 130, cx - 70, 40, cx, 6)
    x.closePath()
  }
  // shadow on the water
  x.save(); x.translate(12, 10); x.fillStyle = 'rgba(5,35,45,0.4)'; hull(); x.fill(); x.restore()
  x.fillStyle = lg(x, 0, 0, w, 0, [[0, '#7a8088'], [0.5, '#5d636b'], [1, '#474c54']]); hull(); x.fill()
  x.save(); hull(); x.clip()
  // deck plates, weathered
  x.fillStyle = '#50565e'
  x.fillRect(cx - 108, 60, 216, h - 80)
  x.strokeStyle = 'rgba(30,34,40,0.35)'; x.lineWidth = 1
  for (let y = 60; y < h; y += 22) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke() }
  for (let i = 0; i < 26; i++) disc(x, r.range(20, w - 20), r.range(40, h - 30), r.range(8, 30), rgba(r.chance(0.5) ? '#6b5040' : '#2e3238', r.range(0.12, 0.25)))
  // angled runway and faded markings
  x.save()
  x.translate(cx - 10, h * 0.62)
  x.rotate(-0.16)
  x.fillStyle = 'rgba(40,44,50,0.5)'; x.fillRect(-46, -h * 0.55, 92, h * 0.75)
  x.fillStyle = 'rgba(225,220,200,0.45)'
  for (let y = -h * 0.55; y < h * 0.2; y += 30) x.fillRect(-2, y, 4, 16)
  x.fillStyle = 'rgba(210,180,90,0.45)'
  x.fillRect(-46, -h * 0.55, 3, h * 0.75); x.fillRect(43, -h * 0.55, 3, h * 0.75)
  x.restore()
  // bow numbers block and catapult tracks
  x.fillStyle = 'rgba(225,220,200,0.4)'
  x.fillRect(cx - 20, 90, 14, 24); x.fillRect(cx + 4, 90, 14, 24)
  x.fillStyle = 'rgba(30,34,40,0.6)'
  x.fillRect(cx - 40, 130, 3, 150); x.fillRect(cx + 34, 130, 3, 150)
  // elevators
  for (const ey of [320, 520]) { x.fillStyle = '#464b53'; x.fillRect(cx - 118, ey, 40, 50); x.strokeStyle = 'rgba(210,180,90,0.4)'; x.strokeRect(cx - 118, ey, 40, 50) }
  // abandoned aircraft, folded wings
  for (let i = 0; i < 6; i++) {
    const px = cx + r.range(-70, 60), py = r.range(380, h - 80), a = r.range(-0.5, 0.5)
    x.save(); x.translate(px, py); x.rotate(a)
    x.fillStyle = 'rgba(10,20,30,0.35)'; x.fillRect(-2, -10, 7, 26)
    x.fillStyle = '#8c939b'; x.fillRect(-3, -12, 6, 24); x.fillRect(-10, -2, 20, 5); x.fillRect(-6, 9, 12, 3)
    x.restore()
  }
  x.restore()
  // island superstructure on the starboard edge (tall → long shadow)
  const ix = cx + 88, iy = h * 0.45
  x.fillStyle = 'rgba(10,20,30,0.45)'; x.fillRect(ix + 10, iy + 14, 30, 120)
  box(x, ix, iy, 30, 120, lg(x, ix, iy, ix + 30, iy + 120, [[0, '#b9bec6'], [1, '#6d737b']]), 0, 3)
  x.fillStyle = 'rgba(40,60,70,0.8)'
  for (let k = 0; k < 6; k++) x.fillRect(ix + 4, iy + 10 + k * 16, 22, 4)
  disc(x, ix + 15, iy + 70, 9, '#8e959d')
  x.strokeStyle = '#d6dbe0'; x.lineWidth = 1.5
  x.beginPath(); x.moveTo(ix + 6, iy + 70); x.lineTo(ix + 24, iy + 70); x.stroke()
  // rust bleeding from the hull edge
  x.save(); hull(); x.clip()
  for (let i = 0; i < 30; i++) {
    const side = r.chance(0.5) ? -1 : 1
    const py = r.range(120, h - 30)
    x.fillStyle = rgba('#8a4a2a', r.range(0.2, 0.4))
    x.fillRect(cx + side * r.range(112, 124) - 2, py, 3, r.range(8, 30))
  }
  x.restore()
  x.strokeStyle = 'rgba(210,215,222,0.5)'; x.lineWidth = 1.5
  x.beginPath(); x.moveTo(cx, 6); x.bezierCurveTo(cx - 70, 40, cx - 120, 130, cx - 122, 220); x.lineTo(cx - 124, h - 40); x.stroke()
}

const reef: Painter = (x, w, h) => {
  const r = rng(61)
  for (let i = 0; i < 38; i++) {
    const px = r.range(14, w - 14), py = r.range(10, h - 10)
    const d = Math.hypot((px - w / 2) / (w / 2), (py - h / 2) / (h / 2))
    if (d > 1) continue
    const s = r.range(4, 11) * (1.2 - d * 0.5)
    const col = r.pick(['#5f8f7c', '#8c6a70', '#6e7f5a', '#9a7a62', '#4c7a78'])
    x.fillStyle = rgba(col, 0.75)
    smoothPath(x, blob(px, py, s, s * 0.8, r.int(1, 1e6), 0.4, 12))
    x.fill()
    x.fillStyle = 'rgba(220,255,240,0.18)'
    disc(x, px - s * 0.3, py - s * 0.3, s * 0.35, 'rgba(220,255,240,0.18)')
  }
}

// ───────────────────────────── rime ─────────────────────────────

const dome: Painter = (x, w, h) => {
  const cx = w * 0.46, cy = h * 0.46, R = w * 0.38
  disc(x, cx + 8, cy + 10, R + 2, 'rgba(60,80,120,0.3)')
  disc(x, cx, cy, R + 5, '#8e9aa6')
  disc(x, cx, cy, R, rg(x, cx, cy, R, [[0, 'rgba(230,245,255,0.95)'], [0.5, 'rgba(150,190,215,0.9)'], [1, 'rgba(70,100,130,0.95)']], cx - R * 0.4, cy - R * 0.4))
  // warm interior light through the glass
  disc(x, cx + 6, cy + 6, R * 0.5, rg(x, cx + 6, cy + 6, R * 0.5, [[0, 'rgba(255,210,150,0.35)'], [1, 'rgba(255,210,150,0)']]))
  x.save()
  x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.clip()
  x.strokeStyle = 'rgba(60,80,100,0.45)'; x.lineWidth = 1
  for (let i = 1; i < 4; i++) { x.beginPath(); x.arc(cx, cy, (R * i) / 4, 0, TAU); x.stroke() }
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); x.stroke() }
  // snow cap on the upper-left
  x.fillStyle = 'rgba(245,250,255,0.85)'
  x.beginPath(); x.ellipse(cx - R * 0.45, cy - R * 0.5, R * 0.55, R * 0.3, -0.7, 0, TAU); x.fill()
  x.restore()
  x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2
  x.beginPath(); x.arc(cx, cy, R - 2, Math.PI * 1.05, Math.PI * 1.55); x.stroke()
  lamp(x, cx + R + 2, cy, 2, '#ff8a70'); lamp(x, cx - R - 2, cy, 2, '#8affd0')
}

const hab: Painter = (x, w, h) => {
  const bx = 6, by = 8, bw = w - 18, bh = h - 22
  x.fillStyle = 'rgba(60,80,120,0.3)'; x.beginPath(); x.roundRect(bx + 7, by + 9, bw, bh, bh / 2); x.fill()
  x.fillStyle = lg(x, 0, by, 0, by + bh, [[0, '#dfe3e8'], [0.5, '#aeb6c0'], [1, '#6c7582']])
  x.beginPath(); x.roundRect(bx, by, bw, bh, bh / 2); x.fill()
  x.strokeStyle = 'rgba(60,70,85,0.45)'; x.lineWidth = 1
  for (let k = bx + bh / 2; k < bx + bw - bh / 2; k += 12) { x.beginPath(); x.moveTo(k, by); x.lineTo(k, by + bh); x.stroke() }
  x.fillStyle = 'rgba(255,215,160,0.7)'
  for (let k = bx + bh / 2 + 3; k < bx + bw - bh / 2 - 4; k += 12) x.fillRect(k, by + bh * 0.66, 5, 3)
  x.fillStyle = 'rgba(245,250,255,0.85)'
  x.beginPath(); x.ellipse(bx + bw * 0.3, by + bh * 0.25, bw * 0.22, bh * 0.16, 0, 0, TAU); x.fill()
  box(x, bx + bw * 0.6, by - 4, 14, 8, '#8e98a4', 0, 1)
}

const antenna: Painter = (x, w, h) => {
  const cx = w * 0.42, cy = h * 0.42
  x.strokeStyle = 'rgba(60,80,120,0.3)'; x.lineWidth = 3
  x.beginPath(); x.moveTo(cx, cy); x.lineTo(w - 2, h - 2); x.stroke()
  disc(x, cx + 5, cy + 6, 13, 'rgba(60,80,120,0.25)')
  disc(x, cx, cy, 13, rg(x, cx, cy, 13, [[0, '#f4f7fa'], [0.7, '#b9c3cf'], [1, '#6f7a88']], cx + 4, cy + 4))
  x.strokeStyle = 'rgba(70,80,95,0.6)'; x.lineWidth = 1
  x.beginPath(); x.arc(cx, cy, 9, 0, TAU); x.stroke()
  x.strokeStyle = '#6f7a88'; x.lineWidth = 1.5
  for (const a of [0.3, 2.4, 4.4]) { x.beginPath(); x.moveTo(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12); x.lineTo(cx - 2, cy - 2); x.stroke() }
  disc(x, cx - 2, cy - 2, 2.2, '#3a4250')
  lamp(x, cx - 2, cy - 2, 1.2, '#ff8a70')
}

const iceRidge: Painter = (x, w, h) => {
  const r = rng(81)
  const shards: [number, number, number, number][] = []
  for (let i = 0; i < 26; i++) {
    const t = i / 25
    shards.push([14 + t * (w - 40), h * 0.45 + Math.sin(t * 5) * 8 + r.range(-8, 8), r.range(8, 18), r.range(0, TAU)])
  }
  for (const [sx, sy, s, a] of shards) {
    const pts = [0, 1, 2, 3, 4].map(k => [sx + Math.cos(a + k * 1.3) * s * r.range(0.6, 1), sy + Math.sin(a + k * 1.3) * s * 0.7 * r.range(0.6, 1)] as [number, number])
    x.fillStyle = 'rgba(60,90,130,0.28)'; path(x, pts, s * 0.6, s * 0.7); x.fill()
  }
  for (const [sx, sy, s, a] of shards) {
    const pts = [0, 1, 2, 3, 4].map(k => [sx + Math.cos(a + k * 1.3) * s, sy + Math.sin(a + k * 1.3) * s * 0.7] as [number, number])
    x.fillStyle = lg(x, sx - s, sy - s, sx + s, sy + s, [[0, '#f2f8fc'], [0.5, '#b7d6e8'], [1, '#6f9ab8']])
    path(x, pts); x.fill()
    x.strokeStyle = 'rgba(255,255,255,0.6)'; x.lineWidth = 1
    x.beginPath(); x.moveTo(pts[0][0], pts[0][1]); x.lineTo(sx, sy); x.stroke()
  }
}

const ICE_PAL: HullPal = { light: '#9aa8b4', mid: '#6c7a88', dark: '#3c4652', rim: '#e8f2fa', line: 'rgba(30,40,55,0.45)', window: 'rgba(40,50,60,0.5)' }
const frozenShip: Painter = (x, w, h) => {
  // ice sheet the hull is locked into
  x.fillStyle = 'rgba(160,200,225,0.55)'
  smoothPath(x, blob(w / 2, h / 2, w * 0.48, h * 0.48, 91, 0.12))
  x.fill()
  x.strokeStyle = 'rgba(240,250,255,0.6)'; x.lineWidth = 1
  const r = rng(92)
  for (let i = 0; i < 10; i++) {
    let px = r.range(10, w - 10), py = r.range(10, h - 10)
    x.beginPath(); x.moveTo(px, py)
    for (let k = 0; k < 5; k++) { px += r.range(-14, 14); py += r.range(-14, 14); x.lineTo(px, py) }
    x.stroke()
  }
  x.save()
  x.translate(w * 0.14, h * 0.06)
  x.rotate(0.06)
  wreck(x, w * 0.72, h * 0.86, 93, ICE_PAL)
  x.restore()
  // snow drifts over the deck
  for (let i = 0; i < 9; i++) {
    x.fillStyle = `rgba(240,246,252,${r.range(0.5, 0.85)})`
    x.beginPath(); x.ellipse(w / 2 + r.range(-25, 25), r.range(30, h - 30), r.range(8, 20), r.range(5, 12), r.range(-0.5, 0.5), 0, TAU); x.fill()
  }
}

// ───────────────────────────── shoals ─────────────────────────────

const RIG_ROCK = lut([[0, '#15121f'], [0.4, '#332d44'], [0.8, '#5c5470'], [1, '#807896']])
const miningRig: Painter = (x, _w, h) => {
  const rock = rockSprite(170 * SUPERSAMPLE, 5151, RIG_ROCK, 6, hex('#7d78a8'))
  x.drawImage(rock, 0, h - 170 + 6, 170, 170)
  const cx = 120, cy = 76
  // arms reaching into the rock
  x.strokeStyle = '#6d6a78'; x.lineWidth = 6
  for (const [ax, ay] of [[60, 120], [90, 150], [40, 90]]) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(ax, ay); x.stroke() }
  x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 1.5
  for (const [ax, ay] of [[60, 120], [90, 150], [40, 90]]) { x.beginPath(); x.moveTo(cx - 2, cy - 2); x.lineTo(ax - 2, ay - 2); x.stroke() }
  // solar wings
  for (const s of [-1, 1]) {
    const px = cx + s * 62
    x.fillStyle = '#1f2a48'; x.fillRect(px - 26, cy - 14, 52, 28)
    x.strokeStyle = 'rgba(120,160,220,0.5)'; x.lineWidth = 1
    for (let k = -20; k <= 20; k += 8) { x.beginPath(); x.moveTo(px + k, cy - 14); x.lineTo(px + k, cy + 14); x.stroke() }
    x.fillStyle = 'rgba(160,200,255,0.2)'; x.fillRect(px - 26, cy - 14, 52, 6)
  }
  x.fillStyle = '#8e8a98'; x.fillRect(cx - 40, cy - 3, 80, 6)
  // hub and drill head
  disc(x, cx, cy, 24, rg(x, cx, cy, 24, [[0, '#d8d4de'], [0.6, '#8f8a9c'], [1, '#4a4658']], cx - 8, cy - 8))
  disc(x, cx, cy, 12, '#3a3646')
  x.strokeStyle = '#c9a15c'; x.lineWidth = 2
  x.beginPath(); x.arc(cx, cy, 16, 0, TAU); x.stroke()
  hazard(x, cx - 10, cy + 26, 20, 5)
  lamp(x, cx - 20, cy - 18, 2, '#8affd0'); lamp(x, 64, 120, 2, '#8affd0'); lamp(x, cx + 24, cy + 14, 2, '#ffb070')
}

const conveyor: Painter = (x, w, h) => {
  const r = rng(71)
  x.fillStyle = 'rgba(0,0,0,0.3)'; x.fillRect(0, 5, w, h - 4)
  x.fillStyle = '#4c4858'; x.fillRect(0, 3, w, h - 6)
  x.fillStyle = '#2a2733'; x.fillRect(0, 6, w, h - 12)
  for (let k = 0; k < w; k += 10) { x.fillStyle = 'rgba(160,150,180,0.35)'; x.fillRect(k, 6, 1.5, h - 12) }
  // ore on the belt (wraps)
  for (let i = 0; i < 14; i++) {
    const px = r.range(0, w), s = r.range(2, 3.6)
    for (const o of [0, -w, w]) disc(x, px + o, h / 2 + r.range(-2, 2), s, r.pick(['#6c6480', '#8a7fa0', '#5c7a86']))
  }
  x.fillStyle = '#9a96a8'; x.fillRect(0, 2, w, 2); x.fillRect(0, h - 4, w, 2)
  x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(0, 2, w, 0.8)
}

const rockBg: Painter = (x, w, h) => {
  const s = Math.max(w, h)
  x.drawImage(rockSprite(s * SUPERSAMPLE, 6161, RIG_ROCK, 8, hex('#6f6aa0')), (w - s) / 2, (h - s) / 2, s, s)
}

// ───────────────────────────── halo ─────────────────────────────

function plate(x: Ctx, bx: number, by: number, bw: number, bh: number, tone = 190) {
  box(x, bx, by, bw, bh, `rgb(${tone},${tone + 5},${tone + 12})`)
}

const dockArm: Painter = (x, w, h) => {
  const cx = w * 0.45
  x.fillStyle = 'rgba(0,8,20,0.45)'; x.fillRect(cx - 22 + 10, 14, 44, h - 20)
  // truss spine
  plate(x, cx - 24, 0, 8, h - 10, 150); plate(x, cx + 16, 0, 8, h - 10, 150)
  x.strokeStyle = '#8a919c'; x.lineWidth = 3
  for (let y = 0; y < h - 30; y += 30) { x.beginPath(); x.moveTo(cx - 18, y); x.lineTo(cx + 18, y + 30); x.moveTo(cx + 18, y); x.lineTo(cx - 18, y + 30); x.stroke() }
  // clamp head
  box(x, cx - 44, h - 70, 88, 56, lg(x, 0, h - 70, 0, h - 14, [[0, '#d0d5dc'], [1, '#848b96']]), 8, 4)
  for (const s of [-1, 1]) box(x, cx + s * 44 - (s > 0 ? 0 : 16), h - 60, 16, 36, '#9aa1ac', 0, 2)
  hazard(x, cx - 40, h - 22, 80, 5)
  x.fillStyle = 'rgba(40,50,64,0.8)'; x.fillRect(cx - 16, h - 60, 32, 10)
  // spine lights
  for (let y = 20; y < h - 80; y += 40) lamp(x, cx - 20, y, 1.6, '#8affd0')
  lamp(x, cx - 44, h - 68, 2, '#ff8a70'); lamp(x, cx + 44, h - 68, 2, '#ff8a70')
  box(x, cx - 30, 0, 60, 16, '#b8bec7')
}

const hangarDoor: Painter = (x, w, h) => {
  box(x, 2, 2, w - 10, h - 10, '#8f96a2', 6, 3)
  hazard(x, 6, 6, w - 18, 6); hazard(x, 6, h - 18, w - 18, 6)
  const g = lg(x, 0, 12, 0, h - 18, [[0, '#6c737f'], [1, '#474d58']])
  x.fillStyle = g; x.fillRect(10, 12, w - 26, h - 30)
  x.strokeStyle = 'rgba(20,24,32,0.5)'; x.lineWidth = 1
  for (let k = 10; k < w - 16; k += 14) { x.beginPath(); x.moveTo(k, 12); x.lineTo(k, h - 18); x.stroke() }
  x.fillStyle = 'rgba(255,255,255,0.18)'
  for (let k = 11; k < w - 16; k += 14) x.fillRect(k, 12, 1, h - 30)
  // centre seam
  x.fillStyle = '#20242c'; x.fillRect(w / 2 - 5, 12, 2, h - 30)
  lamp(x, 12, 9, 1.8, '#ffb070'); lamp(x, w - 20, 9, 1.8, '#ffb070')
}

const girderH: Painter = (x, w, h) => {
  x.fillStyle = 'rgba(0,8,20,0.35)'; x.fillRect(0, 7, w, h - 4)
  x.strokeStyle = '#8a919c'; x.lineWidth = 2.5
  for (let k = 0; k < w; k += 20) { x.beginPath(); x.moveTo(k, 4); x.lineTo(k + 10, h - 6); x.lineTo(k + 20, 4); x.stroke() }
  plate(x, 0, 2, w, 5, 175)
  plate(x, 0, h - 8, w, 5, 160)
}

const lightStrip: Painter = (x, w, h) => {
  x.fillStyle = '#2b3038'; x.fillRect(0, 1, w, h - 2)
  x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, 1, w, 0.8)
  for (let k = 7; k < w; k += 14) lamp(x, k, h / 2, 1.4, k % 28 === 7 ? '#9fe8ff' : '#d8e8f0')
}

const hullBlock: Painter = (x, w) => {
  const r = rng(55)
  const s = w - 18
  x.fillStyle = 'rgba(0,8,20,0.4)'; x.fillRect(14, 16, s, s)
  box(x, 2, 2, s, s, '#c3c8d0', 0, 3)
  for (let py = 2; py < s; py += 32) for (let px = 2; px < s; px += 40) plate(x, px, py, Math.min(40, s + 2 - px), Math.min(32, s + 2 - py), 180 + r.int(-10, 10))
  box(x, 30, 30, 70, 50, '#d2d7de', 6, 2)
  x.fillStyle = 'rgba(255,226,170,0.55)'
  for (let wy = 38; wy < 74; wy += 9) for (let wx = 36; wx < 94; wx += 7) if (r.chance(0.7)) x.fillRect(wx, wy, 3, 4)
  disc(x, 120, 120, 24, '#9aa1ac'); disc(x, 120, 120, 16, '#6c737f')
  x.strokeStyle = 'rgba(255,255,255,0.5)'; x.lineWidth = 1.5
  x.beginPath(); x.arc(120, 120, 24, Math.PI * 0.9, Math.PI * 1.6); x.stroke()
  for (let k = 0; k < 3; k++) { x.fillStyle = '#6f7682'; x.fillRect(24, 110 + k * 16, 40, 9); x.fillStyle = '#3c424c'; for (let g = 0; g < 7; g++) x.fillRect(26 + g * 5.5, 112 + k * 16, 3, 5) }
  hazard(x, 2, s - 6, s, 6)
  lamp(x, 6, 6, 2, '#ff8a70'); lamp(x, s - 4, 6, 2, '#8affd0')
}

// ───────────────────────────── graveyard ─────────────────────────────

const wreckCruiser: Painter = (x, w, h) => {
  x.save(); x.translate(8, 10); x.globalAlpha = 0.4
  wreck(x, w - 12, h - 12, 2201, { ...WRECK_PAL, light: '#000', mid: '#000', dark: '#000', rim: 'rgba(0,0,0,0)', window: 'rgba(0,0,0,0)', line: 'rgba(0,0,0,0)' })
  x.restore()
  wreck(x, w - 12, h - 12, 2201)
}
const wreckFrigate: Painter = (x, w, h) => wreck(x, w - 6, h - 6, 2202)

const hullSection: Painter = (x, w, h) => {
  const r = rng(303)
  const pts = blob(w * 0.47, h * 0.47, w * 0.42, h * 0.38, 304, 0.22, 20).map(([u, v]) => [u + r.range(-6, 6), v + r.range(-6, 6)] as [number, number])
  x.fillStyle = 'rgba(0,6,6,0.45)'; path(x, pts, 6, 8); x.fill()
  x.fillStyle = lg(x, 0, 0, w, h, [[0, WRECK_PAL.light], [0.6, WRECK_PAL.mid], [1, WRECK_PAL.dark]]); path(x, pts); x.fill()
  x.save(); path(x, pts); x.clip()
  x.strokeStyle = WRECK_PAL.line; x.lineWidth = 1
  for (let y = 10; y < h; y += 16) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.stroke() }
  // torn opening with exposed ribs
  const hole = blob(w * 0.58, h * 0.5, w * 0.16, h * 0.18, 305, 0.4, 14)
  x.fillStyle = '#081010'; path(x, hole); x.fill()
  x.strokeStyle = WRECK_PAL.mid; x.lineWidth = 2.5
  for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(w * 0.58 + k * 9, h * 0.3); x.lineTo(w * 0.58 + k * 9 + 3, h * 0.7); x.stroke() }
  disc(x, w * 0.3, h * 0.35, 14, rg(x, w * 0.3, h * 0.35, 14, [[0, 'rgba(5,8,8,0.6)'], [1, 'rgba(5,8,8,0)']]))
  x.restore()
  x.strokeStyle = WRECK_PAL.rim; x.globalAlpha = 0.55; x.lineWidth = 1.5
  x.beginPath(); pts.slice(10, 17).forEach(([u, v], i) => (i ? x.lineTo(u, v) : x.moveTo(u, v))); x.stroke()
  x.globalAlpha = 1
  lamp(x, w * 0.2, h * 0.6, 1.8, '#ff5a4a')
}

// ───────────────────────────── heart ─────────────────────────────

const organ: Painter = (x, w, h) => organPipes(x, w * 0.46, h * 0.46, w * 0.42, 7007)
const rib: Painter = (x, w, h) => boneRib(x, 14, w - 24, h - 22, h - 42, 16, 7008)

const veinNode: Painter = (x, w, h) => {
  const cx = w * 0.46, cy = h * 0.46
  const r = rng(7009)
  x.lineCap = 'round'
  for (let i = 0; i < 7; i++) {
    let a = r.range(0, TAU), px = cx, py = cy
    x.strokeStyle = 'rgba(120,70,110,0.8)'
    x.lineWidth = 3
    x.beginPath(); x.moveTo(px, py)
    for (let k = 0; k < 6; k++) { a += r.range(-0.5, 0.5); px += Math.cos(a) * 5; py += Math.sin(a) * 5; x.lineTo(px, py) }
    x.stroke()
  }
  disc(x, cx + 4, cy + 5, 15, 'rgba(6,2,12,0.45)')
  disc(x, cx, cy, 15, rg(x, cx, cy, 15, [[0, '#e0a8c8'], [0.5, '#9a5a88'], [1, '#3e2448']], cx - 4, cy - 4))
  x.save()
  x.globalCompositeOperation = 'lighter'
  disc(x, cx, cy, 24, rg(x, cx, cy, 24, [[0, 'rgba(200,120,170,0.4)'], [1, 'rgba(200,120,170,0)']]))
  x.restore()
  x.strokeStyle = 'rgba(240,210,225,0.5)'; x.lineWidth = 1.5
  x.beginPath(); x.arc(cx, cy, 11, Math.PI * 1.0, Math.PI * 1.5); x.stroke()
}

const eye: Painter = (x, w, h) => {
  const cx = w * 0.48, cy = h * 0.47
  const rx = w * 0.44, ry = h * 0.4
  const r = rng(7010)
  // ridged socket rings
  for (let k = 3; k >= 0; k--) {
    const s = 1 + k * 0.07
    x.fillStyle = k % 2 ? '#2a1d3e' : '#3a2a50'
    x.beginPath(); x.ellipse(cx + 3, cy + 4, rx * s * 0.98, ry * s * 0.9, 0, 0, TAU); x.fill()
  }
  x.fillStyle = 'rgba(6,2,12,0.5)'; x.beginPath(); x.ellipse(cx + 6, cy + 8, rx * 0.95, ry * 0.8, 0, 0, TAU); x.fill()
  // lids: two bone-flesh arcs meeting in a closed seam
  const lid = (up: boolean) => {
    x.beginPath()
    x.moveTo(cx - rx, cy)
    x.quadraticCurveTo(cx, cy + (up ? -ry * 1.5 : ry * 1.5), cx + rx, cy)
    x.quadraticCurveTo(cx, cy + (up ? ry * 0.12 : -ry * 0.08), cx - rx, cy)
    x.closePath()
  }
  x.fillStyle = lg(x, cx, cy - ry, cx, cy, [[0, '#cbbba2'], [0.6, '#8f7a78'], [1, '#4a3450']]); lid(true); x.fill()
  x.fillStyle = lg(x, cx, cy, cx, cy + ry, [[0, '#5a4260'], [1, '#2a1c38']]); lid(false); x.fill()
  // lid folds
  x.strokeStyle = 'rgba(40,24,40,0.45)'; x.lineWidth = 1.2
  for (let k = 1; k <= 3; k++) {
    x.beginPath(); x.moveTo(cx - rx * (1 - k * 0.12), cy - 2); x.quadraticCurveTo(cx, cy - ry * (0.35 + k * 0.28), cx + rx * (1 - k * 0.12), cy - 2); x.stroke()
  }
  // lash-spines
  x.strokeStyle = '#d9ccb2'; x.lineWidth = 2
  for (let i = 0; i < 11; i++) {
    const t = i / 10
    const px = cx - rx * 0.85 + t * rx * 1.7
    const py = cy + Math.sin(t * Math.PI) * ry * 0.05
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + (t - 0.5) * 10, py + 8 + Math.sin(t * Math.PI) * 6 + r.range(-2, 2)); x.stroke()
  }
  // the seam leaks a thin, faint glow: something behind is awake
  x.save()
  x.globalCompositeOperation = 'lighter'
  x.strokeStyle = 'rgba(210,140,190,0.55)'; x.lineWidth = 2.5
  x.beginPath(); x.moveTo(cx - rx * 0.9, cy); x.quadraticCurveTo(cx, cy + ry * 0.04, cx + rx * 0.9, cy); x.stroke()
  x.strokeStyle = 'rgba(255,230,240,0.6)'; x.lineWidth = 0.8
  x.beginPath(); x.moveTo(cx - rx * 0.6, cy); x.quadraticCurveTo(cx, cy + ry * 0.03, cx + rx * 0.6, cy); x.stroke()
  x.restore()
  // veins converging on the corners
  x.strokeStyle = 'rgba(130,70,120,0.7)'; x.lineWidth = 1.6
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    let px = cx + s * rx, py = cy, a = s > 0 ? r.range(-0.6, 0.6) : Math.PI + r.range(-0.6, 0.6)
    x.beginPath(); x.moveTo(px, py)
    for (let k = 0; k < 4; k++) { a += r.range(-0.4, 0.4); px += Math.cos(a) * 4; py += Math.sin(a) * 4; x.lineTo(px, py) }
    x.stroke()
  }
}

// ───────────────────────────── garden ─────────────────────────────

const flower: Painter = (x, w, h) => geoFlower(x, w * 0.46, h * 0.46, w * 0.4, 8008)

const monolith: Painter = (x, w, h) => {
  // oblique slab: top face + south face, long shadow, glowing glyphs
  const tw = w * 0.62, th = 18
  const bx = 4, by = 6
  x.fillStyle = 'rgba(90,70,140,0.25)'
  x.beginPath(); x.moveTo(bx + tw, by + th); x.lineTo(w - 2, by + th + 26); x.lineTo(w - 2, h - 2); x.lineTo(bx + tw, h - 30); x.closePath(); x.fill()
  x.fillStyle = lg(x, 0, by + th, 0, h - 30, [[0, '#a898d6'], [1, '#7f70b4']])
  x.fillRect(bx, by + th, tw, h - 30 - by - th)
  x.fillStyle = lg(x, bx, by, bx + tw, by + th, [[0, '#f2ecff'], [1, '#cfc3f2']])
  x.fillRect(bx, by, tw, th)
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.fillRect(bx, by, tw, 1)
  x.fillStyle = 'rgba(60,40,110,0.3)'; x.fillRect(bx + tw - 2, by + th, 2, h - 30 - by - th)
  const r = rng(8009)
  for (let k = 0; k < 7; k++) {
    const gy = by + th + 10 + k * 13
    x.fillStyle = r.pick(['rgba(190,255,230,0.8)', 'rgba(255,220,240,0.8)'])
    x.fillRect(bx + 8 + r.range(0, 6), gy, r.range(6, tw - 22), 2)
    if (r.chance(0.5)) disc(x, bx + tw - 10, gy + 1, 2, 'rgba(190,255,230,0.8)')
  }
}

const PROPS: [string, number, number, Painter][] = [
  ['prop_rail', 140, 26, rail],
  ['prop_pipeline_h', 140, 18, pipelineH],
  ['prop_pipeline_v', 18, 140, pipelineV],
  ['prop_refinery', 190, 150, refinery],
  ['prop_tank_farm', 150, 110, tankFarm],
  ['prop_mesa', 200, 160, mesaProp],
  ['prop_pad', 90, 90, pad],
  ['prop_flare_stack', 40, 40, flareStack],
  ['prop_island_s', 120, 90, islandS],
  ['prop_island_l', 260, 200, islandL],
  ['prop_oil_rig', 170, 170, oilRig],
  ['prop_buoy', 14, 14, buoy],
  ['prop_carrier_deck', 300, 760, carrier],
  ['prop_reef', 160, 60, reef],
  ['prop_dome', 120, 120, dome],
  ['prop_hab', 90, 60, hab],
  ['prop_antenna', 40, 40, antenna],
  ['prop_ice_ridge', 220, 70, iceRidge],
  ['prop_frozen_ship', 120, 260, frozenShip],
  ['prop_mining_rig', 220, 180, miningRig],
  ['prop_conveyor', 140, 20, conveyor],
  ['prop_rock_bg', 160, 140, rockBg],
  ['prop_dock_arm', 120, 300, dockArm],
  ['prop_hangar_door', 140, 80, hangarDoor],
  ['prop_girder_h', 140, 24, girderH],
  ['prop_light_strip', 140, 8, lightStrip],
  ['prop_hull_block', 180, 180, hullBlock],
  ['prop_wreck_cruiser', 220, 520, wreckCruiser],
  ['prop_wreck_frigate', 120, 260, wreckFrigate],
  ['prop_hull_section', 160, 120, hullSection],
  ['prop_organ', 140, 140, organ],
  ['prop_rib', 320, 90, rib],
  ['prop_vein_node', 70, 70, veinNode],
  ['prop_eye', 200, 120, eye],
  ['prop_flower', 80, 80, flower],
  ['prop_monolith', 60, 140, monolith],
]

export const PROP_NAMES: readonly string[] = PROPS.map(p => p[0])

export function registerProps(): void {
  for (const [key, w, h, paint] of PROPS) defineSprite(key, w, h, paint)
}
