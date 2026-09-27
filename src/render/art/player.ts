/** KESTREL gunship and its option pods. Ivory ceramic, ember accents, teal glass. Nose UP. */
import { defineSprite, type Painter } from '../sprites'
import { PAL, lin, rad, light, seams, ivoryMetal } from '../paint'
import { shape, sym, polyFn, ellipseFn, glass, gloss, plume, glowLine, type Ctx, type Pt } from './kit'

/** Right-wing outline (relative x ≥ 0, absolute y). */
const WING: Pt[] = [[3, 17], [9, 23], [15, 26.5], [21, 19.5, 1], [22.5, 30], [21.5, 37, 1], [14, 37.5], [8, 40], [3, 40]]
const CANARD: Pt[] = [[3, 11], [8.5, 14.5, 1], [8.5, 17], [3, 17.5]]
const HULL: Pt[] = [[0, 1, 1], [1.7, 4], [3.2, 9], [4.6, 17], [5.4, 28], [5.2, 38], [4, 45], [2.4, 47.5, 1], [0, 48]]
const CANOPY: Pt[] = [[0, 8.5, 1], [2, 10.5], [2.7, 14], [2.3, 18.5], [0, 20.5]]

function side(pts: Pt[], cx: number, sgn: number, k: number): Pt[] {
  return pts.map(p => [cx + sgn * p[0] * k, p[1], p[2] ?? 0] as Pt)
}

/** bank = 0 → level flight; bank = 1 → rolled to its right (right wing dipped, left flank shown). */
function kestrel(bank: number): Painter {
  return (c, w, h) => {
    const cx = w / 2 + bank * 0.8
    const kR = 1 - 0.42 * bank, kL = 1 - 0.04 * bank
    const hullK = 1 - 0.12 * bank

    // Engine plumes sit under everything.
    for (const s of [-1, 1]) {
      const k = s > 0 ? kR : kL
      plume(c, cx + s * 7 * k, 45.5, 5, 3.4, PAL.ember, PAL.emberHot)
    }
    plume(c, cx, 47, 3, 3, PAL.ember, PAL.emberHot)

    // Wings (right one darker when banked: it tilts away from the key light).
    for (const s of [-1, 1]) {
      const k = s > 0 ? kR : kL
      const wing = polyFn(side(WING, cx, s, k), true)
      const fill = s > 0 && bank
        ? lin(c, 0, 0, w, h, [[0, PAL.ivoryMid], [0.6, PAL.ivoryDark], [1, '#5f5446']])
        : ivoryMetal(c, w, h)
      shape(c, wing, fill, { lw: 1.2, rim: s < 0 ? 0.8 : 0.4 })
      // Flap panel + ember leading-edge stripe + wingtip light.
      c.save()
      wing(c); c.clip()
      c.fillStyle = 'rgba(80,64,48,0.22)'
      polyFn(side([[4, 36], [20, 34], [21, 37], [14, 37.5], [8, 40], [4, 40]], cx, s, k))(c); c.fill()
      c.restore()
      glowLine(c, cx + s * 5.5 * k, 21, cx + s * 15 * k, 27, 0.8, PAL.ember, 0.8)
      seams(c, [[cx + s * 8 * k, 26, cx + s * 18 * k, 31.5], [cx + s * 12 * k, 30, cx + s * 12.5 * k, 37]], 'rgba(60,45,30,0.4)', 0.6)
      light(c, cx + s * 20.8 * k, 21, 2.2, s < 0 ? PAL.ember : PAL.teal, '#ffffff')
      // Canards
      shape(c, polyFn(side(CANARD, cx, s, k), true), ivoryMetal(c, w, h), { lw: 1 })
    }

    // Engine nacelles.
    for (const s of [-1, 1]) {
      const k = s > 0 ? kR : kL
      const x = cx + s * 7 * k
      const nac = sym(x, [[0, 27], [2.2, 29], [2.8, 36], [2.6, 44], [1.8, 46, 1], [0, 46]])
      shape(c, nac, lin(c, x - 3, 0, x + 3, 0, [[0, '#ffffff'], [0.4, PAL.ivoryMid], [1, PAL.ivoryDark]]), { lw: 1.1, rim: 0.4 })
      c.fillStyle = PAL.ember; c.fillRect(x - 2.4, 40, 4.8, 1)
      c.fillStyle = PAL.ink
      c.beginPath(); c.ellipse(x, 45.6, 1.9, 1, 0, 0, Math.PI * 2); c.fill()
      light(c, x, 46, 2.8, PAL.ember, PAL.emberHot)
    }

    // Fuselage (widened on the left when rolled, so the flank shows).
    const hull = sym(cx, HULL, 1 + 0.3 * bank, hullK)
    shape(c, hull, lin(c, cx - 6, 0, cx + 6, 0, [[0, '#ffffff'], [0.35, PAL.ivory], [0.75, PAL.ivoryMid], [1, PAL.ivoryDark]]), { lw: 1.25, rim: 0.7 })
    gloss(c, hull, cx - 2, 14, 9, 0.45)
    if (bank) {
      c.save()
      hull(c); c.clip()
      c.fillStyle = lin(c, cx - 7, 0, cx - 3, 0, [[0, 'rgba(70,56,40,0.75)'], [1, 'rgba(70,56,40,0)']])
      c.fillRect(cx - 8, 0, 5, h)
      c.restore()
      hull(c); c.strokeStyle = PAL.ink; c.lineWidth = 1.25; c.stroke()
    }
    // Spine: ember racing stripe and dorsal seams.
    c.save()
    hull(c); c.clip()
    c.fillStyle = PAL.ember
    c.fillRect(cx - 0.9 * hullK, 22, 1.8 * hullK, 16)
    c.fillStyle = PAL.emberDeep
    c.fillRect(cx - 0.9 * hullK + 1.2, 22, 0.6, 16)
    c.restore()
    seams(c, [[cx - 4.4 * hullK, 24, cx + 4.4 * hullK, 24], [cx - 4.8 * hullK, 32, cx + 4.8 * hullK, 32], [cx - 3.6 * hullK, 40, cx + 3.6 * hullK, 40]], 'rgba(60,45,30,0.45)', 0.6)
    // Ember chevrons near the tail.
    c.save()
    c.strokeStyle = PAL.ember; c.lineWidth = 1
    c.beginPath(); c.moveTo(cx - 3 * hullK, 43); c.lineTo(cx, 41.4); c.lineTo(cx + 3 * hullK, 43); c.stroke()
    c.restore()
    // Nose cannon.
    c.fillStyle = PAL.ink
    c.fillRect(cx - 0.6, 0.5, 1.2, 3)
    // Canopy (shifts toward the raised side when rolled).
    const cp = sym(cx + bank * 0.9, CANOPY, hullK, hullK)
    glass(c, cp, cx - 2, 8.5, cx + 2, 20.5)
    // Intake slits either side of the canopy.
    c.fillStyle = 'rgba(20,16,24,0.75)'
    for (const s of [-1, 1]) {
      c.beginPath(); c.ellipse(cx + s * 3.6 * hullK, 22, 0.7, 2, s * 0.1, 0, Math.PI * 2); c.fill()
    }
  }
}

// ─────────────── Pods ───────────────

function podWasp(c: Ctx, w: number, h: number) {
  const cx = w / 2
  plume(c, cx, 17.5, 3.5, 3, PAL.ember, PAL.emberHot)
  for (const s of [-1, 1]) shape(c, polyFn([[cx + s * 2, 9], [cx + s * 7, 14], [cx + s * 7, 17.5], [cx + s * 2, 16]]), ivoryMetal(c, w, h), { lw: 1 })
  const body = sym(cx, [[0, 3], [2.4, 4.5], [3.6, 10], [3.2, 16], [2, 18, 1], [0, 18]])
  shape(c, body, ivoryMetal(c, w, h), { lw: 1.1, rim: 0.7 })
  for (const s of [-1, 1]) {
    c.fillStyle = PAL.ink
    c.fillRect(cx + s * 1.4 - 0.55, 0.5, 1.1, 5)
  }
  glass(c, ellipseFn(cx, 9, 1.6, 2.4), cx, 6.5, cx, 11.5, undefined, 0.8)
  glowLine(c, cx - 5.5, 15.5, cx - 2.5, 13.5, 0.8, PAL.ember)
  glowLine(c, cx + 5.5, 15.5, cx + 2.5, 13.5, 0.8, PAL.ember)
  light(c, cx, 17.5, 2.4, PAL.ember, PAL.emberHot)
}

function podViper(c: Ctx, w: number, h: number) {
  const cx = w / 2
  plume(c, cx, 19.5, 3, 3.2, PAL.ember, PAL.emberHot)
  for (const s of [-1, 1]) shape(c, polyFn([[cx + s * 2.5, 12], [cx + s * 7, 19.5], [cx + s * 2.5, 18]]), PAL.ember, { lw: 0.9, rim: 0.5 })
  const body = sym(cx, [[0, 1, 1], [1.8, 4], [3, 10], [3, 17], [2.2, 20, 1], [0, 20]])
  shape(c, body, ivoryMetal(c, w, h), { lw: 1.1, rim: 0.7 })
  c.save(); body(c); c.clip()
  c.fillStyle = PAL.ember; c.fillRect(cx - 4, 3, 8, 3.4)
  c.fillStyle = PAL.emberDeep; c.fillRect(cx - 4, 6.4, 8, 0.7)
  c.restore()
  body(c); c.strokeStyle = PAL.ink; c.lineWidth = 1.1; c.stroke()
  glass(c, ellipseFn(cx, 11, 1.4, 2.6), cx, 8.4, cx, 13.6, undefined, 0.8)
  light(c, cx, 19.8, 2.3, PAL.ember, PAL.emberHot)
}

function podAegis(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.fillStyle = rad(c, cx, cy, 12, [[0, 'rgba(118,242,255,0.5)'], [0.55, 'rgba(64,216,207,0.18)'], [1, 'rgba(0,0,0,0)']])
  c.fillRect(0, 0, w, h)
  c.restore()
  // Outer ring with four ivory clamps.
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 3.6
  c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = lin(c, 0, 0, w, h, [[0, '#ffffff'], [0.5, PAL.ivoryMid], [1, PAL.ivoryDark]]); c.lineWidth = 2
  c.beginPath(); c.arc(cx, cy, 9, 0, Math.PI * 2); c.stroke()
  c.restore()
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    const x = cx + Math.cos(a) * 9, y = cy + Math.sin(a) * 9
    shape(c, ellipseFn(x, y, 2, 1.4, a + Math.PI / 2), PAL.ember, { lw: 0.8, rim: 0.5 })
  }
  // Orb.
  c.fillStyle = PAL.ink
  c.beginPath(); c.arc(cx, cy, 6.2, 0, Math.PI * 2); c.fill()
  c.fillStyle = rad(c, cx - 1.8, cy - 1.8, 7, [[0, '#ffffff'], [0.3, PAL.shotCyan], [0.75, PAL.teal], [1, PAL.tealDark]])
  c.beginPath(); c.arc(cx, cy, 5.4, 0, Math.PI * 2); c.fill()
  light(c, cx, cy, 5, PAL.shotCyan, '#ffffff')
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.beginPath(); c.ellipse(cx - 2, cy - 2.2, 1.6, 0.9, -0.7, 0, Math.PI * 2); c.fill()
}

function podSpark(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const hex = polyFn(Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3 + Math.PI / 6
    return [cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5] as Pt
  }))
  shape(c, hex, ivoryMetal(c, w, h), { lw: 1.1, rim: 0.7 })
  // Copper coil windings.
  c.save()
  c.fillStyle = lin(c, cx - 4, 0, cx + 4, 0, [[0, '#f0a060'], [0.5, '#b9652a'], [1, '#6e3712']])
  c.beginPath(); c.roundRect(cx - 4, cy - 4.5, 8, 9, 1.5); c.fill()
  c.strokeStyle = PAL.ink; c.lineWidth = 0.9; c.stroke()
  c.strokeStyle = 'rgba(40,20,5,0.7)'; c.lineWidth = 0.6
  c.beginPath()
  for (let y = cy - 3; y <= cy + 3.1; y += 1.5) { c.moveTo(cx - 4, y); c.lineTo(cx + 4, y) }
  c.stroke()
  c.restore()
  // Electric arcs crackling between the terminals.
  const zig = (pts: [number, number][]) => {
    c.save()
    c.globalCompositeOperation = 'lighter'
    c.lineJoin = 'miter'
    for (const [lw, col, a] of [[2.6, PAL.shotGreen, 0.35], [0.9, '#eaffd8', 1]] as [number, string, number][]) {
      c.globalAlpha = a; c.strokeStyle = col; c.lineWidth = lw
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1])
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1])
      c.stroke()
    }
    c.restore()
  }
  zig([[cx - 6, cy - 5], [cx - 3, cy - 7], [cx, cy - 5.5], [cx + 3, cy - 7.5], [cx + 6, cy - 5]])
  zig([[cx - 6, cy + 5], [cx - 2.5, cy + 7.5], [cx + 0.5, cy + 6], [cx + 6, cy + 5]])
  for (const [x, y] of [[cx - 6.5, cy - 3.7], [cx + 6.5, cy - 3.7], [cx - 6.5, cy + 3.7], [cx + 6.5, cy + 3.7]]) {
    light(c, x, y, 2.4, PAL.shotGreen, '#ffffff')
  }
}

function podLantern(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2 + 0.5
  light(c, cx, cy, 10, '#ffb84a', '#fff4c8')
  // Cage: top cap, bottom cap, four ribs.
  const cage = sym(cx, [[0, 3], [3.5, 4], [7, 8], [7.5, cy], [7, 15], [3.5, 19], [0, 20]])
  c.save()
  cage(c); c.strokeStyle = PAL.ink; c.lineWidth = 2.6; c.stroke()
  c.strokeStyle = lin(c, 0, 0, w, h, [[0, '#fff2c0'], [0.5, '#c79a3a'], [1, '#6e4a14']]); c.lineWidth = 1.3; c.stroke()
  c.restore()
  c.save()
  c.fillStyle = rad(c, cx - 1, cy - 1.5, 6.5, [[0, '#ffffff'], [0.3, '#ffe38a'], [0.8, '#ffae2a'], [1, '#c26a0a']])
  c.beginPath(); c.ellipse(cx, cy, 4.3, 5.5, 0, 0, Math.PI * 2); c.fill()
  c.strokeStyle = PAL.ink; c.lineWidth = 0.8; c.stroke()
  c.restore()
  for (const s of [-1, 1]) {
    c.strokeStyle = PAL.ink; c.lineWidth = 1.8
    c.beginPath(); c.moveTo(cx + s * 3, 4.2); c.quadraticCurveTo(cx + s * 6.4, cy, cx + s * 3, 18.8); c.stroke()
    c.strokeStyle = '#d8a84a'; c.lineWidth = 0.8; c.stroke()
  }
  for (const y of [3.5, 19.5]) shape(c, ellipseFn(cx, y, 3.4, 1.5), lin(c, cx - 3, 0, cx + 3, 0, [[0, '#ffe9a8'], [1, '#8a5b17']]), { lw: 0.9, rim: 0.5 })
  light(c, cx, cy, 4.2, '#ffd27a', '#ffffff')
}

function podMirror(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const outer: Pt[] = [[cx, 1, 1], [cx + 7.5, 9, 1], [cx + 5.5, 20, 1], [cx - 5.5, 20, 1], [cx - 7.5, 9, 1]]
  c.save()
  polyFn(outer)(c)
  c.fillStyle = lin(c, 0, 0, w, h, [[0, '#ffffff'], [0.22, '#b9c6d6'], [0.4, '#eef4ff'], [0.55, '#5b6679'], [0.72, '#d3dcea'], [1, '#3a4152']])
  c.fill()
  c.restore()
  // Facets.
  const facet = (pts: Pt[], col: string) => { c.save(); polyFn(pts)(c); c.fillStyle = col; c.fill(); c.restore() }
  facet([[cx, 1], [cx - 7.5, 9], [cx, 11]], 'rgba(255,255,255,0.55)')
  facet([[cx, 1], [cx + 7.5, 9], [cx, 11]], 'rgba(170,200,230,0.35)')
  facet([[cx + 7.5, 9], [cx + 5.5, 20], [cx, 11]], 'rgba(20,24,40,0.45)')
  facet([[cx - 5.5, 20], [cx + 5.5, 20], [cx, 11]], 'rgba(60,70,90,0.35)')
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.strokeStyle = 'rgba(160,255,250,0.55)'; c.lineWidth = 0.7
  c.beginPath(); c.moveTo(cx - 5, 5); c.lineTo(cx + 3, 17); c.stroke()
  c.strokeStyle = 'rgba(255,190,240,0.45)'
  c.beginPath(); c.moveTo(cx - 2, 3); c.lineTo(cx + 5.5, 13); c.stroke()
  c.restore()
  seams(c, [[cx, 1, cx, 11], [cx - 7.5, 9, cx, 11], [cx + 7.5, 9, cx, 11], [cx, 11, cx - 5.5, 20], [cx, 11, cx + 5.5, 20]], 'rgba(20,20,30,0.5)', 0.6)
  polyFn(outer)(c); c.strokeStyle = PAL.ink; c.lineWidth = 1.1; c.stroke()
  light(c, cx - 2.5, 6, 2.2, '#ffffff', '#ffffff')
}

export function registerPlayer() {
  defineSprite('player', 46, 50, kestrel(0), true)
  defineSprite('player_bank', 46, 50, kestrel(1), true)
  defineSprite('pod_wasp', 16, 20, podWasp, true)
  defineSprite('pod_viper', 16, 22, podViper, true)
  defineSprite('pod_aegis', 24, 24, podAegis, true)
  defineSprite('pod_spark', 18, 18, podSpark, true)
  defineSprite('pod_lantern', 18, 22, podLantern, true)
  defineSprite('pod_mirror', 18, 22, podMirror, true)
}
