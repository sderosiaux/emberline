/**
 * The Choir air fleet. Graphite hulls, oxidised bronze plates, thin magenta
 * "singing" slits. Every air unit faces DOWN (nose toward +y).
 */
import { defineSprite } from '../sprites'
import { PAL, lin, rad, light, slit, seams, choirMetal, bronzeMetal } from '../paint'
import {
  shape, sym, polyFn, ellipseFn, rrFn, octagonFn, mirrored, lens, rivets, plume, gloss, glowLine, grille, blobFn, rng,
  type Ctx, type Pt, type PathFn,
} from './kit'

const metal = (c: Ctx, w: number, h: number) => choirMetal(c, w, h)
const bronze = (c: Ctx, w: number, h: number) => bronzeMetal(c, w, h)
const darkMetal = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, PAL.gun], [0.5, PAL.gunDark], [1, '#101219']])

/** Dim violet-magenta exhaust at the rear (top) of a Choir craft. */
function choirExhaust(c: Ctx, x: number, y: number, r: number) {
  plume(c, x, y, r * 1.5, r * 1.1, 'rgba(163,21,90,0.45)', 'rgba(255,150,205,0.7)', -1)
  light(c, x, y, r * 0.9, PAL.choirDeep, '#ffb3d6')
}

/** A barrel pointing down: dark tube + muzzle ring. */
function barrel(c: Ctx, x: number, y0: number, y1: number, wd: number) {
  shape(c, rrFn(x - wd / 2, y0, wd, y1 - y0, wd * 0.3), lin(c, x - wd / 2, 0, x + wd / 2, 0, [[0, PAL.gunLight], [0.5, PAL.gun], [1, PAL.gunDark]]), { lw: 0.9, rim: 0.4, shade: 0.3 })
  shape(c, rrFn(x - wd / 2 - 0.5, y1 - 2, wd + 1, 2, 0.6), bronzeMetal(c, x * 2, y1 * 2), { lw: 0.8, rim: 0.4, shade: 0 })
}

// ─────────────── Small craft ───────────────

function dartShape(c: Ctx, cx: number, top: number, s: number, w: number, h: number, slits = true) {
  const P = (x: number, y: number, k = 0): Pt => [x * s, top + y * s, k]
  shape(c, sym(cx, [P(0, 5, 1), P(6, 2.5), P(12, 1.5, 1), P(11.2, 5), P(5, 14.5), P(2.6, 21.5), P(0, 26, 1)]), metal(c, w, h), { lw: 1.1 * Math.min(1, s + 0.2) })
  shape(c, sym(cx, [P(0, 8, 1), P(2.4, 10.5), P(2.2, 18.5), P(0, 23.5, 1)]), bronze(c, w, h), { lw: 0.8, rim: 0.5, shade: 0.3 })
  if (slits) for (const sg of [-1, 1]) slit(c, cx + sg * 3.3 * s, top + 9 * s, cx + sg * 9 * s, top + 4.2 * s, 1.1 * s + 0.2)
  else slit(c, cx, top + 11 * s, cx, top + 17 * s, 0.8)
  seams(c, [[cx, top + 11 * s, cx, top + 20 * s]], 'rgba(0,0,0,0.4)', 0.6)
}

function dart(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx, 5, 2.2)
  dartShape(c, cx, 1, 1, w, h)
  light(c, cx, 24, 1.4, PAL.choir, '#ffffff')
}

function wasp(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx, 4, 2.2)
  // Forward-swept blade wings, tips raking toward the nose.
  const wing = polyFn([[cx + 3.5, 7], [cx + 14.5, 5], [cx + 16.5, 22.5, 1], [cx + 10, 15.5], [cx + 4, 17]])
  for (const m of [false, true]) shape(c, m ? mirrored(cx, wing) : wing, darkMetal(c, w, h), { lw: 1.1, rim: 0.4 })
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 14.5, 5], [cx + s * 16.5, 22.5], [cx + s * 13.2, 12]]), bronze(c, w, h), { lw: 0.8, rim: 0.45, shade: 0 })
    slit(c, cx + s * 5.5, 10, cx + s * 9.5, 8.2, 0.8)
    barrel(c, cx + s * 8.6, 12, 26, 2)
    shape(c, ellipseFn(cx + s * 8.6, 14, 2.1, 3.4), bronze(c, w, h), { lw: 0.8, rim: 0.5 })
  }
  const body = sym(cx, [[0, 2], [2.8, 4], [4, 10.5], [3.6, 19], [2.4, 25], [0, 31.5, 1]])
  shape(c, body, metal(c, w, h), { lw: 1.2 })
  gloss(c, body, cx - 1.5, 8, 4, 0.3)
  shape(c, sym(cx, [[0, 20], [2.8, 21.5], [2.2, 27], [0, 31, 1]]), bronze(c, w, h), { lw: 0.9, rim: 0.5 })
  for (const y of [9, 12, 15]) slit(c, cx - 1.9, y, cx + 1.9, y, 0.8)
  slit(c, cx - 1, 25, cx + 1, 25, 0.9)
}

function lancer(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx, 3, 2)
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 2, 10], [cx + s * 11, 1.5], [cx + s * 12, 4.5], [cx + s * 5, 14], [cx + s * 3.5, 19]]), darkMetal(c, w, h), { lw: 1, rim: 0.35 })
    slit(c, cx + s * 4.5, 9.5, cx + s * 9.5, 4.5, 0.9)
  }
  // Ram prow: long bronze needle.
  const prow = sym(cx, [[0, 19], [2, 21.5], [1.6, 28], [0.8, 34], [0, 37.5, 1]])
  shape(c, prow, bronze(c, w, h), { lw: 1, rim: 0.6 })
  seams(c, [[cx - 1.4, 26, cx + 1.4, 26], [cx - 1, 30.5, cx + 1, 30.5]], 'rgba(0,0,0,0.45)', 0.6)
  const body = sym(cx, [[0, 1], [2.8, 3.5], [4.2, 11], [3.8, 19], [2.4, 24], [0, 25.5]])
  shape(c, body, metal(c, w, h), { lw: 1.2 })
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 4.6 - 0.9, 7, 1.8, 13, 0.8), bronze(c, w, h), { lw: 0.8, rim: 0.4, shade: 0 })
  }
  slit(c, cx, 7, cx, 19, 1.2)
}

function weaver(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const cres = sym(cx, [[0, 2.5], [9.5, 4], [16, 9.5], [18.4, 18], [16.8, 27.5, 1], [13.4, 18.5], [8.5, 13.2], [0, 12]])
  shape(c, cres, metal(c, w, h), { lw: 1.2, rim: 0.55 })
  // Bronze horn tips and inner rib.
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 15.2, 20], [cx + s * 18, 19.5], [cx + s * 16.8, 27.5], [cx + s * 14.3, 21]]), bronze(c, w, h), { lw: 0.8, rim: 0.5, shade: 0 })
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 2.2; c.lineCap = 'round'
    c.beginPath(); c.moveTo(cx + s * 3, 6); c.quadraticCurveTo(cx + s * 13, 6.5, cx + s * 15.4, 16); c.stroke()
    c.restore()
    // Two slits following the crescent.
    slit(c, cx + s * 4, 7, cx + s * 9.5, 7.8, 0.9)
    slit(c, cx + s * 12, 10, cx + s * 14.6, 15, 0.9)
  }
  // Central pod hanging from the crescent.
  const pod = sym(cx, [[0, 6], [4, 8], [5, 14], [3.6, 20], [0, 23.5, 1]])
  shape(c, pod, bronze(c, w, h), { lw: 1.1, rim: 0.6 })
  lens(c, cx, 15, 2.2, PAL.choir, '#ffffff', 0.5)
  choirExhaust(c, cx, 3.5, 1.6)
}

// ─────────────── Heavies ───────────────

function bomber(c: Ctx, w: number, h: number) {
  const cx = w / 2
  for (const x of [-22, -13, 13, 22]) choirExhaust(c, cx + x, 7, 2.4)
  const wing = polyFn([[cx + 8, 13], [cx + 30, 19], [cx + 32.5, 25, 1], [cx + 28, 31], [cx + 9, 36]], true)
  for (const m of [false, true]) shape(c, m ? mirrored(cx, wing) : wing, darkMetal(c, w, h), { lw: 1.2, rim: 0.4 })
  for (const s of [-1, 1]) {
    // Bronze armour tiles along the wings.
    for (const [x0, x1] of [[10, 18], [19, 27]]) {
      shape(c, polyFn([[cx + s * x0, 17 + x0 * 0.2], [cx + s * x1, 17 + x1 * 0.22], [cx + s * x1, 27], [cx + s * x0, 30]]), bronze(c, w, h), { lw: 0.8, rim: 0.4, shade: 0.25 })
    }
    slit(c, cx + s * 11, 32.5, cx + s * 25, 30, 1)
    // Engine nacelles.
    for (const x of [13, 22]) {
      shape(c, sym(cx + s * x, [[0, 7], [2.8, 8], [3.2, 14], [2.8, 24], [0, 27]]), metal(c, w, h), { lw: 1, rim: 0.5 })
      grille(c, cx + s * x - 1.8, 9.5, 3.6, 4, 3)
    }
    light(c, cx + s * 31, 24.5, 1.5, PAL.choir, '#ffffff')
  }
  const hull = sym(cx, [[0, 2], [7, 3.5], [11, 11], [12.5, 24], [11.5, 40], [7.5, 50], [0, 54.5, 1]])
  shape(c, hull, metal(c, w, h), { lw: 1.3, rim: 0.55 })
  gloss(c, hull, cx - 5, 10, 10, 0.25)
  // Bomb bay: recessed doors with faint heat inside.
  shape(c, rrFn(cx - 6.5, 18, 13, 22, 2), '#0e0d15', { lw: 1, rim: 0, shade: 0 })
  c.save()
  rrFn(cx - 6.5, 18, 13, 22, 2)(c); c.clip()
  c.fillStyle = rad(c, cx, 29, 9, [[0, 'rgba(163,21,90,0.55)'], [1, 'rgba(0,0,0,0)']])
  c.fillRect(cx - 7, 18, 14, 22)
  for (const y of [21, 26.5, 32, 37.5]) {
    shape(c, ellipseFn(cx - 2.8, y, 2, 1.6), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
    shape(c, ellipseFn(cx + 2.8, y, 2, 1.6), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  }
  c.restore()
  seams(c, [[cx, 18, cx, 40], [cx - 6.5, 29, cx + 6.5, 29]], 'rgba(0,0,0,0.6)', 0.7)
  // Bronze nose cap with a sensor slit.
  shape(c, sym(cx, [[0, 42], [6.5, 43.5], [6, 49], [0, 54.5, 1]]), bronze(c, w, h), { lw: 1, rim: 0.6 })
  slit(c, cx - 3, 47.5, cx + 3, 47.5, 1.2)
  seams(c, [[cx - 9, 10, cx + 9, 10], [cx - 11, 43, cx - 7, 43], [cx + 7, 43, cx + 11, 43]], 'rgba(0,0,0,0.4)', 0.7)
  rivets(c, [[cx - 9, 14], [cx + 9, 14], [cx - 10, 38], [cx + 10, 38]], 0.6)
}

function missile(c: Ctx, x: number, y0: number, y1: number, w: number, h: number) {
  for (const s of [-1, 1]) shape(c, polyFn([[x, y0 + 1], [x + s * 2.6, y0 - 0.5], [x + s * 2.6, y0 + 2.5], [x + s * 1.2, y0 + 4]]), PAL.gunDark, { lw: 0.6, rim: 0, shade: 0 })
  shape(c, sym(x, [[0, y0], [1.5, y0 + 0.5], [1.6, y1 - 4], [0, y1, 1]]), lin(c, x - 2, 0, x + 2, 0, [[0, '#c9ccd8'], [0.5, '#8a8fa2'], [1, '#4a4e5e']]), { lw: 0.8, rim: 0.4, shade: 0.2 })
  shape(c, sym(x, [[0, y1 - 5], [1.6, y1 - 4.5], [0, y1, 1]]), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  c.fillStyle = PAL.choirDeep
  c.fillRect(x - 1.5, y0 + 5, 3, 0.8)
}

function missileer(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx, 3, 2.4)
  // Rack pylons.
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 5, 9], [cx + s * 23, 11], [cx + s * 23.5, 15], [cx + s * 22, 26], [cx + s * 12, 28], [cx + s * 6, 22]], true), darkMetal(c, w, h), { lw: 1.1, rim: 0.4 })
    shape(c, rrFn(s > 0 ? cx + 9 : cx - 23, 12.5, 14, 3.4, 1), bronze(c, w, h), { lw: 0.8, rim: 0.4, shade: 0.2 })
    for (const x of [12.5, 19]) missile(c, cx + s * x, 13, 33, w, h)
    rivets(c, [[cx + s * 10.5, 14.2], [cx + s * 21, 14.2]], 0.5)
  }
  const hull = sym(cx, [[0, 1.5], [5, 3], [7.4, 11], [7, 25], [4.5, 36], [0, 42, 1]])
  shape(c, hull, metal(c, w, h), { lw: 1.2 })
  gloss(c, hull, cx - 3, 8, 7, 0.28)
  shape(c, sym(cx, [[0, 8], [4, 9.5], [4.4, 20], [2.8, 27], [0, 29]]), bronze(c, w, h), { lw: 0.9, rim: 0.5 })
  for (const y of [12, 15.5, 19]) slit(c, cx - 2.4, y, cx + 2.4, y, 0.9)
  slit(c, cx, 32, cx, 38, 1.1)
}

function sniper(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx - 4, 3.5, 1.6)
  choirExhaust(c, cx + 4, 3.5, 1.6)
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 6, 8], [cx + s * 13, 4], [cx + s * 13.5, 7], [cx + s * 9, 17], [cx + s * 6, 20]]), darkMetal(c, w, h), { lw: 1, rim: 0.35 })
    slit(c, cx + s * 8, 9, cx + s * 11.8, 6.8, 0.8)
  }
  // Long barrel with bronze collars and a muzzle brake.
  shape(c, rrFn(cx - 1.4, 20, 2.8, 20, 1), lin(c, cx - 1.5, 0, cx + 1.5, 0, [[0, PAL.gunEdge], [0.5, PAL.gun], [1, PAL.gunDark]]), { lw: 0.9, rim: 0.3, shade: 0 })
  for (const y of [24, 30]) shape(c, rrFn(cx - 2.2, y, 4.4, 1.8, 0.6), bronze(c, w, h), { lw: 0.7, rim: 0.4, shade: 0 })
  shape(c, rrFn(cx - 2.6, 37.5, 5.2, 4, 1), bronze(c, w, h), { lw: 0.8, rim: 0.5, shade: 0.2 })
  c.fillStyle = PAL.ink; c.fillRect(cx - 2.2, 38.8, 4.4, 0.7)
  const body = sym(cx, [[0, 1.5], [5.5, 3], [8.5, 9], [8.6, 16], [6, 22], [0, 25.5]])
  shape(c, body, metal(c, w, h), { lw: 1.2 })
  // Lens housing.
  shape(c, ellipseFn(cx, 13, 6.6, 6.6), bronze(c, w, h), { lw: 1, rim: 0.6 })
  lens(c, cx, 13, 4.8, PAL.choir, PAL.choirHot, 0.45)
}

function gunship(c: Ctx, w: number, h: number) {
  const cx = w / 2
  for (const x of [-9, 0, 9]) choirExhaust(c, cx + x, 4, 3)
  for (const x of [-30, 30]) choirExhaust(c, cx + x, 12, 2.4)
  // Angular armoured sponsons.
  const spon = polyFn([[cx + 12, 9, 1], [cx + 34, 11, 1], [cx + 42.5, 22, 1], [cx + 42.5, 44, 1], [cx + 36, 56, 1], [cx + 22, 62, 1], [cx + 13, 60, 1]])
  for (const m of [false, true]) shape(c, m ? mirrored(cx, spon) : spon, darkMetal(c, w, h), { lw: 1.3, rim: 0.4 })
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 19, 14], [cx + s * 33, 15], [cx + s * 39.5, 24], [cx + s * 21, 27]]), bronze(c, w, h), { lw: 0.9, rim: 0.5, shade: 0.3 })
    shape(c, polyFn([[cx + s * 21, 45], [cx + s * 39.5, 45], [cx + s * 34, 54], [cx + s * 21, 58]]), bronze(c, w, h), { lw: 0.9, rim: 0.5, shade: 0.3 })
    seams(c, [[cx + s * 26, 14.5, cx + s * 27, 26.5], [cx + s * 29, 45, cx + s * 28, 56]], 'rgba(0,0,0,0.45)', 0.6)
    grille(c, cx + s * 28 - 3, 7.5, 6, 5, 3, true)
    slit(c, cx + s * 40.5, 29, cx + s * 40.5, 40, 1.1)
    rivets(c, [[cx + s * 21.5, 17], [cx + s * 36, 23], [cx + s * 23.5, 55], [cx + s * 36.5, 47]], 0.6)
  }
  // Central hull.
  const hull = sym(cx, [[0, 1.5], [9, 3], [15.5, 12, 1], [17.5, 30], [17, 56], [10, 70], [0, 78, 1]])
  shape(c, hull, metal(c, w, h), { lw: 1.4, rim: 0.55 })
  gloss(c, hull, cx - 7, 14, 14, 0.25)
  shape(c, sym(cx, [[0, 6], [8, 7.5], [11.5, 16, 1], [0, 19]]), bronze(c, w, h), { lw: 1, rim: 0.5 })
  grille(c, cx - 5, 9.5, 10, 5, 4, true)
  seams(c, [[cx - 17, 24, cx + 17, 24], [cx - 17, 46, cx + 17, 46], [cx - 12, 64, cx + 12, 64]], 'rgba(0,0,0,0.45)', 0.7)
  for (const s of [-1, 1]) {
    slit(c, cx + s * 7, 60, cx + s * 4, 70, 1.1)
    slit(c, cx + s * 13.5, 28, cx + s * 13.5, 42, 1)
  }
  // Turrets: heavy twin dorsal, one per sponson, one chin.
  const turret = (x: number, y: number, r: number, twin: boolean) => {
    if (twin) { barrel(c, x - 1.8, y, y + r + 8, 2); barrel(c, x + 1.8, y, y + r + 8, 2) }
    else barrel(c, x, y, y + r + 6, 2.2)
    shape(c, ellipseFn(x, y, r, r), lin(c, x - r, y - r, x + r, y + r, [[0, PAL.bronzeLight], [0.5, PAL.bronze], [1, PAL.bronzeDark]]), { lw: 1, rim: 0.6 })
    shape(c, ellipseFn(x, y + 0.4, r * 0.55, r * 0.55), metal(c, w, h), { lw: 0.8, rim: 0.4, shade: 0 })
    light(c, x, y + r * 0.2, r * 0.35, PAL.choir, '#ffffff')
  }
  turret(cx, 34, 7.5, true)
  turret(cx - 30, 35, 5.2, false)
  turret(cx + 30, 35, 5.2, false)
  turret(cx, 55, 4.6, false)
}

function carrier(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // Transept wings: angular dark plates behind the nave.
  const wing = polyFn([[cx + 38, 26], [cx + 58, 32], [cx + 71, 48], [cx + 72, 98], [cx + 62, 114], [cx + 42, 120]])
  for (const m of [false, true]) shape(c, m ? mirrored(cx, wing) : wing, darkMetal(c, w, h), { lw: 1.4, rim: 0.35 })
  for (const s of [-1, 1]) {
    // Flying buttresses: bronze ribs from the nave wall out to spired pinnacles.
    for (const y of [44, 64, 84, 104]) {
      const x0 = cx + s * 42, x1 = cx + s * 64
      shape(c, polyFn([[x0, y - 3], [x1, y], [x1, y + 5], [x0, y + 6]]), bronze(c, w, h), { lw: 1, rim: 0.5, shade: 0.3 })
      shape(c, polyFn([[x1 + s * 7, y + 2.5, 1], [x1, y - 3, 1], [x1 - s * 2, y + 2.5, 1], [x1, y + 8, 1]]), bronze(c, w, h), { lw: 1, rim: 0.55, shade: 0.2 })
      light(c, x1 + s * 1.5, y + 2.5, 1.5, PAL.choir, '#ffffff')
    }
    for (const y of [54, 74, 94]) slit(c, cx + s * 69, y - 2, cx + s * 69, y + 6, 0.9)
    for (let i = 0; i < 3; i++) grille(c, cx + s * (44 + i * 6) - 2.4, 29 + i * 1.8, 4.8, 6, 3, true)
  }
  for (const x of [-16, 16]) choirExhaust(c, cx + x, 16, 3.6)
  // Main hull: a long gothic nave ending in a pointed prow.
  const hull = sym(cx, [[0, 12], [18, 14], [34, 24], [42, 42], [44, 100], [42, 128], [32, 150], [16, 164], [0, 170, 1]])
  shape(c, hull, metal(c, w, h), { lw: 1.6, rim: 0.5 })
  gloss(c, hull, cx - 18, 36, 40, 0.2)
  // Apse at the rear (top): crown of radiating spires.
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 9)
    const r0 = 24, r1 = i % 2 ? 34 : 40
    const ox = cx, oy = 40
    const tip: Pt = [ox + Math.cos(a) * r1, oy + Math.sin(a) * r1 * 0.9, 1]
    const l: Pt = [ox + Math.cos(a - 0.09) * r0, oy + Math.sin(a - 0.09) * r0, 1]
    const r: Pt = [ox + Math.cos(a + 0.09) * r0, oy + Math.sin(a + 0.09) * r0, 1]
    shape(c, polyFn([l, tip, r]), i % 2 ? darkMetal(c, w, h) : bronze(c, w, h), { lw: 1, rim: 0.5, shade: 0.2 })
  }
  // Side aisles: lancet window pairs (tall thin slits) under bronze hoods.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const y = 46 + i * 20
      shape(c, sym(cx + s * 30, [[0, y - 2, 1], [4.6, y + 3], [4.6, y + 13], [0, y + 14]]), darkMetal(c, w, h), { lw: 0.9, rim: 0.3, shade: 0.2 })
      slit(c, cx + s * 28.6, y + 4, cx + s * 28.6, y + 12, 0.8)
      slit(c, cx + s * 31.4, y + 4, cx + s * 31.4, y + 12, 0.8)
    }
    seams(c, [[cx + s * 22, 30, cx + s * 22, 128], [cx + s * 38, 44, cx + s * 38, 124]], 'rgba(0,0,0,0.45)', 0.8)
  }
  // Nave: a sunken bronze strip crossed by pointed rib vaults.
  const nave = sym(cx, [[0, 22], [9, 24], [13, 32], [13, 112], [0, 118, 1]])
  shape(c, nave, lin(c, 0, 0, w, h, [[0, '#6e5a44'], [0.5, '#4a3a2a'], [1, '#2a2018']]), { lw: 1.2, rim: 0.3, shade: 0.4 })
  c.save()
  nave(c); c.clip()
  for (let y = 34; y <= 108; y += 9) {
    c.lineJoin = 'round'
    c.strokeStyle = PAL.ink; c.lineWidth = 2.8
    c.beginPath(); c.moveTo(cx - 14, y); c.lineTo(cx, y + 6); c.lineTo(cx + 14, y); c.stroke()
    c.strokeStyle = PAL.bronzeLight; c.lineWidth = 1.3; c.stroke()
  }
  c.restore()
  glowLine(c, cx, 36, cx, 110, 0.8, PAL.choir, 0.55)
  // Rose window over the apse.
  shape(c, ellipseFn(cx, 34, 10, 10), bronze(c, w, h), { lw: 1.2, rim: 0.6 })
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    slit(c, cx + Math.cos(a) * 4.8, 34 + Math.sin(a) * 4.8, cx + Math.cos(a) * 8.2, 34 + Math.sin(a) * 8.2, 0.8)
  }
  lens(c, cx, 34, 3.4, PAL.choir, PAL.choirHot, 0.4)
  // Flat turret mount pads at (±40, +28).
  for (const s of [-1, 1]) {
    const px = cx + s * 40, py = cy + 28
    shape(c, octagonFn(px, py, 12.5), darkMetal(c, w, h), { lw: 1.2, rim: 0.3 })
    shape(c, ellipseFn(px, py, 10, 10), lin(c, px - 10, py - 10, px + 10, py + 10, [[0, '#5a6072'], [1, '#2a2e3b']]), { lw: 0.8, rim: 0.25, shade: 0.2 })
    const rv: [number, number][] = []
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; rv.push([px + Math.cos(a) * 11.3, py + Math.sin(a) * 11.3]) }
    rivets(c, rv, 0.55)
  }
  // Launch bay near the bottom: a pointed-arch portal with a glowing throat.
  const portal = sym(cx, [[0, 118, 1], [12, 124], [18, 134], [18, 162], [0, 162]])
  shape(c, portal, bronze(c, w, h), { lw: 1.3, rim: 0.5 })
  const bay = sym(cx, [[0, 124, 1], [9, 129], [13.5, 138], [13.5, 159], [0, 159]])
  shape(c, bay, '#0b0a12', { lw: 1.2, rim: 0, shade: 0 })
  c.save()
  bay(c); c.clip()
  c.fillStyle = rad(c, cx, 136, 24, [[0, 'rgba(163,21,90,0.65)'], [0.6, 'rgba(90,10,60,0.25)'], [1, 'rgba(0,0,0,0)']])
  c.fillRect(cx - 15, 122, 30, 40)
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 0.8
  c.beginPath()
  for (let y = 136; y < 160; y += 5) { c.moveTo(cx - 14, y); c.lineTo(cx + 14, y) }
  c.stroke()
  c.restore()
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) light(c, cx + s * 16, 138 + i * 7, 1.3, PAL.choir, '#ffffff')
  glowLine(c, cx - 10, 159.5, cx + 10, 159.5, 1, PAL.choir, 0.9)
}

function turretSmall(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const oct = polyFn(Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4 + Math.PI / 8
    return [cx + Math.cos(a) * 10, cy + Math.sin(a) * 10] as Pt
  }))
  shape(c, oct, darkMetal(c, w, h), { lw: 1.2, rim: 0.4 })
  shape(c, ellipseFn(cx, cy, 7, 7), bronze(c, w, h), { lw: 1, rim: 0.5 })
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    slit(c, cx + Math.cos(a) * 7.8, cy + Math.sin(a) * 7.8, cx + Math.cos(a) * 9.2, cy + Math.sin(a) * 9.2, 0.8)
  }
}

function barrelSmall(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  barrel(c, cx, cy - 1, h - 0.8, 2.6)
  shape(c, ellipseFn(cx, cy, 4.3, 4.3), metal(c, w, h), { lw: 1, rim: 0.5 })
  slit(c, cx - 1.6, cy + 0.6, cx + 1.6, cy + 0.6, 0.8)
}

// ─────────────── Support & specials ───────────────

function warden(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.strokeStyle = 'rgba(118,242,255,0.22)'; c.lineWidth = 4
  c.beginPath(); c.arc(cx, cy, 20.5, 0, Math.PI * 2); c.stroke()
  c.restore()
  // Halo ring.
  const ring: PathFn = cc => { cc.beginPath(); cc.arc(cx, cy, 19.5, 0, Math.PI * 2); cc.arc(cx, cy, 14, 0, Math.PI * 2, true) }
  shape(c, ring, metal(c, w, h), { lw: 1.2, rim: 0.5 })
  for (let i = 0; i < 8; i++) {
    const a0 = i * Math.PI / 4 + 0.12, a1 = a0 + Math.PI / 4 - 0.24
    if (i % 2) continue
    const seg: PathFn = cc => { cc.beginPath(); cc.arc(cx, cy, 18.6, a0, a1); cc.arc(cx, cy, 15, a1, a0, true); cc.closePath() }
    shape(c, seg, bronze(c, w, h), { lw: 0.8, rim: 0.45, shade: 0.2 })
  }
  // Struts to the core.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 3.2
    c.beginPath(); c.moveTo(cx + Math.cos(a) * 6, cy + Math.sin(a) * 6); c.lineTo(cx + Math.cos(a) * 14.5, cy + Math.sin(a) * 14.5); c.stroke()
    c.strokeStyle = PAL.gunLight; c.lineWidth = 1.5; c.stroke()
    c.restore()
  }
  // Four cyan emitter nodes on the ring.
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2
    const x = cx + Math.cos(a) * 17, y = cy + Math.sin(a) * 17
    shape(c, ellipseFn(x, y, 3.4, 3.4), bronze(c, w, h), { lw: 1, rim: 0.5 })
    light(c, x, y, 3.2, PAL.shotCyan, '#ffffff')
  }
  // Core.
  const core = ellipseFn(cx, cy, 6.5, 6.5)
  shape(c, core, metal(c, w, h), { lw: 1.1, rim: 0.6 })
  lens(c, cx, cy, 3.4, PAL.shotCyan, '#ffffff', 0.7)
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    slit(c, cx + Math.cos(a) * 9.5 - Math.sin(a) * 1.4, cy + Math.sin(a) * 9.5 + Math.cos(a) * 1.4,
      cx + Math.cos(a) * 9.5 + Math.sin(a) * 1.4, cy + Math.sin(a) * 9.5 - Math.cos(a) * 1.4, 0.8)
  }
}

function mender(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // Three rotor arms.
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / 3)
    const x = cx + Math.cos(a) * 11, y = cy + Math.sin(a) * 11
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 3.4
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(x, y); c.stroke()
    c.strokeStyle = PAL.bronze; c.lineWidth = 1.6; c.stroke()
    c.restore()
    const rotor = ellipseFn(x, y, 5, 5)
    shape(c, rotor, darkMetal(c, w, h), { lw: 1, rim: 0.4 })
    c.save()
    c.strokeStyle = 'rgba(210,220,240,0.45)'; c.lineWidth = 1
    c.beginPath(); c.arc(x, y, 3.6, a, a + 2); c.stroke()
    c.beginPath(); c.arc(x, y, 3.6, a + Math.PI, a + Math.PI + 2); c.stroke()
    c.restore()
    shape(c, ellipseFn(x, y, 1.4, 1.4), bronze(c, w, h), { lw: 0.6, rim: 0.3, shade: 0 })
  }
  const body = ellipseFn(cx, cy, 8, 8)
  shape(c, body, metal(c, w, h), { lw: 1.2, rim: 0.6 })
  shape(c, ellipseFn(cx, cy, 5.6, 5.6), '#0f1a14', { lw: 0.9, rim: 0, shade: 0 })
  // Green repair cross emitter.
  light(c, cx, cy, 7, '#5dff8a', '#eaffe8')
  c.save()
  c.fillStyle = '#eaffe0'
  c.fillRect(cx - 0.9, cy - 3.4, 1.8, 6.8)
  c.fillRect(cx - 3.4, cy - 0.9, 6.8, 1.8)
  c.restore()
  for (let i = 0; i < 3; i++) {
    const a = Math.PI / 2 + i * (Math.PI * 2 / 3) + Math.PI / 3
    slit(c, cx + Math.cos(a) * 6.8, cy + Math.sin(a) * 6.8, cx + Math.cos(a + 0.4) * 6.8, cy + Math.sin(a + 0.4) * 6.8, 0.7)
  }
}

function mine(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    const tip: Pt = [cx + Math.cos(a) * 13.2, cy + Math.sin(a) * 13.2, 1]
    const l: Pt = [cx + Math.cos(a - 0.3) * 7, cy + Math.sin(a - 0.3) * 7, 1]
    const r: Pt = [cx + Math.cos(a + 0.3) * 7, cy + Math.sin(a + 0.3) * 7, 1]
    shape(c, polyFn([l, tip, r]), bronze(c, w, h), { lw: 0.9, rim: 0.4, shade: 0.2 })
  }
  const ball = ellipseFn(cx, cy, 8.4, 8.4)
  shape(c, ball, rad(c, cx - 3, cy - 3, 12, [[0, PAL.gunEdge], [0.35, PAL.gun], [1, PAL.gunDark]]), { lw: 1.2, rim: 0.3 })
  seams(c, [[cx - 8, cy, cx + 8, cy], [cx, cy - 8, cx, cy + 8]], 'rgba(0,0,0,0.45)', 0.6)
  rivets(c, [[cx - 4, cy - 4], [cx + 4, cy - 4], [cx - 4, cy + 4], [cx + 4, cy + 4]], 0.6)
  shape(c, ellipseFn(cx, cy, 3, 3), '#120d16', { lw: 0.8, rim: 0, shade: 0 })
  light(c, cx, cy, 3.4, PAL.choir, '#ffffff')
}

function seeker(c: Ctx, w: number, h: number) {
  const cx = w / 2
  choirExhaust(c, cx, 3, 2)
  for (const s of [-1, 1]) shape(c, polyFn([[cx + s * 3, 4], [cx + s * 9.5, 1.5], [cx + s * 9, 5], [cx + s * 5, 11]]), darkMetal(c, w, h), { lw: 0.9, rim: 0.3 })
  const body = sym(cx, [[0, 1.5], [4.2, 3], [6.4, 9], [5.4, 15], [2.6, 20], [0, 23, 1]])
  shape(c, body, metal(c, w, h), { lw: 1.1 })
  shape(c, sym(cx, [[0, 13], [4.8, 14.5], [3, 19.5], [0, 23, 1]]), bronze(c, w, h), { lw: 0.9, rim: 0.6 })
  slit(c, cx - 2.2, 16.5, cx + 2.2, 16.5, 1.1)
  slit(c, cx, 5, cx, 10.5, 0.9)
}

function phantom(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const outline: Pt[] = [[0, 5, 1], [7, 2, 1], [19.5, 12, 1], [16, 13.5, 1], [17.5, 17, 1], [9, 19, 1], [5, 27, 1], [0, 36.5, 1]]
  const body = sym(cx, outline)
  // Violet edge bloom.
  c.save()
  c.globalCompositeOperation = 'lighter'
  body(c)
  c.strokeStyle = 'rgba(150,90,255,0.35)'; c.lineWidth = 3
  c.stroke()
  c.restore()
  shape(c, body, lin(c, 0, 0, w, h, [[0, '#3a3552'], [0.5, '#1b1928'], [1, '#0b0a12']]), { lw: 1.1, rim: 0.25, shade: 0.3 })
  // Faceted panels: two tones catching light differently.
  c.save()
  body(c); c.clip()
  c.fillStyle = 'rgba(255,255,255,0.06)'
  polyFn([[cx, 5], [cx - 7, 2], [cx - 19.5, 12], [cx, 20]])(c); c.fill()
  c.fillStyle = 'rgba(0,0,0,0.25)'
  polyFn([[cx, 20], [cx + 9, 19], [cx + 5, 27], [cx, 36.5]])(c); c.fill()
  c.restore()
  seams(c, [[cx, 5, cx, 36], [cx - 7, 2, cx, 20], [cx + 7, 2, cx, 20], [cx - 9, 19, cx, 20], [cx + 9, 19, cx, 20]], 'rgba(170,130,255,0.35)', 0.6)
  // Violet edge highlights on leading edges.
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.strokeStyle = 'rgba(190,150,255,0.8)'; c.lineWidth = 0.8
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(cx + s * 5, 27); c.lineTo(cx, 36.5); c.stroke()
    c.beginPath(); c.moveTo(cx + s * 7, 2); c.lineTo(cx + s * 19.5, 12); c.stroke()
  }
  c.restore()
  for (const s of [-1, 1]) slit(c, cx + s * 2.5, 24, cx + s * 5.5, 21, 0.8, '#b06cff')
}

function splitter(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // Docking frame: a bronze Y-yoke the three darts clamp onto.
  c.save()
  c.lineCap = 'round'
  for (const [x, y] of [[cx - 12, 12], [cx + 12, 12], [cx, 30]] as [number, number][]) {
    c.strokeStyle = PAL.ink; c.lineWidth = 4.2
    c.beginPath(); c.moveTo(cx, 19); c.lineTo(x, y); c.stroke()
    c.strokeStyle = PAL.bronze; c.lineWidth = 2.2; c.stroke()
  }
  c.restore()
  const small = (x: number, y: number, rot: number) => {
    c.save()
    c.translate(x, y); c.rotate(rot); c.translate(-9.5, -10)
    choirExhaust(c, 9.5, 3.5, 1.4)
    dartShape(c, 9.5, 0, 0.73, 19, 20, false)
    c.restore()
  }
  small(cx - 12.5, 12, 0.3)
  small(cx + 12.5, 12, -0.3)
  small(cx, 31, 0)
  shape(c, ellipseFn(cx, 19, 4.2, 4.2), bronze(c, w, h), { lw: 1, rim: 0.6 })
  shape(c, ellipseFn(cx, 19, 2, 2), '#140d16', { lw: 0.7, rim: 0, shade: 0 })
  light(c, cx, 19, 2.4, PAL.choir, '#ffffff')
}

function escapee(c: Ctx, w: number, h: number) {
  const cx = w / 2
  plume(c, cx, 3, 4, 4, 'rgba(181,140,255,0.8)', '#ffffff', -1)
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 5, 8], [cx + s * 12, 5], [cx + s * 12.5, 9], [cx + s * 8, 16]], true), lin(c, 0, 0, w, h, [[0, '#f5d58a'], [1, '#8a6420']]), { lw: 0.9, rim: 0.5 })
  }
  const body = sym(cx, [[0, 1.5], [5.6, 3.5], [8.4, 11], [8, 22], [5, 29.5], [0, 33]])
  shape(c, body, lin(c, 0, 0, w, h, [[0, '#f3e6ff'], [0.2, '#c49bff'], [0.42, '#ff8fd0'], [0.6, '#7fd8ff'], [0.8, '#8a5cff'], [1, '#3a1f7a']]), { lw: 1.2, rim: 0.7 })
  gloss(c, body, cx - 3, 9, 8, 0.55)
  // Gold trims.
  c.save()
  body(c); c.clip()
  c.strokeStyle = PAL.ink; c.lineWidth = 2
  for (const y of [8, 24]) { c.beginPath(); c.moveTo(cx - 9, y); c.quadraticCurveTo(cx, y + 2.4, cx + 9, y); c.stroke() }
  c.strokeStyle = '#ffd98a'; c.lineWidth = 1
  for (const y of [8, 24]) { c.beginPath(); c.moveTo(cx - 9, y); c.quadraticCurveTo(cx, y + 2.4, cx + 9, y); c.stroke() }
  c.restore()
  // Precious core window.
  shape(c, ellipseFn(cx, 16, 3.4, 4.6), rad(c, cx - 1, 14.5, 5, [[0, '#ffffff'], [0.4, '#e8d0ff'], [1, '#7a4dd6']]), { lw: 0.9, rim: 0.3, shade: 0 })
  light(c, cx, 16, 4, '#d9b8ff', '#ffffff')
  slit(c, cx - 2, 28, cx + 2, 28, 0.8, '#c49bff')
}

// ─────────────── Asteroids ───────────────

function rock(c: Ctx, w: number, h: number, seed: number, ore: boolean) {
  const cx = w / 2, cy = h / 2
  const rx = w / 2 - 1.5, ry = h / 2 - 1.5
  const body = blobFn(cx, cy, rx, ry, seed, 12, 0.14)
  shape(c, body, rad(c, cx - rx * 0.4, cy - ry * 0.45, Math.max(rx, ry) * 1.7, [[0, '#a89886'], [0.35, '#7c6c5c'], [0.75, '#4e4238'], [1, '#2c241f']]), { lw: 1.2, rim: 0.35, shade: 0.5 })
  const r = rng(seed * 7 + 3)
  c.save()
  body(c); c.clip()
  c.fillStyle = rad(c, cx + rx * 0.55, cy + ry * 0.6, Math.max(rx, ry) * 1.1, [[0, 'rgba(15,10,8,0.45)'], [1, 'rgba(15,10,8,0)']])
  c.fillRect(0, 0, w, h)
  // Mottled strata.
  for (let i = 0; i < 6; i++) {
    const x = cx + (r() - 0.5) * rx * 1.6, y = cy + (r() - 0.5) * ry * 1.6
    c.fillStyle = r() < 0.5 ? 'rgba(40,30,24,0.18)' : 'rgba(200,180,150,0.1)'
    c.beginPath(); c.ellipse(x, y, rx * (0.2 + r() * 0.3), ry * (0.12 + r() * 0.2), r() * 3, 0, Math.PI * 2); c.fill()
  }
  // Craters: dark bowl, lit lower-right lip.
  const n = Math.max(2, Math.round((rx + ry) / 14))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 1.2, d = 0.25 + r() * 0.45
    const x = cx + Math.cos(a) * rx * d, y = cy + Math.sin(a) * ry * d
    const cr = Math.max(1.6, Math.min(rx, ry) * (0.14 + r() * 0.16))
    c.fillStyle = 'rgba(25,18,14,0.5)'
    c.beginPath(); c.ellipse(x, y, cr, cr * 0.85, 0, 0, Math.PI * 2); c.fill()
    c.strokeStyle = 'rgba(235,215,185,0.55)'; c.lineWidth = 0.9
    c.beginPath(); c.ellipse(x, y, cr, cr * 0.85, 0, 0.1, Math.PI * 0.9); c.stroke()
    c.strokeStyle = 'rgba(10,8,6,0.45)'; c.lineWidth = 0.7
    c.beginPath(); c.ellipse(x, y, cr, cr * 0.85, 0, Math.PI * 1.1, Math.PI * 1.9); c.stroke()
  }
  c.restore()
  if (!ore) return
  // Lime crystal veins and clusters.
  c.save()
  body(c); c.clip()
  const vein = (pts: [number, number][]) => {
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.lineJoin = 'round'
    for (const [lw, col] of [[3, 'rgba(198,255,61,0.25)'], [1.1, 'rgba(230,255,160,0.95)']] as [number, string][]) {
      c.strokeStyle = col; c.lineWidth = lw
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1])
      c.stroke()
    }
    c.restore()
  }
  vein([[cx - 17, cy - 6], [cx - 8, cy - 3], [cx - 3, cy + 4], [cx + 6, cy + 5], [cx + 15, cy + 12]])
  vein([[cx - 3, cy + 4], [cx - 6, cy + 13]])
  vein([[cx + 6, cy + 5], [cx + 10, cy - 8], [cx + 16, cy - 11]])
  c.restore()
  const crystal = (x: number, y: number, s: number, rot: number) => {
    c.save()
    c.translate(x, y); c.rotate(rot)
    const p = polyFn([[0, -s * 1.6], [s * 0.7, -s * 0.2], [s * 0.4, s * 0.9], [-s * 0.5, s * 0.9], [-s * 0.7, -s * 0.3]])
    shape(c, p, lin(c, -s, -s, s, s, [[0, '#f4ffc8'], [0.4, PAL.credit], [1, '#4f7a0a']]), { lw: 0.8, rim: 0.6, shade: 0.2 })
    c.fillStyle = 'rgba(255,255,255,0.6)'
    polyFn([[0, -s * 1.6], [-s * 0.7, -s * 0.3], [-s * 0.1, s * 0.2]])(c); c.fill()
    c.restore()
  }
  light(c, cx - 3, cy + 3, 9, 'rgba(198,255,61,0.55)', 'rgba(240,255,200,0.9)')
  crystal(cx - 4, cy + 3, 3.2, -0.3)
  crystal(cx, cy + 4, 2.4, 0.4)
  crystal(cx + 11, cy - 9, 2.4, 0.5)
  crystal(cx - 13, cy - 5, 2, -0.8)
  light(c, cx + 11, cy - 9, 4, PAL.credit, '#ffffff')
}

// ─────────────── Final level ───────────────

function cantor(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // Organ pipes across the rear (top), tallest at the centre.
  const pipes = [-15, -11, -7, -3, 3, 7, 11, 15]
  for (const x of pipes) {
    const top = 2 + Math.abs(x) * 0.45
    shape(c, rrFn(cx + x - 1.8, top, 3.6, 22 - top, 1.6), lin(c, cx + x - 2, 0, cx + x + 2, 0, [[0, PAL.bronzeLight], [0.5, PAL.bronze], [1, PAL.bronzeDark]]), { lw: 0.9, rim: 0.4, shade: 0.2 })
    c.fillStyle = PAL.ink
    c.beginPath(); c.ellipse(cx + x, top + 1.6, 1.1, 0.7, 0, 0, Math.PI * 2); c.fill()
    slit(c, cx + x, top + 5, cx + x, top + 7.5, 0.7)
  }
  // Flying buttresses.
  for (const s of [-1, 1]) {
    const arm = polyFn([[cx + s * 14, 18], [cx + s * 25, 20], [cx + s * 26, 30, 1], [cx + s * 20, 42], [cx + s * 16, 36]], true)
    shape(c, arm, lin(c, 0, 0, w, h, [[0, PAL.gunLight], [0.5, PAL.gun], [1, PAL.gunDark]]), { lw: 1.1, rim: 0.4 })
    slit(c, cx + s * 22, 24, cx + s * 21, 34, 0.9)
  }
  // Nave: a gothic arch pointing down.
  const nave = sym(cx, [[0, 14], [9, 15], [15, 22], [16, 32], [12, 43], [0, 53, 1]])
  shape(c, nave, lin(c, 0, 0, w, h, [[0, '#ece2cf'], [0.4, '#b7ab96'], [1, '#5d5446']]), { lw: 1.3, rim: 0.6 })
  gloss(c, nave, cx - 5, 20, 10, 0.35)
  // Rose window.
  shape(c, ellipseFn(cx, 27, 8.4, 8.4), metal(c, w, h), { lw: 1.1, rim: 0.5 })
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4
    slit(c, cx + Math.cos(a) * 3.4, 27 + Math.sin(a) * 3.4, cx + Math.cos(a) * 6.8, 27 + Math.sin(a) * 6.8, 0.8)
  }
  shape(c, ellipseFn(cx, 27, 2.4, 2.4), bronze(c, w, h), { lw: 0.8, rim: 0.5, shade: 0 })
  // Vowel mouth: open "O" vent with an inner glow rim.
  shape(c, ellipseFn(cx, 43, 4.6, 5.4), '#140a12', { lw: 1.2, rim: 0, shade: 0 })
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.strokeStyle = PAL.choir; c.lineWidth = 1.1
  c.beginPath(); c.ellipse(cx, 43, 3.4, 4.2, 0, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = 'rgba(255,208,230,0.8)'; c.lineWidth = 0.5; c.stroke()
  c.restore()
  light(c, cx, 44, 3, PAL.choirDeep, PAL.choir)
  seams(c, [[cx - 12, 36, cx - 6, 38], [cx + 12, 36, cx + 6, 38]], 'rgba(60,40,30,0.5)', 0.7)
}

export function registerEnemies() {
  defineSprite('dart', 26, 28, dart, true)
  defineSprite('wasp', 34, 34, wasp, true)
  defineSprite('lancer', 26, 38, lancer, true)
  defineSprite('weaver', 38, 30, weaver, true)
  defineSprite('bomber', 66, 56, bomber, true)
  defineSprite('missileer', 50, 44, missileer, true)
  defineSprite('sniper', 28, 42, sniper, true)
  defineSprite('gunship', 88, 80, gunship, true)
  defineSprite('carrier', 150, 172, carrier, true)
  defineSprite('turret_small', 22, 22, turretSmall)
  defineSprite('barrel_small', 10, 24, barrelSmall)
  defineSprite('warden', 46, 46, warden, true)
  defineSprite('mender', 34, 34, mender, true)
  defineSprite('mine', 28, 28, mine, true)
  defineSprite('seeker', 22, 24, seeker, true)
  defineSprite('phantom', 40, 38, phantom, true)
  defineSprite('splitter', 44, 44, splitter, true)
  defineSprite('escapee', 26, 34, escapee, true)
  defineSprite('rock_l', 72, 68, (c, w, h) => rock(c, w, h, 11, false), true)
  defineSprite('rock_m', 42, 40, (c, w, h) => rock(c, w, h, 23, false), true)
  defineSprite('rock_s', 24, 22, (c, w, h) => rock(c, w, h, 37, false), true)
  defineSprite('ore_rock', 46, 44, (c, w, h) => rock(c, w, h, 51, true), true)
  defineSprite('cantor', 54, 54, cantor, true)
}
