import { defineSprite } from './sprites'
import { PAL, lin, rad, light } from './paint'
import { shape, polyFn, ellipseFn, gloss, type Ctx } from './art/kit'

/**
 * Static Garden: nothing here is Choir-made. Pale porcelain, verdigris and old
 * gold, faceted like cut glass — pretty first, dangerous second.
 */
const G = {
  porcelain: '#f4efe6', porcelainMid: '#d9d2c4', porcelainDark: '#9c9383',
  verdigris: '#7fd6c2', verdigrisDark: '#2f7f73',
  gold: '#e8c872', goldDark: '#8f6d2a',
  lilac: '#cdb8ff', lilacDark: '#6f58b8',
}

const porcelain = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#ffffff'], [0.4, G.porcelain], [1, G.porcelainDark]])
const verdigris = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#d8fff6'], [0.45, G.verdigris], [1, G.verdigrisDark]])
const gold = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#fff1c2'], [0.5, G.gold], [1, G.goldDark]])
const lilac = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#f4efff'], [0.5, G.lilac], [1, G.lilacDark]])

/** Regular n-gon path. */
function ngon(cx: number, cy: number, r: number, n: number, rot = 0) {
  const pts: [number, number, number][] = []
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1]) }
  return polyFn(pts)
}

function facetLines(c: Ctx, cx: number, cy: number, r: number, n: number, rot: number, col = 'rgba(255,255,255,0.35)') {
  c.save()
  c.strokeStyle = col; c.lineWidth = 0.7
  c.beginPath()
  for (let i = 0; i < n; i++) { const a = rot + (i / n) * Math.PI * 2; c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) }
  c.stroke()
  c.restore()
}

function songbird(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // swept geometric wings (point down = forward)
  shape(c, polyFn([[cx, 6], [w - 1, 3], [cx + 5, 13]]), lilac(c, w, h), { lw: 0.9, rim: 0.5 })
  shape(c, polyFn([[cx, 6], [1, 3], [cx - 5, 13]]), lilac(c, w, h), { lw: 0.9, rim: 0.5 })
  // body: elongated diamond
  const body = polyFn([[cx, 1], [cx + 4.5, 9], [cx, h - 1], [cx - 4.5, 9]])
  shape(c, body, porcelain(c, w, h), { lw: 1, rim: 0.6 })
  facetLines(c, cx, 9, 5, 4, Math.PI / 4)
  // tail fan
  shape(c, polyFn([[cx - 4, 2], [cx, 5], [cx + 4, 2], [cx, -1]]), gold(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  light(c, cx, 14, 3.5, G.verdigris, '#ffffff')
}

function flower(c: Ctx, w: number, h: number, open: boolean) {
  const cx = w / 2, cy = h / 2
  // leaves
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    c.save(); c.translate(cx, cy); c.rotate(a)
    shape(c, polyFn([[0, -3], [w * 0.46, 0], [0, 3]], true), verdigris(c, w, h), { lw: 0.9, rim: 0.3 })
    c.restore()
  }
  const n = 8
  const len = open ? w * 0.4 : w * 0.24
  const wid = open ? 0.34 : 0.22
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    c.save(); c.translate(cx, cy); c.rotate(a)
    shape(c, polyFn([[0, 0], [len * 0.55, -len * wid], [len, 0], [len * 0.55, len * wid]]), i % 2 ? porcelain(c, w, h) : lilac(c, w, h), { lw: 0.9, rim: 0.5, shade: 0.25 })
    c.restore()
  }
  shape(c, ngon(cx, cy, open ? 7 : 5.5, 6, 0.3), gold(c, w, h), { lw: 1, rim: 0.6 })
  facetLines(c, cx, cy, open ? 7 : 5.5, 6, 0.3)
  if (open) light(c, cx, cy, 12, G.gold, '#ffffff')
}

function fruit(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2 + 3
  // stem + leaf
  c.save(); c.strokeStyle = PAL.ink; c.lineWidth = 2.4
  c.beginPath(); c.moveTo(cx, cy - 12); c.quadraticCurveTo(cx + 1, cy - 17, cx + 4, cy - 19); c.stroke()
  c.strokeStyle = G.verdigrisDark; c.lineWidth = 1.2; c.stroke(); c.restore()
  shape(c, polyFn([[cx + 3, cy - 18], [cx + 13, cy - 21], [cx + 9, cy - 14]], true), verdigris(c, w, h), { lw: 0.8, rim: 0.4 })
  // faceted gem body
  const body = ngon(cx, cy, 13, 8, Math.PI / 8)
  shape(c, body, rad(c, cx - 5, cy - 6, 20, [[0, '#fffbe0'], [0.35, '#f5dc6e'], [0.8, '#c7922e'], [1, '#6e4a14']]), { lw: 1.2, rim: 0.6 })
  facetLines(c, cx, cy, 13, 8, Math.PI / 8, 'rgba(255,250,220,0.45)')
  shape(c, ngon(cx, cy, 5.5, 8, Math.PI / 8), 'rgba(255,255,240,0.85)', { lw: 0.6, rim: 0, shade: 0 })
  gloss(c, body, cx - 5, cy - 6, 8, 0.7)
  light(c, cx, cy, 16, PAL.credit, '#ffffff')
}

function petal(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // base at top (attached to the Gardener), tip points down
  const p = polyFn([[cx, 2, 1], [cx + w * 0.46, h * 0.38], [cx + w * 0.2, h * 0.8], [cx, h - 2, 1], [cx - w * 0.2, h * 0.8], [cx - w * 0.46, h * 0.38]], true)
  shape(c, p, lilac(c, w, h), { lw: 1.3, rim: 0.6, shade: 0.35 })
  shape(c, polyFn([[cx, 10, 1], [cx + w * 0.22, h * 0.4], [cx, h * 0.82, 1], [cx - w * 0.22, h * 0.4]], true), porcelain(c, w, h), { lw: 0.8, rim: 0.5, shade: 0.2 })
  c.save(); c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 0.8
  c.beginPath(); c.moveTo(cx, 6); c.lineTo(cx, h - 8); c.stroke(); c.restore()
  gloss(c, p, cx - w * 0.15, h * 0.3, w * 0.4, 0.4)
  light(c, cx, h * 0.62, 7, G.gold, '#ffffff')
}

function gardenerCore(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // soft aura
  c.fillStyle = rad(c, cx, cy, w / 2, [[0, 'rgba(255,245,210,0.35)'], [0.6, 'rgba(205,184,255,0.12)'], [1, 'rgba(0,0,0,0)']])
  c.fillRect(0, 0, w, h)
  // three stacked, rotated polyhedra silhouettes
  shape(c, ngon(cx, cy, 62, 12, 0), porcelain(c, w, h), { lw: 1.6, rim: 0.6 })
  facetLines(c, cx, cy, 62, 12, 0, 'rgba(120,110,95,0.35)')
  shape(c, ngon(cx, cy, 46, 6, Math.PI / 6), verdigris(c, w, h), { lw: 1.4, rim: 0.6 })
  facetLines(c, cx, cy, 46, 6, Math.PI / 6)
  shape(c, ngon(cx, cy, 30, 6, 0), gold(c, w, h), { lw: 1.3, rim: 0.6 })
  facetLines(c, cx, cy, 30, 6, 0, 'rgba(255,245,200,0.5)')
  // the eye
  shape(c, ellipseFn(cx, cy, 14, 14), rad(c, cx - 4, cy - 4, 18, [[0, '#ffffff'], [0.4, '#fff4c8'], [1, '#d8a846']]), { lw: 1.2, rim: 0.4 })
  c.fillStyle = '#2a2140'
  c.beginPath(); c.ellipse(cx, cy, 3.2, 9, 0, 0, Math.PI * 2); c.fill()
  gloss(c, ngon(cx, cy, 62, 12, 0), cx - 24, cy - 26, 40, 0.35)
}

function gardenerRing(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2, R = w / 2 - 10
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 4
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = G.gold; c.lineWidth = 2
  c.stroke()
  c.strokeStyle = 'rgba(255,245,210,0.6)'; c.lineWidth = 0.8
  c.beginPath(); c.arc(cx, cy, R - 7, 0, Math.PI * 2); c.stroke()
  c.restore()
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R
    shape(c, ngon(x, y, i % 3 === 0 ? 6 : 3.5, 4, a), i % 3 === 0 ? verdigris(c, w, h) : gold(c, w, h), { lw: 0.9, rim: 0.5, shade: 0 })
  }
}

export function registerArt_garden() {
  defineSprite('garden_songbird', 26, 24, songbird, true)
  defineSprite('garden_flower', 46, 46, (c, w, h) => flower(c, w, h, false))
  defineSprite('garden_flower_open', 46, 46, (c, w, h) => flower(c, w, h, true))
  defineSprite('garden_fruit', 36, 44, fruit, true)
  defineSprite('garden_petal', 50, 96, petal)
  defineSprite('garden_core', 150, 150, gardenerCore)
  defineSprite('garden_ring', 250, 250, gardenerRing)
}
