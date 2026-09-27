/** Sprites specific to mission m2: TIDEBREAKER, the leviathan submarine. Bow points DOWN. */
import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, bronzeMetal, choirMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, rivets, stripes, grille, gloss, glowLine, type Ctx, type PathFn } from './art/kit'

const HAZ = '#f2c230'
const hullFill = (c: Ctx, w: number) => lin(c, 0, 0, w, 0, [[0, '#6f7890'], [0.3, '#454c62'], [0.75, '#262a38'], [1, '#12141c']])
const deckFill = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#56607a'], [0.5, '#363c4e'], [1, '#1d212c']])

/** Hull outline in a 170×380 box (centre 85,190). Stern (top) is blunt with fins, bow (bottom) is a ram. */
const HULL_W = 170, HULL_H = 380
const hullPath = (cx: number): PathFn => sym(cx, [[0, 18], [22, 20], [44, 40], [60, 86], [66, 150], [66, 250], [60, 302], [44, 346], [18, 372], [0, 378, 1]])
const deckPath = (cx: number): PathFn => sym(cx, [[0, 30], [18, 32], [36, 50], [50, 92], [54, 150], [54, 248], [48, 296], [34, 334], [12, 358], [0, 362, 1]])

function hull(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // stern fins + twin screws
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 14, 30], [cx + s * 78, 6], [cx + s * 82, 16], [cx + s * 40, 52]]), choirMetal(c, w, 60), { lw: 1.3, rim: 0.4 })
    shape(c, ellipseFn(cx + s * 22, 12, 9, 6), '#1b1d26', { lw: 1.1, rim: 0.2, shade: 0 })
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + (s > 0 ? 0.5 : 0)
      c.save(); c.strokeStyle = PAL.bronzeLight; c.lineWidth = 2
      c.beginPath(); c.moveTo(cx + s * 22, 12); c.lineTo(cx + s * 22 + Math.cos(a) * 8, 12 + Math.sin(a) * 5); c.stroke(); c.restore()
    }
  }
  shape(c, polyFn([[cx - 5, 0], [cx + 5, 0], [cx + 4, 30], [cx - 4, 30]]), PAL.gunDark, { lw: 1.1, rim: 0.3 })
  // pressure hull
  const H = hullPath(cx)
  shape(c, H, hullFill(c, w), { lw: 2, rim: 0.45 })
  gloss(c, H, cx - 30, 120, 90, 0.18)
  // barnacle crust + rust bloom along the waterline (abandoned, repurposed)
  c.save(); H(c); c.clip()
  for (let i = 0; i < 70; i++) {
    const y = 40 + ((i * 53) % 330), side = i % 2 ? 1 : -1
    const x = cx + side * (52 + ((i * 17) % 13))
    c.fillStyle = i % 3 ? 'rgba(120,90,60,0.35)' : 'rgba(210,220,210,0.18)'
    c.beginPath(); c.arc(x, y, 1.5 + (i % 4), 0, Math.PI * 2); c.fill()
  }
  c.restore()
  // deck plating
  const D = deckPath(cx)
  shape(c, D, deckFill(c, w, h), { lw: 1.2, rim: 0.3, shade: 0.45 })
  c.save(); D(c); c.clip()
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.7
  c.beginPath()
  for (let y = 40; y < h; y += 14) { c.moveTo(cx - 60, y); c.lineTo(cx + 60, y) }
  c.stroke()
  c.restore()
  // central keel seam where the hull splits in phase 2
  seams(c, [[cx, 34, cx, 356]], 'rgba(0,0,0,0.7)', 1.6)
  seams(c, [[cx + 1, 34, cx + 1, 356]], 'rgba(255,255,255,0.12)', 0.6)
  // core bay: clamped doors across the keel (y 200..262)
  for (const s of [-1, 1]) {
    const door = polyFn([[cx, 196], [cx + s * 30, 202], [cx + s * 32, 258], [cx, 264]])
    shape(c, door, bronzeMetal(c, w, h), { lw: 1.2, rim: 0.4, shade: 0.4 })
    rivets(c, [[cx + s * 26, 208], [cx + s * 27, 230], [cx + s * 27, 252]], 0.9)
  }
  stripes(c, rrFn(cx - 4, 198, 8, 64, 1), HAZ, PAL.ink, 2.2, 0.8, 0.8)
  // mounting rings for parts (tower ~170, vls ~80, tubes ~310 at ±34)
  for (const [x, y, r] of [[cx, 170, 26], [cx, 80, 30], [cx - 34, 310, 20], [cx + 34, 310, 20]] as const) {
    shape(c, ellipseFn(x, y, r, r * 0.95), '#191b24', { lw: 1.2, rim: 0.25, shade: 0 })
  }
  // side ballast vents + singing slits
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) grille(c, cx + s * 46 - 5, 120 + k * 28, 10, 16, 4)
    slit(c, cx + s * 58, 150, cx + s * 58, 250, 1.6)
    slit(c, cx + s * 40, 290, cx + s * 30, 330, 1.2)
  }
  // bow ram plate
  shape(c, sym(cx, [[0, 338], [26, 334], [14, 360], [0, 370, 1]]), bronzeMetal(c, w, h), { lw: 1.2, rim: 0.5 })
  rivets(c, [[cx - 14, 340], [cx + 14, 340], [cx, 356]], 0.9)
  // hull numbers in faded paint (it used to be someone's)
  c.save(); c.globalAlpha = 0.3; c.fillStyle = '#e8e2d0'; c.font = 'bold 16px monospace'; c.textAlign = 'center'
  c.translate(cx - 50, 200); c.rotate(-Math.PI / 2); c.fillText('SSV 41', 0, 0); c.restore()
}

function half(side: -1 | 1) {
  return (c: Ctx, w: number, h: number) => {
    c.save()
    c.beginPath()
    if (side < 0) c.rect(0, 0, w / 2, h); else c.rect(w / 2, 0, w / 2, h)
    c.clip()
    hull(c, w, h)
    c.restore()
    // torn inner edge
    c.save()
    c.strokeStyle = '#ff9a3d'; c.lineWidth = 1.2; c.globalAlpha = 0.8
    c.beginPath()
    for (let y = 36; y < 356; y += 8) c.lineTo(w / 2 + (side < 0 ? -1 : 1) * (1 + ((y * 7) % 5)), y)
    c.stroke()
    c.restore()
  }
}

function tower(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // dive planes
  shape(c, rrFn(cx - 28, 30, 56, 8, 3), choirMetal(c, w, h), { lw: 1.2, rim: 0.4 })
  const sail = sym(cx, [[0, 4], [10, 6], [15, 20], [15, 58], [11, 76], [0, 86, 1]])
  shape(c, sail, bronzeMetal(c, w, h), { lw: 1.5, rim: 0.55 })
  gloss(c, sail, cx - 5, 26, 18, 0.3)
  shape(c, sym(cx, [[0, 12], [7, 14], [9, 26], [9, 50], [6, 62], [0, 66, 1]]), choirMetal(c, w, h), { lw: 1, rim: 0.4, shade: 0.3 })
  // periscope masts
  for (const [x, y] of [[cx - 3, 22], [cx + 3, 30], [cx, 40]] as const) shape(c, ellipseFn(x, y, 2.4, 2.4), '#20232e', { lw: 0.8, rim: 0.4, shade: 0 })
  slit(c, cx, 46, cx, 60, 1.4)
  light(c, cx, 70, 3, PAL.choir)
  // twin deck gun at the front
  shape(c, rrFn(cx - 6, 72, 4, 14, 1.2), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  shape(c, rrFn(cx + 2, 72, 4, 14, 1.2), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  rivets(c, [[cx - 11, 22], [cx + 11, 22], [cx - 11, 54], [cx + 11, 54]], 0.8)
}

function tube(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx, cy - 4, 19, 19), lin(c, 0, 0, w, h, [[0, '#4a4f60'], [1, '#171a23']]), { lw: 1.3, rim: 0.3 })
  shape(c, ellipseFn(cx, cy - 4, 15, 15), bronzeMetal(c, w, h), { lw: 1, rim: 0.45, shade: 0.35 })
  // twin torpedo tubes pointing down
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 6 - 4.5, cy - 8, 9, 30, 3), lin(c, cx - 10, 0, cx + 10, 0, [[0, PAL.gunEdge], [0.5, PAL.gun], [1, PAL.gunDark]]), { lw: 1.1, rim: 0.3, shade: 0.2 })
    shape(c, ellipseFn(cx + s * 6, cy + 21, 4.4, 2.2), '#0b0a10', { lw: 1, rim: 0, shade: 0 })
  }
  stripes(c, rrFn(cx - 12, cy - 18, 24, 5, 1), HAZ, PAL.ink, 2, 0.8, 0.8)
  slit(c, cx - 8, cy - 4, cx + 8, cy - 4, 1.1)
}

function vls(c: Ctx, w: number, h: number) {
  const cx = w / 2
  shape(c, rrFn(4, 4, w - 8, h - 8, 8), lin(c, 0, 0, w, h, [[0, '#4a4f60'], [0.5, '#2c303d'], [1, '#171a23']]), { lw: 1.4, rim: 0.35 })
  shape(c, rrFn(9, 9, w - 18, h - 18, 5), choirMetal(c, w, h), { lw: 1, rim: 0.4, shade: 0.35 })
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const x = cx - 16 + k * 16, y = 22 + r * 17
    shape(c, rrFn(x - 6, y - 6, 12, 12, 2), bronzeMetal(c, w, h), { lw: 1, rim: 0.45, shade: 0.3 })
    seams(c, [[x - 6, y, x + 6, y]], 'rgba(0,0,0,0.5)', 0.9)
  }
  slit(c, 12, h - 12, w - 12, h - 12, 1.3)
  rivets(c, [[10, 10], [w - 10, 10], [10, h - 10], [w - 10, h - 10]], 0.9)
}

/** Open VLS hatch overlay: dark wells with a hot glint. */
function vlsOpen(c: Ctx, w: number) {
  const cx = w / 2
  for (let r = 0; r < 2; r++) for (let k = 0; k < 3; k++) {
    const x = cx - 16 + k * 16, y = 22 + r * 17
    shape(c, rrFn(x - 5, y - 5, 10, 10, 2), '#0c0b10', { lw: 1, rim: 0, shade: 0 })
    light(c, x, y, 4, '#ff9a3d', '#fff0c0')
  }
}

/** The core: a ribbed abyssal reactor that lures like an angler's lamp. */
function core(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx, cy, 22, 30), '#101218', { lw: 1.4, rim: 0.2, shade: 0 })
  c.save()
  c.fillStyle = rad(c, cx, cy, 24, [[0, '#f4fff9'], [0.3, '#8ff5d8'], [0.7, '#1f7f78'], [1, '#0a2a2a']])
  c.beginPath(); c.ellipse(cx, cy, 17, 25, 0, 0, Math.PI * 2); c.fill()
  c.restore()
  for (let k = -3; k <= 3; k++) seams(c, [[cx - 17, cy + k * 6.5, cx + 17, cy + k * 6.5]], 'rgba(10,20,24,0.75)', 1.6)
  shape(c, ellipseFn(cx, cy, 17, 25), 'rgba(0,0,0,0)', { lw: 1.2, rim: 0.4, shade: 0.4 })
}

export function registerArt_m2() {
  defineSprite('m2_tide_hull', HULL_W, HULL_H, hull)
  defineSprite('m2_tide_hull_l', HULL_W, HULL_H, half(-1))
  defineSprite('m2_tide_hull_r', HULL_W, HULL_H, half(1))
  defineSprite('m2_tide_tower', 60, 90, tower)
  defineSprite('m2_tide_tube', 44, 56, tube)
  defineSprite('m2_tide_vls', 64, 60, vls)
  defineSprite('m2_tide_vls_open', 64, 60, (c, w) => vlsOpen(c, w))
  defineSprite('m2_tide_core', 50, 64, core)
  // dark silhouette used while submerged
  defineSprite('m2_tide_shadow', HULL_W + 30, HULL_H + 30, (c, w, h) => {
    c.save()
    c.filter = 'blur(7px)'
    c.translate(15, 15)
    hullPath((w - 30) / 2)(c)
    c.fillStyle = lin(c, 0, 0, 0, h, [[0, 'rgba(4,22,40,0.55)'], [0.5, 'rgba(4,26,46,0.7)'], [1, 'rgba(4,22,40,0.5)']])
    c.fill()
    c.restore()
    // faint dorsal lights of the sleeping hull
    for (let y = 80; y < h - 60; y += 46) light(c, w / 2, y, 5, '#7fe6ff', '#e8ffff')
  })
  // glowing wake light strip for the dive telegraph
  defineSprite('m2_tide_wake', 40, 120, (c, w, h) => glowLine(c, w / 2, 6, w / 2, h - 6, 6, '#bff3ff', 0.7))
}
