/**
 * Mission 07 — Choir Heart. The citadel is half cathedral organ, half body:
 * graphite and bronze machinery grown through with bone-ivory ribs and
 * membranes, every surface threaded with magenta singing slits.
 */
import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, choirMetal, bronzeMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, rivets, grille, gloss, blobFn, rng, type Ctx, type PathFn } from './art/kit'

const metal = (c: Ctx, w: number, h: number) => choirMetal(c, w, h)
const bronze = (c: Ctx, w: number, h: number) => bronzeMetal(c, w, h)
const darkMetal = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, PAL.gun], [0.5, PAL.gunDark], [1, '#101219']])
const bone = (c: Ctx, x: number, y: number, r: number) => rad(c, x - r * 0.3, y - r * 0.3, r * 1.4, [[0, '#fbf3e2'], [0.4, '#d9cbb0'], [0.8, '#978468'], [1, '#5a4b3a']])
const flesh = (c: Ctx, x: number, y: number, r: number) => rad(c, x - r * 0.3, y - r * 0.3, r * 1.3, [[0, '#8a4a68'], [0.5, '#5a2743'], [1, '#2a1020']])

/** Glowing magenta veins clipped to a path. */
function veins(c: Ctx, path: PathFn, seed: number, n: number, x0: number, y0: number, w: number, h: number) {
  const r = rng(seed)
  c.save()
  path(c); c.clip()
  c.globalCompositeOperation = 'lighter'
  for (let i = 0; i < n; i++) {
    let x = x0 + r() * w, y = y0 + r() * h
    c.beginPath(); c.moveTo(x, y)
    for (let k = 0; k < 3; k++) {
      const nx = x + (r() - 0.5) * 30, ny = y + (r() - 0.3) * 26
      c.quadraticCurveTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 20, nx, ny)
      x = nx; y = ny
    }
    c.strokeStyle = 'rgba(255,46,136,0.22)'; c.lineWidth = 2.6; c.stroke()
    c.strokeStyle = 'rgba(255,170,210,0.6)'; c.lineWidth = 0.7; c.stroke()
  }
  c.restore()
}

/** A bone rib arcing across a span. */
function rib(c: Ctx, x0: number, y0: number, x1: number, y1: number, bend: number, wd: number) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + bend
  c.save()
  c.lineCap = 'round'
  c.strokeStyle = PAL.ink; c.lineWidth = wd + 2.4
  c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(mx, my, x1, y1); c.stroke()
  c.strokeStyle = lin(c, x0, y0 - wd, x0, y0 + wd, [[0, '#f4ead6'], [0.6, '#c2b293'], [1, '#7d6c55']]); c.lineWidth = wd; c.stroke()
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = wd * 0.25
  c.translate(-wd * 0.2, -wd * 0.25); c.stroke()
  c.restore()
}

// ─────────────── the Wall (boss phase 1), drawn as two halves ───────────────

function wallHalf(side: -1 | 1) {
  return (c: Ctx, w: number, h: number) => {
    // painted as the LEFT half; the right half is a mirror image
    if (side > 0) { c.translate(w, 0); c.scale(-1, 1) }
    const ix = w // inner edge (where the iris sits)
    // back mass
    const body = polyFn([[0, 0, 1], [ix, 0, 1], [ix, 118], [ix - 30, 150], [ix - 90, 160], [ix - 170, 170], [ix - 240, 158], [0, 172, 1]], true)
    shape(c, body, darkMetal(c, w, h), { lw: 1.8, rim: 0.3 })
    veins(c, body, 5 + side, 10, 0, 0, w, h)
    // bronze buttresses
    for (const bx of [40, 105, 170, 235]) {
      const bt = polyFn([[bx - 16, 0], [bx + 16, 0], [bx + 20, 120], [bx + 8, 160], [bx - 8, 160], [bx - 20, 120]], true)
      shape(c, bt, bronze(c, w, h), { lw: 1.3, rim: 0.5 })
      grille(c, bx - 8, 18, 16, 40, 5)
      slit(c, bx, 72, bx, 118, 1.6)
      rivets(c, [[bx - 12, 8], [bx + 12, 8], [bx - 14, 130], [bx + 14, 130]], 0.9)
    }
    // bone ribs grown across the machine
    rib(c, 10, 30, ix - 40, 50, 30, 7)
    rib(c, 0, 100, ix - 60, 128, 22, 6)
    // half iris shell around the heart chamber
    const iris = (cc: Ctx) => { cc.beginPath(); cc.arc(ix, 72, 58, Math.PI / 2, Math.PI * 1.5); cc.closePath() }
    shape(c, iris, metal(c, w, h), { lw: 1.8, rim: 0.5 })
    for (let i = 0; i < 5; i++) {
      const a0 = Math.PI / 2 + (i / 5) * Math.PI, a1 = a0 + Math.PI / 5
      const blade = (cc: Ctx) => { cc.beginPath(); cc.moveTo(ix, 72); cc.arc(ix, 72, 50, a0, a1); cc.closePath() }
      shape(c, blade, lin(c, ix - 50, 20, ix, 120, [[0, '#a09486'], [0.5, '#5a5058'], [1, '#221c26']]), { lw: 1, rim: 0.35, shade: 0.3 })
    }
    slit(c, ix - 2, 20, ix - 2, 124, 2.2)
    shape(c, ellipseFn(ix, 72, 9, 9), bronze(c, w, h), { lw: 1, rim: 0.5 })
    // pipe sockets along the underside
    for (const px of [ix - 100, ix - 165, ix - 230]) {
      shape(c, rrFn(px - 20, 138, 40, 26, 6), bronze(c, w, h), { lw: 1.2, rim: 0.5 })
      grille(c, px - 13, 144, 26, 12, 4, true)
    }
    seams(c, [[0, 60, ix - 60, 60], [0, 132, ix - 70, 140]], 'rgba(0,0,0,0.4)', 1)
  }
}

function pipe(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const tube = sym(cx, [[0, 2, 1], [14, 4], [15, 20], [14, h - 26], [18, h - 14], [17, h - 3], [0, h - 1, 1]])
  shape(c, tube, lin(c, 0, 0, w, 0, [[0, PAL.bronzeLight], [0.35, PAL.bronze], [1, PAL.bronzeDark]]), { lw: 1.4, rim: 0.55 })
  gloss(c, tube, cx - 6, h * 0.35, 30, 0.2)
  for (const y of [22, 48, 74, 100]) {
    shape(c, rrFn(cx - 16, y, 32, 6, 2), metal(c, w, h), { lw: 0.9, rim: 0.4, shade: 0.2 })
  }
  // mouth (bottom, facing the player)
  shape(c, ellipseFn(cx, h - 10, 12, 6), '#120a10', { lw: 1.2, rim: 0.2, shade: 0 })
  slit(c, cx - 7, h - 10, cx + 7, h - 10, 1.8)
  slit(c, cx, 30, cx, 96, 1.2)
}

function voice(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const ring = ellipseFn(cx, cy, w / 2 - 2, h / 2 - 2)
  shape(c, ring, bone(c, cx, cy, w / 2), { lw: 1.5, rim: 0.6 })
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    seams(c, [[cx + Math.cos(a) * (w / 2 - 12), cy + Math.sin(a) * (h / 2 - 12), cx + Math.cos(a) * (w / 2 - 3), cy + Math.sin(a) * (h / 2 - 3)]], 'rgba(60,40,30,0.6)', 1)
  }
  const mem = ellipseFn(cx, cy, w / 2 - 12, h / 2 - 12)
  shape(c, mem, flesh(c, cx, cy, w / 2 - 12), { lw: 1.2, rim: 0.3 })
  veins(c, mem, 77, 6, 10, 10, w - 20, h - 20)
  for (const dx of [-8, 0, 8]) slit(c, cx + dx, cy - 10 + Math.abs(dx) * 0.4, cx + dx, cy + 10 - Math.abs(dx) * 0.4, 1.6)
}

function heart(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // bronze valves / arteries
  for (const [a, l] of [[-2.4, 1], [-0.7, 1], [0.9, 0.8], [2.3, 0.85], [-1.57, 1.1]] as const) {
    const x = cx + Math.cos(a) * 52 * l, y = cy + Math.sin(a) * 52 * l
    c.save(); c.lineCap = 'round'
    c.strokeStyle = PAL.ink; c.lineWidth = 16
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke()
    c.strokeStyle = bronze(c, w, h); c.lineWidth = 12; c.stroke()
    c.strokeStyle = 'rgba(255,230,190,0.35)'; c.lineWidth = 3; c.translate(-2, -2); c.stroke()
    c.restore()
    shape(c, ellipseFn(x, y, 9, 9), metal(c, w, h), { lw: 1.1, rim: 0.5 })
    shape(c, ellipseFn(x, y, 4.5, 4.5), '#12080e', { lw: 0.8, rim: 0, shade: 0 })
  }
  const body = blobFn(cx, cy + 4, 44, 48, 13, 12, 0.1)
  shape(c, body, flesh(c, cx, cy, 50), { lw: 1.8, rim: 0.4 })
  veins(c, body, 91, 12, cx - 44, cy - 44, 88, 96)
  // bone cage
  for (let i = -2; i <= 2; i++) rib(c, cx - 46, cy - 20 + i * 14, cx + 46, cy - 20 + i * 14, 18 + Math.abs(i) * 4, 4)
  // core aperture
  shape(c, ellipseFn(cx, cy + 6, 16, 18), '#1a0812', { lw: 1.5, rim: 0.2, shade: 0 })
  gloss(c, body, cx - 18, cy - 20, 26, 0.18)
}

function petal(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const p = sym(cx, [[0, 2, 1], [12, 8], [20, 30], [18, 52], [8, 66], [0, h - 2, 1]])
  shape(c, p, lin(c, 0, 0, w, h, [[0, '#f4ead6'], [0.45, '#c2b293'], [1, '#6a5a46']]), { lw: 1.4, rim: 0.6 })
  shape(c, sym(cx, [[0, 10], [7, 14], [10, 34], [6, 54], [0, 60]]), bronze(c, w, h), { lw: 1, rim: 0.5 })
  for (const y of [22, 34, 46]) seams(c, [[cx - 14, y, cx + 14, y + 4]], 'rgba(60,40,30,0.5)', 0.8)
  slit(c, cx, 18, cx, 54, 1.4)
}

/** Organ column hazard (seen from above): a cluster of pipe mouths in a bronze collar. */
function organCol(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx, cy, w / 2 - 2, h / 2 - 2), darkMetal(c, w, h), { lw: 1.6, rim: 0.3 })
  shape(c, ellipseFn(cx, cy, w / 2 - 7, h / 2 - 7), bronze(c, w, h), { lw: 1.2, rim: 0.5 })
  const mouths: [number, number, number][] = [[0, 0, 11], [-17, -10, 7], [17, -10, 7], [-17, 11, 7], [17, 11, 7], [0, -20, 6], [0, 21, 6]]
  for (const [dx, dy, r] of mouths) {
    shape(c, ellipseFn(cx + dx, cy + dy, r, r), lin(c, cx + dx - r, cy + dy - r, cx + dx + r, cy + dy + r, [[0, '#d0a878'], [1, '#3a2a1e']]), { lw: 1, rim: 0.5 })
    shape(c, ellipseFn(cx + dx, cy + dy, r * 0.62, r * 0.62), '#12080e', { lw: 0.8, rim: 0, shade: 0.3 })
  }
  light(c, cx, cy, 5, PAL.choirDeep, '#ffb3d6')
  rivets(c, Array.from({ length: 10 }, (_, i) => [cx + Math.cos(i * 0.628) * (w / 2 - 4.5), cy + Math.sin(i * 0.628) * (h / 2 - 4.5)] as [number, number]), 0.8)
}

/** Flesh pod set in the citadel floor: closed membrane, opens to fire. */
function bloom(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const r = rng(5)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + r() * 0.4
    rib(c, cx, cy, cx + Math.cos(a) * 28, cy + Math.sin(a) * 28, 4, 3)
  }
  const pod = blobFn(cx, cy, 20, 19, 17, 9, 0.1)
  shape(c, pod, flesh(c, cx, cy, 22), { lw: 1.4, rim: 0.4 })
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2
    seams(c, [[cx, cy, cx + Math.cos(a) * 18, cy + Math.sin(a) * 18]], 'rgba(20,6,14,0.8)', 1.3)
  }
  veins(c, pod, 33, 4, cx - 20, cy - 20, 40, 40)
}

function chunk(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const b = blobFn(cx, cy, w / 2 - 4, h / 2 - 4, 61, 8, 0.3)
  shape(c, b, darkMetal(c, w, h), { lw: 1.3, rim: 0.4 })
  rib(c, 6, cy + 4, w - 8, cy - 2, -6, 4)
  veins(c, b, 62, 2, 4, 4, w - 8, h - 8)
}

export function registerArt_m7() {
  defineSprite('m7_wall_l', 300, 176, wallHalf(-1))
  defineSprite('m7_wall_r', 300, 176, wallHalf(1))
  defineSprite('m7_pipe', 40, 140, pipe)
  defineSprite('m7_voice', 60, 60, voice)
  defineSprite('m7_heart', 150, 150, heart)
  defineSprite('m7_petal', 44, 74, petal)
  defineSprite('m7_organ_col', 64, 64, organCol)
  defineSprite('m7_bloom', 64, 64, bloom)
  defineSprite('m7_debris', 42, 36, chunk, true)
}
