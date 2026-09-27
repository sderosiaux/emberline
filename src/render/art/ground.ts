/**
 * Choir ground forces, installations, trains, ships (bow DOWN) and the civilian
 * trawler. Heavier and blockier than air units, sitting on dark base plates so
 * they read on sand, water, snow and metal alike.
 */
import { defineSprite } from '../sprites'
import { PAL, lin, rad, light, slit, seams, bronzeMetal, choirMetal } from '../paint'
import {
  shape, sym, polyFn, ellipseFn, rrFn, octagonFn, rivets, stripes, grille, gloss, glowLine, blobFn, rng,
  type Ctx, type Pt, type PathFn,
} from './kit'

const bronze = (c: Ctx, w: number, h: number) => bronzeMetal(c, w, h)
const metal = (c: Ctx, w: number, h: number) => choirMetal(c, w, h)
const plate = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#4a4f60'], [0.5, '#2c303d'], [1, '#171a23']])
const HAZ_Y = '#f2c230'

const octagon = octagonFn

function chamfer(x: number, y: number, w: number, h: number, k: number): PathFn {
  return polyFn([[x + k, y], [x + w - k, y], [x + w, y + k], [x + w, y + h - k], [x + w - k, y + h], [x + k, y + h], [x, y + h - k], [x, y + k]])
}

function ringRivets(cx: number, cy: number, r: number, n: number, off = 0): [number, number][] {
  return Array.from({ length: n }, (_, i) => {
    const a = off + (i / n) * Math.PI * 2
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number]
  })
}

/** Tube pointing down from y0 to y1 with a muzzle collar. */
function gun(c: Ctx, x: number, y0: number, y1: number, wd: number) {
  shape(c, rrFn(x - wd / 2, y0, wd, y1 - y0, wd * 0.25), lin(c, x - wd / 2, 0, x + wd / 2, 0, [[0, PAL.gunEdge], [0.45, PAL.gun], [1, PAL.gunDark]]), { lw: 1, rim: 0.35, shade: 0.2 })
  shape(c, rrFn(x - wd / 2 - 0.7, y1 - 3, wd + 1.4, 3, 0.8), lin(c, x - wd, 0, x + wd, 0, [[0, PAL.bronzeLight], [1, PAL.bronzeDark]]), { lw: 0.9, rim: 0.4, shade: 0 })
  c.fillStyle = PAL.ink
  c.beginPath(); c.ellipse(x, y1 - 0.6, wd * 0.3, 0.5, 0, 0, Math.PI * 2); c.fill()
}

// ─────────────── Turrets ───────────────

function turretBase(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, octagon(cx, cy, 15), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  shape(c, octagon(cx, cy, 12.5), bronze(c, w, h), { lw: 1, rim: 0.45, shade: 0.35 })
  shape(c, ellipseFn(cx, cy, 8.6, 8.6), '#1d202a', { lw: 1, rim: 0, shade: 0 })
  rivets(c, [[cx - 10, cy - 10], [cx + 10, cy - 10], [cx - 10, cy + 10], [cx + 10, cy + 10]], 0.8)
  for (const [x0, y0, x1, y1] of [[cx - 3, cy - 13.6, cx + 3, cy - 13.6], [cx - 3, cy + 13.6, cx + 3, cy + 13.6], [cx - 13.6, cy - 3, cx - 13.6, cy + 3], [cx + 13.6, cy - 3, cx + 13.6, cy + 3]]) slit(c, x0, y0, x1, y1, 0.9)
}

function turretBarrel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, rrFn(cx - 3, cy - 6.5, 6, 5, 1), PAL.gunDark, { lw: 1, rim: 0.3, shade: 0 })
  gun(c, cx, cy, h - 0.8, 3.2)
  const head = sym(cx, [[0, cy - 5], [4, cy - 3.6], [4.6, cy + 1], [3.4, cy + 4.6], [0, cy + 5.4]])
  shape(c, head, metal(c, w, h), { lw: 1.1, rim: 0.6 })
  gloss(c, head, cx - 1.5, cy - 2, 3.5, 0.35)
  slit(c, cx - 2, cy + 2, cx + 2, cy + 2, 0.8)
}

function flakBase(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, chamfer(1.5, 1.5, w - 3, h - 3, 7), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  shape(c, chamfer(5, 5, w - 10, h - 10, 5), bronze(c, w, h), { lw: 1, rim: 0.4, shade: 0.35 })
  for (const [x, y] of [[6, 6], [w - 12, 6], [6, h - 12], [w - 12, h - 12]]) stripes(c, rrFn(x, y, 6, 6, 1), HAZ_Y, PAL.ink, 1.5, 0.8, 0.8)
  shape(c, ellipseFn(cx, cy, 11, 11), '#1b1e27', { lw: 1, rim: 0, shade: 0 })
  rivets(c, ringRivets(cx, cy, 12.5, 12, Math.PI / 12), 0.55)
  for (const s of [-1, 1]) slit(c, cx + s * 17.6, cy - 4, cx + s * 17.6, cy + 4, 0.9)
}

function flakBarrel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (let i = 0; i < 4; i++) {
    c.save()
    c.translate(cx, cy); c.rotate(i * Math.PI / 2); c.translate(-cx, -cy)
    gun(c, cx - 1.7, cy + 4, cy + 18, 2.4)
    gun(c, cx + 1.7, cy + 4, cy + 18, 2.4)
    c.restore()
  }
  const hub = octagon(cx, cy, 7.5)
  shape(c, hub, metal(c, w, h), { lw: 1.1, rim: 0.6 })
  gloss(c, hub, cx - 2.5, cy - 2.5, 5, 0.3)
  shape(c, ellipseFn(cx, cy, 3.4, 3.4), bronze(c, w, h), { lw: 0.9, rim: 0.5, shade: 0 })
  slit(c, cx - 1.5, cy, cx + 1.5, cy, 0.8)
}

function tankBody(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // Tracks.
  for (const x of [1, w - 8]) {
    shape(c, rrFn(x, 1.5, 7, h - 3, 2.5), '#20222a', { lw: 1.2, rim: 0.2, shade: 0 })
    c.save()
    rrFn(x, 1.5, 7, h - 3, 2.5)(c); c.clip()
    c.strokeStyle = 'rgba(150,150,160,0.45)'; c.lineWidth = 1
    c.beginPath()
    for (let y = 3; y < h - 1; y += 2.6) { c.moveTo(x + 0.8, y); c.lineTo(x + 6.2, y) }
    c.stroke()
    c.restore()
  }
  // Hull: front (bottom) sloped.
  const hull = polyFn([[6, 4], [w - 6, 4], [w - 5, 30], [w - 8, 38], [8, 38], [5, 30]])
  shape(c, hull, bronze(c, w, h), { lw: 1.2, rim: 0.5 })
  shape(c, polyFn([[7, 29], [w - 7, 29], [w - 8.5, 36.5], [8.5, 36.5]]), lin(c, 0, 29, 0, 37, [[0, PAL.bronzeDark], [1, '#3a2a1c']]), { lw: 0.9, rim: 0.3, shade: 0 })
  grille(c, cx - 7, 5.5, 14, 5, 5, true)
  seams(c, [[7, 13, w - 7, 13], [7, 26, w - 7, 26]], 'rgba(0,0,0,0.4)', 0.7)
  rivets(c, [[8, 15], [w - 8, 15], [8, 24], [w - 8, 24]], 0.6)
  slit(c, cx - 5, 33, cx + 5, 33, 1)
  for (const s of [-1, 1]) light(c, cx + s * 8, 37.5, 1.5, PAL.choir, '#ffffff')
}

function tankTurret(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  gun(c, cx, cy + 2, h - 0.6, 3)
  const dome = sym(cx, [[0, cy - 7], [5, cy - 6], [7, cy - 1], [6.4, cy + 4], [3.5, cy + 7], [0, cy + 7.5]])
  shape(c, dome, metal(c, w, h), { lw: 1.2, rim: 0.6 })
  gloss(c, dome, cx - 2.5, cy - 3, 5, 0.35)
  shape(c, rrFn(cx - 3.8, cy - 5, 3, 2.6, 0.8), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  slit(c, cx - 2.6, cy + 3.8, cx + 2.6, cy + 3.8, 0.9)
}

function artillery(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // Four splayed outrigger legs with pads.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2
    const x = cx + Math.cos(a) * 17, y = cy + Math.sin(a) * 17
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 5.2
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke()
    c.strokeStyle = PAL.bronze; c.lineWidth = 3
    c.stroke()
    c.restore()
    shape(c, rrFn(x - 3.4, y - 3.4, 6.8, 6.8, 1.2), plate(c, w, h), { lw: 1, rim: 0.3 })
    stripes(c, rrFn(x - 2, y - 2, 4, 4, 0.5), HAZ_Y, PAL.ink, 1, 0.8, 0)
  }
  shape(c, octagon(cx, cy, 14), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  shape(c, ellipseFn(cx, cy, 11, 11), bronze(c, w, h), { lw: 1, rim: 0.45, shade: 0.3 })
  rivets(c, ringRivets(cx, cy, 9.3, 10), 0.55)
  shape(c, ellipseFn(cx, cy, 7, 7), '#1b1e27', { lw: 0.9, rim: 0, shade: 0 })
}

function artilleryBarrel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // Long barrel with a muzzle brake.
  shape(c, rrFn(cx - 2.2, cy, 4.4, h - cy - 4, 1), lin(c, cx - 2.2, 0, cx + 2.2, 0, [[0, PAL.gunEdge], [0.45, PAL.gun], [1, PAL.gunDark]]), { lw: 1, rim: 0.3, shade: 0.2 })
  shape(c, rrFn(cx - 3.6, h - 5.5, 7.2, 5, 1), bronze(c, w, h), { lw: 1, rim: 0.4, shade: 0.2 })
  c.fillStyle = PAL.ink
  c.fillRect(cx - 3.6, h - 3.6, 1.2, 1.6); c.fillRect(cx + 2.4, h - 3.6, 1.2, 1.6)
  shape(c, rrFn(cx - 2.8, cy + 12, 5.6, 2, 0.6), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  // Breech block.
  const breech = rrFn(cx - 5, cy - 8, 10, 13, 2)
  shape(c, breech, metal(c, w, h), { lw: 1.2, rim: 0.55 })
  grille(c, cx - 3, cy - 6.5, 6, 3.5, 3, true)
  slit(c, cx - 2.6, cy + 1.6, cx + 2.6, cy + 1.6, 0.9)
}

// ─────────────── Installations ───────────────

function silo(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, chamfer(1, 1, w - 2, h - 2, 5), lin(c, 0, 0, w, h, [[0, '#8d8a80'], [0.5, '#66635b'], [1, '#403e39']]), { lw: 1.3, rim: 0.35 })
  seams(c, [[1, cy, 6, cy], [w - 6, cy, w - 1, cy], [cx, 1, cx, 6], [cx, h - 6, cx, h - 1]], 'rgba(0,0,0,0.4)', 0.8)
  // Hazard ring.
  const ring: PathFn = cc => { cc.beginPath(); cc.arc(cx, cy, 19, 0, Math.PI * 2); cc.arc(cx, cy, 15.6, 0, Math.PI * 2, true) }
  stripes(c, ring, HAZ_Y, PAL.ink, 2.2, 0.8, 1)
  // Split hatch doors.
  const hatch = ellipseFn(cx, cy, 14.6, 14.6)
  shape(c, hatch, bronze(c, w, h), { lw: 1.2, rim: 0.5 })
  c.save()
  hatch(c); c.clip()
  c.fillStyle = 'rgba(0,0,0,0.16)'
  c.fillRect(cx, cy - 15, 15, 30)
  c.restore()
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 1.4
  c.beginPath(); c.moveTo(cx, cy - 14.6); c.lineTo(cx, cy + 14.6); c.stroke()
  c.restore()
  seams(c, [[cx - 11, cy - 6, cx - 3, cy - 6], [cx - 11, cy + 6, cx - 3, cy + 6], [cx + 3, cy - 6, cx + 11, cy - 6], [cx + 3, cy + 6, cx + 11, cy + 6]], 'rgba(0,0,0,0.4)', 0.7)
  rivets(c, ringRivets(cx, cy, 12.8, 12, Math.PI / 12), 0.55)
  // Hinges and warhead-ready lights.
  for (const s of [-1, 1]) shape(c, rrFn(cx + s * 14.5 - 1.8, cy - 4, 3.6, 8, 1), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  slit(c, cx - 1, cy - 8, cx - 1, cy + 8, 0.7)
  for (const [x, y] of [[4.5, 4.5], [w - 4.5, 4.5], [4.5, h - 4.5], [w - 4.5, h - 4.5]]) light(c, x, y, 2, PAL.choir, '#ffffff')
}

function generator(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, chamfer(1.5, 1.5, w - 3, h - 3, 8), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  // Cables from coils to the core.
  for (const [x, y] of [[11, 11], [w - 11, 11], [11, h - 11], [w - 11, h - 11]]) {
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 3.2
    c.beginPath(); c.moveTo(x, y); c.lineTo(cx, cy); c.stroke()
    c.strokeStyle = '#2d6a74'; c.lineWidth = 1.6; c.stroke()
    c.restore()
  }
  // Four coils (copper windings seen from above).
  for (const [x, y] of [[11, 11], [w - 11, 11], [11, h - 11], [w - 11, h - 11]]) {
    shape(c, ellipseFn(x, y, 8, 8), bronze(c, w, h), { lw: 1.1, rim: 0.4 })
    c.save()
    for (let r = 6.8; r > 2.4; r -= 1.3) {
      c.strokeStyle = r % 2.6 < 1.3 ? 'rgba(60,30,10,0.7)' : 'rgba(255,200,140,0.45)'
      c.lineWidth = 0.7
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke()
    }
    c.restore()
    shape(c, ellipseFn(x, y, 2.2, 2.2), '#11333a', { lw: 0.8, rim: 0, shade: 0 })
    light(c, x, y, 3, PAL.shotCyan, '#ffffff')
  }
  // Core housing + cyan core.
  shape(c, octagon(cx, cy, 11.5), metal(c, w, h), { lw: 1.2, rim: 0.55 })
  shape(c, ellipseFn(cx, cy, 7.5, 7.5), '#0a2328', { lw: 1, rim: 0, shade: 0 })
  c.save()
  c.fillStyle = rad(c, cx - 1.5, cy - 1.5, 7, [[0, '#ffffff'], [0.3, PAL.shotCyan], [0.8, PAL.teal], [1, PAL.tealDark]])
  c.beginPath(); c.arc(cx, cy, 6, 0, Math.PI * 2); c.fill()
  c.restore()
  light(c, cx, cy, 13, PAL.shotCyan, '#ffffff')
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.beginPath(); c.ellipse(cx - 2, cy - 2.4, 1.8, 1, -0.6, 0, Math.PI * 2); c.fill()
  for (const s of [-1, 1]) slit(c, cx + s * 23.5, cy - 5, cx + s * 23.5, cy + 5, 0.9)
}

function fuel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx + 0.8, cy + 1, 15.5, 15.5), 'rgba(10,8,14,0.35)', { lw: 0, rim: 0, shade: 0 })
  const tank = ellipseFn(cx, cy, 15.4, 15.4)
  shape(c, tank, rad(c, cx - 5, cy - 5, 22, [[0, '#f1e9dc'], [0.4, '#c9b9a0'], [0.85, '#7d6c55'], [1, '#4d4133']]), { lw: 1.3, rim: 0.5 })
  const band: PathFn = cc => { cc.beginPath(); cc.arc(cx, cy, 13.4, 0, Math.PI * 2); cc.arc(cx, cy, 10.2, 0, Math.PI * 2, true) }
  stripes(c, band, HAZ_Y, PAL.ink, 2.2, 0.8, 0.9)
  shape(c, ellipseFn(cx, cy, 8.6, 8.6), rad(c, cx - 3, cy - 3, 12, [[0, '#ffffff'], [0.5, '#d8cbb4'], [1, '#8a7962']]), { lw: 1, rim: 0.4, shade: 0.25 })
  // Flame warning glyph.
  c.save()
  c.fillStyle = '#e0431a'
  c.beginPath()
  c.moveTo(cx, cy - 5)
  c.quadraticCurveTo(cx + 4.4, cy - 0.5, cx + 2.8, cy + 3.4)
  c.quadraticCurveTo(cx, cy + 5.2, cx - 2.8, cy + 3.4)
  c.quadraticCurveTo(cx - 4.2, cy, cx - 1, cy - 2)
  c.quadraticCurveTo(cx - 0.4, cy - 3.2, cx, cy - 5)
  c.fill()
  c.strokeStyle = PAL.ink; c.lineWidth = 0.8; c.stroke()
  c.fillStyle = HAZ_Y
  c.beginPath(); c.ellipse(cx + 0.3, cy + 2, 1.4, 2, 0, 0, Math.PI * 2); c.fill()
  c.restore()
  // Valve.
  shape(c, rrFn(cx + 9, cy - 13, 4, 4, 1), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  gloss(c, tank, cx - 7, cy - 8, 7, 0.5)
}

function radarBase(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, chamfer(2, 2, w - 4, h - 4, 6), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  shape(c, chamfer(5, 5, w - 10, h - 10, 4), lin(c, 0, 0, w, h, [[0, '#6b7080'], [1, '#2e313d']]), { lw: 0.9, rim: 0.3, shade: 0.3 })
  grille(c, 7, 7, 8, 4, 4, true)
  grille(c, w - 15, h - 11, 8, 4, 4, true)
  rivets(c, [[7, h - 7], [w - 7, 7]], 0.7)
  shape(c, ellipseFn(cx, cy, 8, 8), bronze(c, w, h), { lw: 1.1, rim: 0.5 })
  shape(c, ellipseFn(cx, cy, 4, 4), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  for (const [x, y] of [[w - 7, h - 16], [7, 16]]) light(c, x, y, 1.8, PAL.choir, '#ffffff')
}

function radarDish(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // Feed boom forward (down) to the emitter horn.
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 3.4
  c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx, h - 2); c.stroke()
  c.strokeStyle = PAL.gunEdge; c.lineWidth = 1.6; c.stroke()
  c.restore()
  // Thick curved reflector, concave side facing down.
  const dish: PathFn = cc => {
    cc.beginPath()
    cc.moveTo(0.8, h - 3)
    cc.quadraticCurveTo(cx, -5, w - 0.8, h - 3)
    cc.lineTo(w - 3.5, h - 0.8)
    cc.quadraticCurveTo(cx, 5, 3.5, h - 0.8)
    cc.closePath()
  }
  shape(c, dish, lin(c, 0, 0, 0, h, [[0, '#f2f4f8'], [0.45, '#a3abc0'], [1, '#474e61']]), { lw: 1.3, rim: 0.7, shade: 0.4 })
  c.save()
  dish(c); c.clip()
  c.strokeStyle = 'rgba(20,20,40,0.45)'; c.lineWidth = 0.8
  c.beginPath()
  for (const x of [7, 12.5, cx, w - 12.5, w - 7]) { c.moveTo(x, 0); c.lineTo(x, h) }
  c.stroke()
  c.fillStyle = PAL.bronze
  c.fillRect(0, 0, 3.2, h); c.fillRect(w - 3.2, 0, 3.2, h)
  c.restore()
  dish(c); c.strokeStyle = PAL.ink; c.lineWidth = 1.3; c.stroke()
  shape(c, ellipseFn(cx, cy - 0.5, 3.2, 3.2), bronze(c, w, h), { lw: 1, rim: 0.5, shade: 0 })
  shape(c, rrFn(cx - 2.2, h - 4, 4.4, 3.4, 1), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
  light(c, cx, h - 2.3, 2.4, PAL.choir, '#ffffff')
}

function bunker(c: Ctx, w: number, h: number) {
  const cx = w / 2
  shape(c, chamfer(1, 2, w - 2, h - 3, 10), plate(c, w, h), { lw: 1.4, rim: 0.3 })
  // Stepped armour slabs.
  const top = chamfer(6, 5, w - 12, h - 12, 8)
  shape(c, top, bronze(c, w, h), { lw: 1.2, rim: 0.5, shade: 0.4 })
  shape(c, chamfer(13, 11, w - 26, h - 28, 5), lin(c, 0, 0, w, h, [[0, '#c9a57c'], [0.5, '#8a6a47'], [1, '#4a3626']]), { lw: 1, rim: 0.4, shade: 0.3 })
  // Hatch vents.
  for (const x of [17, 27.5, 38]) grille(c, x, 15, 8.5, 12, 4)
  seams(c, [[6, 36, w - 6, 36], [cx, 36, cx, h - 7]], 'rgba(0,0,0,0.45)', 0.8)
  rivets(c, [[10, 9], [w - 10, 9], [10, h - 11], [w - 10, h - 11], [cx - 10, 40], [cx + 10, 40]], 0.8)
  // Firing slit along the front (bottom) face.
  shape(c, rrFn(cx - 18, h - 13.5, 36, 4.2, 1.2), '#0c0a10', { lw: 1, rim: 0, shade: 0 })
  slit(c, cx - 15, h - 11.4, cx + 15, h - 11.4, 1.2)
  for (const s of [-1, 1]) {
    stripes(c, polyFn([[cx + s * 22, 38], [cx + s * 27, 38], [cx + s * 27, h - 16], [cx + s * 22, h - 16]]), HAZ_Y, PAL.ink, 1.5, 0.8, 0.8)
  }
}

function crate(c: Ctx, w: number, h: number, mark: 'credit' | 'repair') {
  const cx = w / 2, cy = h / 2
  const col = mark === 'credit' ? PAL.credit : PAL.repair
  shape(c, rrFn(1, 1.5, w - 2, h - 3, 2), lin(c, 0, 0, w, h, [[0, '#6e7361'], [0.5, '#4a4f40'], [1, '#2a2e22']]), { lw: 1.3, rim: 0.45 })
  if (mark === 'repair') shape(c, rrFn(1, 1.5, w - 2, h - 3, 2), lin(c, 0, 0, w, h, [[0, '#6a7890'], [0.5, '#46526a'], [1, '#262e40']]), { lw: 1.3, rim: 0.45 })
  // Frame rails and corner caps.
  c.save()
  c.strokeStyle = 'rgba(0,0,0,0.5)'; c.lineWidth = 1
  c.strokeRect(4, 4.5, w - 8, h - 9)
  c.restore()
  for (const [x, y] of [[1.5, 2], [w - 6.5, 2], [1.5, h - 7], [w - 6.5, h - 7]]) shape(c, rrFn(x, y, 5, 5, 1), bronze(c, w, h), { lw: 0.8, rim: 0.4, shade: 0 })
  seams(c, [[6, 8, w - 6, 8], [6, h - 8, w - 6, h - 8]], 'rgba(255,255,255,0.15)', 0.7)
  // Marking panel.
  shape(c, rrFn(cx - 7, cy - 6, 14, 12, 1.5), '#1a1d18', { lw: 0.9, rim: 0, shade: 0 })
  light(c, cx, cy, 7, col, '#ffffff')
  c.save()
  c.fillStyle = mark === 'credit' ? '#eaffb0' : '#e6f7ff'
  c.strokeStyle = col; c.lineWidth = 0.8
  if (mark === 'credit') {
    polyFn([[cx, cy - 4.4], [cx + 3.6, cy], [cx, cy + 4.4], [cx - 3.6, cy]])(c); c.fill(); c.stroke()
  } else {
    c.fillRect(cx - 1.2, cy - 4, 2.4, 8); c.fillRect(cx - 4, cy - 1.2, 8, 2.4)
  }
  c.restore()
  for (const s of [-1, 1]) glowLine(c, cx + s * 10, cy - 3, cx + s * 10, cy + 3, 0.8, col, 0.8)
}

// ─────────────── Trains (front DOWN) ───────────────

function bogies(c: Ctx, w: number, ys: number[]) {
  for (const y of ys) shape(c, rrFn(3, y - 3.5, w - 6, 7, 1.5), '#1a1b22', { lw: 1, rim: 0.2, shade: 0 })
}

function trainEngine(c: Ctx, w: number, h: number) {
  const cx = w / 2
  bogies(c, w, [12, h - 14])
  const body = sym(cx, [[0, 2], [15.5, 2.5], [16.5, 8], [16.5, h - 16], [14, h - 7], [8, h - 2.5], [0, h - 1.5]])
  shape(c, body, bronze(c, w, h), { lw: 1.3, rim: 0.5 })
  gloss(c, body, cx - 6, 10, 12, 0.25)
  // Roof: radiator grilles, exhaust stacks, cab.
  grille(c, cx - 11, 6, 22, 10, 6, true)
  shape(c, rrFn(cx - 12, 19, 24, 22, 2.5), metal(c, w, h), { lw: 1.1, rim: 0.4, shade: 0.3 })
  for (const y of [24, 31]) {
    shape(c, ellipseFn(cx - 5, y + 2, 3, 3), '#15151b', { lw: 0.9, rim: 0.2, shade: 0 })
    shape(c, ellipseFn(cx + 5, y + 2, 3, 3), '#15151b', { lw: 0.9, rim: 0.2, shade: 0 })
  }
  // Cab windows toward the front.
  shape(c, rrFn(cx - 11, h - 22, 22, 9, 2), metal(c, w, h), { lw: 1.1, rim: 0.4 })
  slit(c, cx - 8, h - 17.5, cx + 8, h - 17.5, 1.3)
  // Nose plough with hazard chevrons.
  stripes(c, polyFn([[cx - 13, h - 10], [cx + 13, h - 10], [cx + 8, h - 3.5], [cx - 8, h - 3.5]]), HAZ_Y, PAL.ink, 1.8, 0.8, 1)
  for (const s of [-1, 1]) light(c, cx + s * 6, h - 3, 1.8, PAL.choir, '#ffffff')
  seams(c, [[cx - 16, 44, cx + 16, 44]], 'rgba(0,0,0,0.45)', 0.7)
  rivets(c, [[4.5, 20], [w - 4.5, 20], [4.5, 40], [w - 4.5, 40]], 0.6)
}

function carBody(c: Ctx, w: number, h: number): PathFn {
  bogies(c, w, [9, h - 9])
  // Couplers.
  for (const y of [0.5, h - 3.5]) shape(c, rrFn(w / 2 - 2.5, y, 5, 3, 0.8), PAL.gunDark, { lw: 0.8, rim: 0.3, shade: 0 })
  return rrFn(3.5, 3, w - 7, h - 6, 2.5)
}

function trainCargo(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const body = carBody(c, w, h)
  shape(c, body, lin(c, 0, 0, w, h, [[0, '#8d6f5a'], [0.5, '#5e4535'], [1, '#33251c']]), { lw: 1.3, rim: 0.45 })
  // Corrugated container ribs.
  c.save()
  body(c); c.clip()
  for (let x = 6; x < w - 4; x += 3) {
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, 3, 1.2, h - 6)
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(x + 1.2, 3, 0.8, h - 6)
  }
  c.restore()
  seams(c, [[3.5, h / 2, w - 3.5, h / 2]], 'rgba(0,0,0,0.55)', 1)
  // Loot tag: lime credit stencil.
  shape(c, rrFn(cx - 6, h / 2 - 12, 12, 8, 1.2), '#1b1d17', { lw: 0.8, rim: 0, shade: 0 })
  c.fillStyle = PAL.credit
  polyFn([[cx, h / 2 - 10.6], [cx + 2.6, h / 2 - 8], [cx, h / 2 - 5.4], [cx - 2.6, h / 2 - 8]])(c); c.fill()
  slit(c, cx - 5, h / 2 + 8, cx + 5, h / 2 + 8, 0.9)
  rivets(c, [[6, 6], [w - 6, 6], [6, h - 6], [w - 6, h - 6]], 0.6)
}

function trainFuel(c: Ctx, w: number, h: number) {
  const cx = w / 2
  carBody(c, w, h)
  shape(c, rrFn(4.5, 5, w - 9, h - 10, 4), plate(c, w, h), { lw: 1.1, rim: 0.3 })
  // Tank cylinder along Y.
  const tank = rrFn(7, 3, w - 14, h - 6, 12)
  shape(c, tank, lin(c, 7, 0, w - 7, 0, [[0, '#8f949f'], [0.28, '#f0f0ee'], [0.55, '#b9bcc4'], [1, '#4a4e59']]), { lw: 1.3, rim: 0.2 })
  // Hazard bands and a flame diamond.
  for (const y of [13, h - 17]) stripes(c, rrFn(7, y, w - 14, 4, 0.5), HAZ_Y, PAL.ink, 1.8, 0.8, 0.8)
  c.save()
  polyFn([[cx, h / 2 - 5.5], [cx + 5.5, h / 2], [cx, h / 2 + 5.5], [cx - 5.5, h / 2]])(c)
  c.fillStyle = '#e0431a'; c.fill(); c.strokeStyle = PAL.ink; c.lineWidth = 0.9; c.stroke()
  c.fillStyle = HAZ_Y
  c.beginPath(); c.ellipse(cx, h / 2 + 0.6, 1.4, 2.4, 0, 0, Math.PI * 2); c.fill()
  c.restore()
  shape(c, ellipseFn(cx, 8, 2.4, 2.4), PAL.gunDark, { lw: 0.8, rim: 0.3, shade: 0 })
}

function trainFlat(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const body = carBody(c, w, h)
  shape(c, body, lin(c, 0, 0, w, h, [[0, '#7a6a58'], [0.5, '#54473a'], [1, '#2e2720']]), { lw: 1.3, rim: 0.4 })
  // Deck planks.
  c.save()
  body(c); c.clip()
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 0.7
  c.beginPath()
  for (let y = 6; y < h - 3; y += 4) { c.moveTo(3.5, y); c.lineTo(w - 3.5, y) }
  c.stroke()
  c.restore()
  for (const s of [-1, 1]) stripes(c, rrFn(s < 0 ? 4 : w - 7.5, 5, 3.5, h - 10, 0.6), HAZ_Y, PAL.ink, 1.6, 0.8, 0.6)
  // Turret mount pad (the barrel sprite sits on it).
  shape(c, octagon(cx, cy, 12), plate(c, w, h), { lw: 1.2, rim: 0.3 })
  shape(c, ellipseFn(cx, cy, 9, 9), bronze(c, w, h), { lw: 1, rim: 0.45, shade: 0.3 })
  rivets(c, ringRivets(cx, cy, 10.5, 8, Math.PI / 8), 0.55)
  shape(c, ellipseFn(cx, cy, 5.5, 5.5), '#1b1e27', { lw: 0.9, rim: 0, shade: 0 })
}

// ─────────────── Naval (bow DOWN) ───────────────

function hullFn(cx: number, top: number, bot: number, beam: number): PathFn {
  const L = bot - top
  return sym(cx, [[0, top], [beam * 0.8, top + 0.3], [beam, top + L * 0.12], [beam, top + L * 0.62], [beam * 0.72, top + L * 0.86], [0, bot, 1]])
}

function gunboat(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const hull = hullFn(cx, 2, h - 1.5, 13)
  shape(c, hull, lin(c, 0, 0, w, h, [[0, '#6c7284'], [0.5, '#3b4052'], [1, '#1d202c']]), { lw: 1.3, rim: 0.5 })
  // Deck (bronze) inset.
  const deck = hullFn(cx, 5, h - 7, 10)
  shape(c, deck, bronze(c, w, h), { lw: 0.9, rim: 0.4, shade: 0.3 })
  // Bridge at the stern, turret ring amidships (turret_barrel is drawn at y-4).
  shape(c, rrFn(cx - 6.5, 7, 13, 10, 2), metal(c, w, h), { lw: 1.1, rim: 0.5 })
  slit(c, cx - 4, 14.5, cx + 4, 14.5, 1)
  shape(c, ellipseFn(cx, h / 2 - 4, 6.5, 6.5), PAL.gunDark, { lw: 1, rim: 0.3, shade: 0 })
  rivets(c, ringRivets(cx, h / 2 - 4, 5.2, 6), 0.5)
  grille(c, cx - 4, 36, 8, 6, 3)
  for (const s of [-1, 1]) light(c, cx + s * 4, h - 11, 1.4, PAL.choir, '#ffffff')
  // Wake foam at the stern.
  c.save()
  c.globalAlpha = 0.6
  c.fillStyle = '#ffffff'
  for (const s of [-1, 1]) { c.beginPath(); c.ellipse(cx + s * 7, 2.5, 3, 1.4, 0, 0, Math.PI * 2); c.fill() }
  c.restore()
}

function sub(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // Stern planes and screw guard at the top.
  shape(c, polyFn([[cx - 13, 9], [cx + 13, 9], [cx + 12, 13], [cx - 12, 13]]), PAL.gunDark, { lw: 1, rim: 0.3 })
  const hull = sym(cx, [[0, 1.5], [4, 4], [9, 14], [11, 30], [11, 58], [8.5, 72], [0, h - 1.5]])
  shape(c, hull, lin(c, cx - 11, 0, cx + 11, 0, [[0, '#6a7288'], [0.35, '#3e4458'], [1, '#161923']]), { lw: 1.3, rim: 0.5 })
  gloss(c, hull, cx - 4, 30, 14, 0.2)
  seams(c, [[cx, 8, cx, 26], [cx, 42, cx, 72]], 'rgba(0,0,0,0.45)', 0.7)
  // Missile hatches aft of the tower.
  for (const y of [18, 23]) for (const s of [-1, 1]) shape(c, ellipseFn(cx + s * 4, y, 2, 2), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  // Conning tower with dive planes.
  shape(c, rrFn(cx - 12, 44, 24, 3.4, 1.4), PAL.gunDark, { lw: 1, rim: 0.3 })
  const sail = sym(cx, [[0, 31], [3.4, 32], [4.2, 38], [4, 48], [2.4, 53], [0, 54]])
  shape(c, sail, bronze(c, w, h), { lw: 1.1, rim: 0.55 })
  slit(c, cx, 37, cx, 48, 1)
  light(c, cx, 52, 1.6, PAL.choir, '#ffffff')
  // Bow sensor.
  slit(c, cx - 3, h - 10, cx + 3, h - 10, 0.9)
}

function destroyerHull(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const hull = sym(cx, [[0, 2], [22, 3], [30, 16], [33, 60], [33, 116], [28, 148], [16, 170], [0, h - 1.5, 1]])
  shape(c, hull, lin(c, 0, 0, w, h, [[0, '#6c7284'], [0.5, '#3b4052'], [1, '#1a1d28']]), { lw: 1.5, rim: 0.5 })
  const deck = sym(cx, [[0, 6], [20, 7], [27, 18], [29.5, 60], [29.5, 114], [25, 146], [14, 164], [0, h - 9, 1]])
  shape(c, deck, lin(c, 0, 0, w, h, [[0, '#8c7a66'], [0.5, '#5f5142'], [1, '#3a3027']]), { lw: 1, rim: 0.35, shade: 0.35 })
  c.save()
  deck(c); c.clip()
  c.strokeStyle = 'rgba(0,0,0,0.18)'; c.lineWidth = 0.6
  c.beginPath()
  for (let x = cx - 28; x < cx + 28; x += 4) { c.moveTo(x, 0); c.lineTo(x, h) }
  c.stroke()
  c.restore()
  // Turret pads at y offsets -38 and +34 from centre.
  for (const oy of [-38, 34]) {
    const y = cy + oy
    shape(c, octagon(cx, y, 13), PAL.gunDark, { lw: 1.2, rim: 0.3 })
    shape(c, ellipseFn(cx, y, 10, 10), bronze(c, w, h), { lw: 1, rim: 0.45, shade: 0.3 })
    rivets(c, ringRivets(cx, y, 11.5, 8, Math.PI / 8), 0.6)
    shape(c, ellipseFn(cx, y, 6.5, 6.5), '#1b1e27', { lw: 0.9, rim: 0, shade: 0 })
  }
  // Superstructure between the pads: bridge + funnels.
  const sup = chamfer(cx - 15, cy - 20, 30, 38, 6)
  shape(c, sup, metal(c, w, h), { lw: 1.2, rim: 0.55 })
  shape(c, chamfer(cx - 11, cy - 16, 22, 14, 4), bronze(c, w, h), { lw: 1, rim: 0.45 })
  for (const s of [-1, 1]) shape(c, ellipseFn(cx + s * 5.5, cy + 7, 4, 5), '#16171d', { lw: 1, rim: 0.3, shade: 0 })
  slit(c, cx - 11, cy + 15, cx + 11, cy + 15, 1.2)
  grille(c, cx - 8, cy - 13, 16, 7, 5, true)
  // Stern equipment and bow detail.
  shape(c, rrFn(cx - 14, 12, 28, 18, 3), metal(c, w, h), { lw: 1.1, rim: 0.5 })
  grille(c, cx - 10, 15, 20, 5, 6, true)
  for (const s of [-1, 1]) {
    shape(c, ellipseFn(cx + s * 7, 24, 3, 3), PAL.gunDark, { lw: 0.9, rim: 0.3, shade: 0 })
    for (const y of [72, 112]) slit(c, cx + s * 24, y, cx + s * 24, y + 10, 1)
    light(c, cx + s * 26, 150, 1.6, PAL.choir, '#ffffff')
  }
  seams(c, [[cx - 20, 150, cx + 20, 150], [cx - 25, 44, cx + 25, 44]], 'rgba(0,0,0,0.45)', 0.8)
  shape(c, rrFn(cx - 1.4, 158, 2.8, 12, 1), PAL.gunDark, { lw: 0.8, rim: 0.3, shade: 0 })
}

function trawler(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const hull = sym(cx, [[0, 2], [11, 2.5], [13, 8], [13, 32], [10, 42], [0, h - 1.5, 1]])
  shape(c, hull, lin(c, 0, 0, w, h, [[0, '#ffffff'], [0.5, '#e8e4dc'], [1, '#a9a49a']]), { lw: 1.3, rim: 0.6 })
  // Red gunwale stripe.
  c.save()
  hull(c); c.clip()
  c.strokeStyle = '#d63a2f'; c.lineWidth = 3.2
  hull(c); c.stroke()
  c.restore()
  hull(c); c.strokeStyle = PAL.ink; c.lineWidth = 1.3; c.stroke()
  // Wooden aft deck with a heaped net.
  shape(c, rrFn(cx - 9, 5, 18, 17, 2), lin(c, 0, 5, 0, 22, [[0, '#c9955e'], [1, '#8a5f35']]), { lw: 0.9, rim: 0.3, shade: 0.2 })
  const net = blobFn(cx - 1, 13, 7, 6, 8, 9, 0.2)
  shape(c, net, '#3f8a7a', { lw: 0.9, rim: 0.2, shade: 0.2 })
  c.save()
  net(c); c.clip()
  c.strokeStyle = 'rgba(210,255,240,0.55)'; c.lineWidth = 0.5
  c.beginPath()
  for (let k = -16; k < 16; k += 2.2) { c.moveTo(cx + k, 4); c.lineTo(cx + k + 12, 22); c.moveTo(cx + k + 12, 4); c.lineTo(cx + k, 22) }
  c.stroke()
  c.restore()
  // Orange floats on the net.
  for (const [x, y] of [[cx - 5, 9], [cx + 4, 11], [cx - 2, 17], [cx + 5, 17]]) {
    c.fillStyle = '#ff9d2e'; c.beginPath(); c.arc(x, y, 1.1, 0, Math.PI * 2); c.fill()
    c.strokeStyle = PAL.ink; c.lineWidth = 0.5; c.stroke()
  }
  // Blue wheelhouse.
  const cab = rrFn(cx - 7, 24, 14, 11, 2)
  shape(c, cab, lin(c, 0, 24, 0, 35, [[0, '#6ba4e8'], [1, '#2a5aa8']]), { lw: 1.1, rim: 0.6 })
  shape(c, rrFn(cx - 5.5, 31.5, 11, 2.4, 0.8), '#cfeaff', { lw: 0.7, rim: 0, shade: 0 })
  // Mast and boom.
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 1.8
  c.beginPath(); c.moveTo(cx, 22); c.lineTo(cx + 10, 9); c.stroke()
  c.strokeStyle = '#f4efe6'; c.lineWidth = 0.8; c.stroke()
  c.restore()
  shape(c, ellipseFn(cx, 22, 1.6, 1.6), '#d63a2f', { lw: 0.7, rim: 0.3, shade: 0 })
  light(c, cx - 11, 38, 1.6, '#ff4040', '#ffffff')
  light(c, cx + 11, 38, 1.6, '#40ff70', '#ffffff')
}

function hangarShell(c: Ctx, w: number, h: number) {
  const cx = w / 2
  shape(c, chamfer(1, 1, w - 2, h - 2, 6), plate(c, w, h), { lw: 1.4, rim: 0.3 })
  // Arched roof: ribbed half-cylinder along X.
  const roof = rrFn(5, 4, w - 10, h - 20, 6)
  shape(c, roof, lin(c, 0, 4, 0, h - 16, [[0, '#6f7485'], [0.3, '#b9bdc9'], [0.55, '#7e8394'], [1, '#2f3240']]), { lw: 1.2, rim: 0.3 })
  c.save()
  roof(c); c.clip()
  for (let x = 9; x < w - 6; x += 6) {
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x, 4, 1, h - 20)
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x + 1, 4, 0.7, h - 20)
  }
  c.restore()
  shape(c, rrFn(cx - 18, 8, 36, 5, 1.5), bronze(c, w, h), { lw: 0.9, rim: 0.4, shade: 0 })
  slit(c, cx - 14, 10.5, cx + 14, 10.5, 1)
  // Launch doors at the front (bottom) with hazard jambs.
  stripes(c, rrFn(6, h - 17, w - 12, 14, 2), HAZ_Y, PAL.ink, 2, 0.8, 1)
  const door = rrFn(12, h - 16, w - 24, 12.5, 1)
  shape(c, door, lin(c, 0, h - 16, 0, h - 3, [[0, '#262a36'], [1, '#0e0f15']]), { lw: 1, rim: 0.2, shade: 0 })
  c.save()
  door(c); c.clip()
  c.fillStyle = rad(c, cx, h - 3, 18, [[0, 'rgba(163,21,90,0.55)'], [1, 'rgba(0,0,0,0)']])
  c.fillRect(12, h - 16, w - 24, 12.5)
  c.restore()
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 1.2
  c.beginPath(); c.moveTo(cx, h - 16); c.lineTo(cx, h - 3.5); c.stroke()
  c.restore()
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) light(c, cx + s * (8 + i * 5), h - 2, 1.1, PAL.choir, '#ffffff')
  }
  for (const s of [-1, 1]) grille(c, s < 0 ? 8 : w - 16, 20, 8, 12, 4)
}

/** Choir antenna spine: dark mast with bronze vertebrae and a singing tip. */
function spine(c: Ctx, x: number, y: number, len: number, ang: number) {
  const dx = Math.cos(ang), dy = Math.sin(ang)
  c.save()
  c.lineCap = 'round'
  c.strokeStyle = PAL.ink; c.lineWidth = 2.4
  c.beginPath(); c.moveTo(x, y); c.lineTo(x + dx * len, y + dy * len); c.stroke()
  c.strokeStyle = PAL.gunLight; c.lineWidth = 1; c.stroke()
  c.restore()
  for (let t = 0.3; t < 0.95; t += 0.3) {
    const px = x + dx * len * t, py = y + dy * len * t
    shape(c, polyFn([[px - dy * 2.4, py + dx * 2.4], [px + dx * 1.2, py + dy * 1.2], [px + dy * 2.4, py - dx * 2.4], [px - dx * 1.2, py - dy * 1.2]]), PAL.bronze, { lw: 0.6, rim: 0.4, shade: 0 })
  }
  light(c, x + dx * len, y + dy * len, 1.8, PAL.choir, '#ffffff')
}

function destroyer(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  destroyerHull(c, w, h)
  // Bronze armour belts down both flanks, each with a singing slit.
  for (const s of [-1, 1]) {
    for (const [y0, y1] of [[34, 66], [74, 110], [118, 142]]) {
      const x0 = cx + s * 23.5, x1 = cx + s * 29
      shape(c, polyFn([[x0, y0 + 3], [x1, y0], [x1, y1], [x0, y1 - 3]]), bronzeMetal(c, w, h), { lw: 0.9, rim: 0.45, shade: 0.3 })
      slit(c, (x0 + x1) / 2, y0 + 6, (x0 + x1) / 2, y1 - 6, 0.8)
    }
  }
  // Antenna spines raked back from the superstructure.
  spine(c, cx - 9, cy - 18, 14, -Math.PI / 2 - 0.5)
  spine(c, cx + 9, cy - 18, 14, -Math.PI / 2 + 0.5)
  spine(c, cx, cy - 20, 18, -Math.PI / 2)
  // Bow ram plate and a VLS cell bank aft.
  shape(c, sym(cx, [[0, 150], [9, 152], [6, 164], [0, 172, 1]]), bronzeMetal(c, w, h), { lw: 1, rim: 0.5 })
  slit(c, cx - 3.5, 158, cx + 3.5, 158, 1)
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) shape(c, rrFn(cx + s * 5 - 2, 33 + i * 5, 4, 3.6, 0.6), PAL.gunDark, { lw: 0.7, rim: 0.3, shade: 0 })
}

function hangar(c: Ctx, w: number, h: number) {
  const cx = w / 2
  hangarShell(c, w, h)
  // Bronze buttress plates bolted along the roof edges.
  for (const s of [-1, 1]) {
    for (const y of [16, 28]) {
      const x = s < 0 ? 4 : w - 10
      shape(c, polyFn([[x, y], [x + 6, y + 1.5], [x + 6, y + 9.5], [x, y + 11]]), bronzeMetal(c, w, h), { lw: 0.9, rim: 0.45, shade: 0.3 })
    }
    slit(c, cx + s * 22, 20, cx + s * 22, 40, 0.9)
  }
  // Antenna spines on the rear corners.
  spine(c, 9, 7, 9, -Math.PI * 0.75)
  spine(c, w - 9, 7, 9, -Math.PI * 0.25)
  shape(c, ellipseFn(cx, 26, 5, 5), bronzeMetal(c, w, h), { lw: 1, rim: 0.5 })
  light(c, cx, 26, 2.6, PAL.choir, '#ffffff')
}

function pylon(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, octagon(cx, cy, 14.5), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    shape(c, polyFn([[cx + Math.cos(a - 0.35) * 7, cy + Math.sin(a - 0.35) * 7], [cx + Math.cos(a) * 13, cy + Math.sin(a) * 13], [cx + Math.cos(a + 0.35) * 7, cy + Math.sin(a + 0.35) * 7]]), bronze(c, w, h), { lw: 0.9, rim: 0.45, shade: 0.2 })
  }
  shape(c, ellipseFn(cx, cy, 8, 8), metal(c, w, h), { lw: 1.1, rim: 0.55 })
  // Emitter crystal.
  const cr = polyFn([[cx, cy - 5.5], [cx + 3.6, cy], [cx, cy + 5.5], [cx - 3.6, cy]])
  shape(c, cr, lin(c, cx - 4, cy - 5, cx + 4, cy + 5, [[0, '#ffd0e6'], [0.5, PAL.choir], [1, PAL.choirDeep]]), { lw: 0.9, rim: 0.5, shade: 0.2 })
  light(c, cx, cy, 5, PAL.choir, '#ffffff')
  rivets(c, ringRivets(cx, cy, 11, 4), 0.6)
}

function node(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const ivory = lin(c, 0, 0, w, h, [[0, '#fffaf0'], [0.45, '#dccfb4'], [1, '#7d6c55']])
  // Short bone buttresses at the four corners.
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + i * Math.PI / 2
    const p = (r: number, da = 0): Pt => [cx + Math.cos(a + da) * r, cy + Math.sin(a + da) * r, 1]
    shape(c, polyFn([p(15, -0.28), p(23.5), p(15, 0.28)]), ivory, { lw: 1, rim: 0.6, shade: 0.3 })
    shape(c, ellipseFn(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, 1.6, 1.6), bronze(c, w, h), { lw: 0.6, rim: 0.3, shade: 0 })
  }
  // Reliquary casket: octagonal ivory body in a bronze frame.
  shape(c, octagonFn(cx, cy, 19), bronze(c, w, h), { lw: 1.3, rim: 0.5 })
  const body = octagonFn(cx, cy, 16.5)
  shape(c, body, ivory, { lw: 1.1, rim: 0.7 })
  // Magenta veins spreading through the bone.
  c.save()
  body(c); c.clip()
  const r = rng(99)
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + r() * 0.3
    const bend = (r() - 0.5) * 0.9
    for (const [lw, col] of [[2.6, 'rgba(255,46,136,0.25)'], [0.9, 'rgba(210,30,110,0.95)']] as [number, string][]) {
      c.strokeStyle = col; c.lineWidth = lw
      c.beginPath(); c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8)
      c.quadraticCurveTo(cx + Math.cos(a + bend) * 12, cy + Math.sin(a + bend) * 12, cx + Math.cos(a + bend * 0.4) * 17, cy + Math.sin(a + bend * 0.4) * 17)
      c.stroke()
    }
  }
  c.restore()
  // Bone ribs across the lid.
  for (const s of [-1, 1]) {
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 2.6
    c.beginPath(); c.moveTo(cx + s * 13, cy - 11); c.quadraticCurveTo(cx + s * 16, cy, cx + s * 13, cy + 11); c.stroke()
    c.strokeStyle = '#f4ecdc'; c.lineWidth = 1.3; c.stroke()
    c.restore()
  }
  // Glass reliquary dome with the singing core inside.
  shape(c, ellipseFn(cx, cy, 8.5, 8.5), bronze(c, w, h), { lw: 1.1, rim: 0.6 })
  shape(c, ellipseFn(cx, cy, 6.3, 6.3), rad(c, cx, cy, 7, [[0, '#ff9ccb'], [0.35, PAL.choirDeep], [1, '#2a0716']]), { lw: 0.9, rim: 0, shade: 0 })
  light(c, cx, cy, 5.5, PAL.choir, PAL.choirHot)
  c.fillStyle = 'rgba(255,255,255,0.75)'
  c.beginPath(); c.ellipse(cx - 2.4, cy - 2.6, 1.9, 1, -0.7, 0, Math.PI * 2); c.fill()
  rivets(c, [[cx, cy - 17.6], [cx, cy + 17.6], [cx - 17.6, cy], [cx + 17.6, cy]], 0.7)
}

export function registerGround() {
  defineSprite('turret_base', 32, 32, turretBase)
  defineSprite('turret_barrel', 10, 30, turretBarrel)
  defineSprite('flak_base', 40, 40, flakBase)
  defineSprite('flak_barrel', 40, 40, flakBarrel)
  defineSprite('tank_body', 30, 40, tankBody)
  defineSprite('tank_turret', 16, 30, tankTurret)
  defineSprite('artillery', 44, 44, artillery)
  defineSprite('artillery_barrel', 12, 42, artilleryBarrel)
  defineSprite('silo', 46, 46, silo)
  defineSprite('generator', 54, 54, generator)
  defineSprite('fuel', 34, 34, fuel)
  defineSprite('radar', 38, 38, radarBase)
  defineSprite('radar_dish', 36, 14, radarDish)
  defineSprite('bunker', 66, 58, bunker)
  defineSprite('cache', 32, 28, (c, w, h) => crate(c, w, h, 'credit'))
  defineSprite('repair_cache', 32, 28, (c, w, h) => crate(c, w, h, 'repair'))
  defineSprite('train_engine', 40, 66, trainEngine)
  defineSprite('train_cargo', 40, 56, trainCargo)
  defineSprite('train_fuel', 40, 56, trainFuel)
  defineSprite('train_flat', 40, 56, trainFlat)
  defineSprite('gunboat', 30, 58, gunboat)
  defineSprite('sub', 34, 82, sub)
  defineSprite('destroyer', 72, 184, destroyer)
  defineSprite('trawler', 30, 50, trawler)
  defineSprite('hangar', 74, 66, hangar)
  defineSprite('pylon', 32, 32, pylon)
  defineSprite('node', 50, 50, node)
}
