/**
 * Mission 06 — Graveyard. The old Verge fleet: weathered ivory ceramic hulls,
 * scorched and cracked, now threaded with Choir graphite frames, bronze
 * staples and magenta singing slits. The REVENANT is several of those wrecks
 * stitched into one dreadnought. Everything faces DOWN (bow toward +y).
 */
import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, choirMetal, bronzeMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, rivets, grille, gloss, glowLine, blobFn, rng, stripes, type Ctx, type PathFn, type Pt } from './art/kit'

/** Weathered Verge ceramic: ivory gone grey-brown, lit from the upper-left. */
const oldIvory = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#d8cfbd'], [0.35, '#a99e89'], [0.75, '#6d6456'], [1, '#403a33']])
const oldIvoryDim = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#8f8676'], [0.5, '#5f584d'], [1, '#2f2b27']])
const metal = (c: Ctx, w: number, h: number) => choirMetal(c, w, h)
const bronze = (c: Ctx, w: number, h: number) => bronzeMetal(c, w, h)
const darkMetal = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, PAL.gun], [0.5, PAL.gunDark], [1, '#101219']])

/** Soot and burn marks clipped to a shape. */
function scorch(c: Ctx, path: PathFn, seed: number, n: number, w: number, h: number, x0 = 0, y0 = 0) {
  const r = rng(seed)
  c.save()
  path(c); c.clip()
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * w, y = y0 + r() * h, s = 6 + r() * 22
    c.fillStyle = rad(c, x, y, s, [[0, 'rgba(18,12,10,0.75)'], [0.5, 'rgba(30,20,16,0.35)'], [1, 'rgba(0,0,0,0)']])
    c.fillRect(x - s, y - s, s * 2, s * 2)
  }
  c.restore()
}

/** Jagged crack lines. */
function cracks(c: Ctx, seed: number, pts: [number, number][], len = 14) {
  const r = rng(seed)
  c.save()
  c.lineCap = 'round'
  for (const [x, y] of pts) {
    let px = x, py = y
    c.beginPath(); c.moveTo(px, py)
    const a0 = r() * Math.PI * 2
    for (let k = 0; k < 4; k++) {
      const a = a0 + (r() - 0.5) * 1.4
      px += Math.cos(a) * len * (0.4 + r() * 0.5); py += Math.sin(a) * len * (0.4 + r() * 0.5)
      c.lineTo(px, py)
    }
    c.strokeStyle = 'rgba(12,8,10,0.8)'; c.lineWidth = 1.2; c.stroke()
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.5
    c.translate(0.6, 0.6); c.stroke(); c.translate(-0.6, -0.6)
  }
  c.restore()
}

/** Bronze staples stitching two plates together along a line. */
function stitches(c: Ctx, x0: number, y0: number, x1: number, y1: number, n: number) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy)
  const nx = -dy / L, ny = dx / L
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x0 + dx * t, y = y0 + dy * t
    c.save()
    c.lineCap = 'round'
    c.strokeStyle = PAL.ink; c.lineWidth = 3
    c.beginPath(); c.moveTo(x - nx * 4, y - ny * 4); c.lineTo(x + nx * 4, y + ny * 4); c.stroke()
    c.strokeStyle = PAL.bronzeLight; c.lineWidth = 1.4; c.stroke()
    c.restore()
  }
}

/** Old Verge hull registry stripes (teal/ivory), faded. */
function fadedBand(c: Ctx, path: PathFn, x: number, y: number, w: number, h: number) {
  c.save()
  path(c); c.clip()
  c.globalAlpha = 0.35
  c.fillStyle = PAL.tealDark
  c.fillRect(x, y, w, h)
  c.globalAlpha = 0.22
  c.fillStyle = '#e8e0cf'
  c.fillRect(x, y + h * 0.35, w, h * 0.3)
  c.restore()
}

// ─────────────── Mid-boss: the Waking Hulk ───────────────

/** An old Verge frigate. Lights are drawn at runtime (they come on when it wakes). */
function hulk(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // dead engine bells at the stern (top)
  for (const x of [-34, 0, 34]) {
    shape(c, ellipseFn(cx + x, 16, 13, 10), darkMetal(c, w, h), { lw: 1.2, rim: 0.3 })
    shape(c, ellipseFn(cx + x, 15, 8, 6), '#0c0b10', { lw: 0.8, rim: 0, shade: 0 })
  }
  // outer broadside sponsons
  const spon = polyFn([[cx + 40, 70], [cx + 78, 88], [cx + 84, 150], [cx + 76, 196], [cx + 44, 210]], true)
  for (const s of [-1, 1]) {
    const p: PathFn = s < 0 ? (cc) => { cc.save(); cc.translate(cx * 2, 0); cc.scale(-1, 1); spon(cc); cc.restore() } : spon
    shape(c, p, oldIvoryDim(c, w, h), { lw: 1.3, rim: 0.25 })
    scorch(c, p, 11 + s, 4, w, h)
    grille(c, cx + s * 66 - 5, 112, 10, 44, 7)
  }
  // main hull
  const hull = sym(cx, [[0, 18, 1], [30, 22], [48, 44], [56, 90], [58, 170], [52, 236], [40, 280], [20, 308], [0, 318, 1]])
  shape(c, hull, oldIvory(c, w, h), { lw: 1.7, rim: 0.45 })
  gloss(c, hull, cx - 22, 60, 50, 0.18)
  fadedBand(c, hull, 0, 234, w, 14)
  // deck plating
  seams(c, [[cx - 54, 100, cx + 54, 100], [cx - 57, 150, cx + 57, 150], [cx - 55, 200, cx + 55, 200], [cx - 42, 262, cx + 42, 262], [cx, 30, cx, 300]], 'rgba(0,0,0,0.35)', 0.8)
  // central spine + bridge
  const spine = sym(cx, [[0, 30], [14, 36], [18, 80], [16, 250], [8, 290], [0, 298]])
  shape(c, spine, oldIvoryDim(c, w, h), { lw: 1.1, rim: 0.3 })
  shape(c, rrFn(cx - 16, 132, 32, 40, 6), lin(c, 0, 132, 0, 172, [[0, '#2b3b40'], [1, '#0d1417']]), { lw: 1.1, rim: 0.2 })
  for (let i = 0; i < 4; i++) shape(c, rrFn(cx - 12 + i * 6.5, 140, 4, 8, 1), '#081012', { lw: 0.5, rim: 0, shade: 0 })
  // Choir infestation: graphite ribs clamped over the hull, bronze staples, slits
  for (const y of [58, 118, 186, 244]) {
    const rib = sym(cx, [[0, y - 5], [44, y - 3], [54, y + 2, 1], [50, y + 8, 1], [0, y + 6]])
    shape(c, rib, metal(c, w, h), { lw: 1, rim: 0.4 })
  }
  stitches(c, cx - 40, 84, cx - 44, 108, 3)
  stitches(c, cx + 38, 206, cx + 34, 232, 3)
  scorch(c, hull, 7, 9, w, h)
  cracks(c, 3, [[cx - 30, 92], [cx + 34, 170], [cx - 22, 226], [cx + 10, 280]])
  // hull breach showing the dark interior
  const breach = blobFn(cx + 30, 116, 12, 9, 21, 9, 0.3)
  shape(c, breach, '#0b0a0e', { lw: 1.2, rim: 0, shade: 0 })
  stitches(c, cx + 18, 116, cx + 42, 116, 3)
  for (const s of [-1, 1]) slit(c, cx + s * 50, 60, cx + s * 52, 90, 1.3)
  slit(c, cx - 8, 300, cx + 8, 300, 1.4)
  rivets(c, [[cx - 44, 52], [cx + 44, 52], [cx - 52, 180], [cx + 52, 180], [cx - 30, 274], [cx + 30, 274]], 0.9)
}

function turretBase(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  const oct = polyFn(Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    return [cx + Math.cos(a) * 15.5, cy + Math.sin(a) * 15.5] as Pt
  }).map((p) => [p[0], p[1], 1] as Pt))
  shape(c, oct, oldIvoryDim(c, w, h), { lw: 1.3, rim: 0.35 })
  shape(c, ellipseFn(cx, cy, 11, 11), bronze(c, w, h), { lw: 1.1, rim: 0.5 })
  shape(c, ellipseFn(cx, cy, 6.5, 6.5), metal(c, w, h), { lw: 0.9, rim: 0.4 })
  rivets(c, Array.from({ length: 8 }, (_, i) => [cx + Math.cos(i * 0.785) * 13.5, cy + Math.sin(i * 0.785) * 13.5] as [number, number]), 0.6)
  slit(c, cx - 4, cy - 8.6, cx + 4, cy - 8.6, 1)
}

/** Twin barrels extending DOWN from the pivot (canvas centre). */
function turretBarrel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 3.2 - 2, cy + 2, 4, 17, 1.2), lin(c, cx - 4, 0, cx + 4, 0, [[0, PAL.gunLight], [0.5, PAL.gun], [1, PAL.gunDark]]), { lw: 0.9, rim: 0.4 })
    shape(c, rrFn(cx + s * 3.2 - 2.6, cy + 17, 5.2, 3, 0.8), bronze(c, w, h), { lw: 0.8, rim: 0.4, shade: 0 })
  }
  shape(c, ellipseFn(cx, cy, 6, 6), metal(c, w, h), { lw: 1, rim: 0.5 })
  light(c, cx, cy, 3, PAL.choir, '#ffffff')
}

/** Broadside launcher: a block of eight tubes facing outward/down. */
function broadside(c: Ctx, w: number, h: number) {
  const cx = w / 2
  shape(c, rrFn(3, 3, w - 6, h - 6, 5), darkMetal(c, w, h), { lw: 1.3, rim: 0.35 })
  shape(c, rrFn(7, 7, w - 14, 10, 3), bronze(c, w, h), { lw: 0.9, rim: 0.5, shade: 0.2 })
  for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
    const x = cx + (k ? 7 : -7), y = 24 + r * 9
    shape(c, ellipseFn(x, y, 4.4, 3.6), '#0c0b10', { lw: 0.9, rim: 0.25, shade: 0 })
    c.save(); c.fillStyle = PAL.choirDeep; c.globalAlpha = 0.7; c.beginPath(); c.arc(x, y + 0.5, 1.6, 0, Math.PI * 2); c.fill(); c.restore()
  }
  slit(c, 6, h - 8, w - 6, h - 8, 1.2)
}

// ─────────────── Debris ───────────────

function debris(seed: number, rx: number, ry: number) {
  return (c: Ctx, w: number, h: number) => {
    const cx = w / 2, cy = h / 2
    const body = blobFn(cx, cy, rx, ry, seed, 8, 0.35)
    shape(c, body, oldIvory(c, w, h), { lw: 1.3, rim: 0.45 })
    scorch(c, body, seed + 1, 3, w, h)
    // exposed frame girders
    c.save(); body(c); c.clip()
    const r = rng(seed + 5)
    for (let i = 0; i < 3; i++) {
      const y = cy - ry + (i + 0.5) * (ry * 2 / 3) + (r() - 0.5) * 4
      c.strokeStyle = PAL.ink; c.lineWidth = 3.4
      c.beginPath(); c.moveTo(cx - rx, y); c.lineTo(cx + rx, y + (r() - 0.5) * 8); c.stroke()
      c.strokeStyle = PAL.gun; c.lineWidth = 1.8; c.stroke()
    }
    c.restore()
    cracks(c, seed + 2, [[cx - rx * 0.3, cy], [cx + rx * 0.3, cy - ry * 0.2]], rx * 0.35)
    fadedBand(c, body, 0, cy + ry * 0.3, w, 5)
    // glowing torn edge
    glowLine(c, cx + rx * 0.55, cy - ry * 0.55, cx + rx * 0.85, cy - ry * 0.05, 1.1, '#ff9a3d', 0.8)
  }
}

// ─────────────── REVENANT ───────────────

/** Broken cruiser halves chained to the dreadnought's flanks — read as sheer bulk. */
function revSpars(c: Ctx, w: number, h: number) {
  const cx = w / 2
  for (const s of [-1, 1]) {
    // hanging wreck halves
    const x0 = cx + s * 150, x1 = cx + s * (w / 2 - 6)
    const p = polyFn([[x0, 60], [x0 + s * 90, 30], [x1, 70, 0], [x1 - s * 10, 170], [x0 + s * 120, 230], [x0 + s * 30, 200]], true)
    shape(c, p, oldIvoryDim(c, w, h), { lw: 1.5, rim: 0.2, shade: 0.5 })
    scorch(c, p, 40 + s, 9, w, h)
    c.save(); p(c); c.clip()
    for (let i = 0; i < 6; i++) seams(c, [[x0 + s * (20 + i * 40), 30, x0 + s * (10 + i * 42), 240]], 'rgba(0,0,0,0.4)', 1)
    c.restore()
    cracks(c, 50 + s, [[x0 + s * 90, 120], [x0 + s * 170, 90], [x0 + s * 220, 160]], 18)
    // chains / cables back to the hull
    for (const y of [80, 150, 210]) {
      c.save()
      c.strokeStyle = PAL.ink; c.lineWidth = 5
      c.beginPath(); c.moveTo(cx + s * 120, y); c.quadraticCurveTo(cx + s * 150, y + 16, cx + s * 185, y + 4); c.stroke()
      c.strokeStyle = PAL.bronzeDark; c.lineWidth = 2.6; c.stroke()
      c.strokeStyle = 'rgba(255,220,170,0.35)'; c.lineWidth = 0.8; c.stroke()
      c.restore()
    }
    slit(c, x0 + s * 120, 70, x0 + s * 200, 90, 1.6)
    // broken-off girder stubs
    for (let i = 0; i < 4; i++) {
      const gx = x0 + s * (60 + i * 45)
      c.save(); c.strokeStyle = PAL.ink; c.lineWidth = 4
      c.beginPath(); c.moveTo(gx, 225 - i * 6); c.lineTo(gx + s * 8, 250 - i * 3); c.stroke()
      c.strokeStyle = PAL.gun; c.lineWidth = 2; c.stroke(); c.restore()
    }
  }
}

/** The dreadnought body. Root (bridge) sits at (w/2, 250). */
function revHull(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // stern engine block (top)
  const stern = sym(cx, [[0, 6, 1], [60, 10], [104, 30], [112, 96], [96, 120], [0, 124, 1]])
  shape(c, stern, darkMetal(c, w, h), { lw: 1.6, rim: 0.3 })
  grille(c, cx - 26, 22, 52, 22, 6, true)
  // side sponsons (turret decks)
  for (const s of [-1, 1]) {
    const sp = polyFn([[cx + s * 90, 170], [cx + s * 146, 196], [cx + s * 150, 250], [cx + s * 144, 318], [cx + s * 96, 350]].map((p) => [p[0], p[1], 1] as Pt))
    shape(c, sp, oldIvoryDim(c, w, h), { lw: 1.5, rim: 0.3 })
    scorch(c, sp, 60 + s, 5, w, h)
    stripes(c, polyFn([[cx + s * 144, 300], [cx + s * 146, 318], [cx + s * 110, 340], [cx + s * 104, 330]]), '#2a2328', '#c9a13a', 3, 0.8, 0.8)
  }
  // main hull — a cruiser fore-section welded to a Choir keel
  const hull = sym(cx, [[0, 90, 1], [70, 96], [100, 140], [110, 220], [104, 330], [88, 420], [62, 480], [30, 512], [0, 520, 1]])
  shape(c, hull, oldIvory(c, w, h), { lw: 2, rim: 0.4 })
  gloss(c, hull, cx - 40, 170, 90, 0.14)
  fadedBand(c, hull, 0, 400, w, 16)
  // Choir keel plates down the middle
  const keel = sym(cx, [[0, 100], [36, 106], [44, 170], [40, 400], [22, 470], [0, 488]])
  shape(c, keel, metal(c, w, h), { lw: 1.3, rim: 0.35 })
  // welded seams where the wrecks were stitched together
  stitches(c, cx - 96, 214, cx - 44, 204, 6)
  stitches(c, cx + 44, 290, cx + 100, 300, 6)
  stitches(c, cx - 86, 380, cx - 40, 372, 5)
  stitches(c, cx + 40, 150, cx + 90, 138, 5)
  seams(c, [[cx - 100, 160, cx + 100, 160], [cx - 108, 250, cx + 108, 250], [cx - 100, 350, cx + 100, 350], [cx - 70, 450, cx + 70, 450]], 'rgba(0,0,0,0.35)', 0.9)
  scorch(c, hull, 9, 16, w, h)
  cracks(c, 4, [[cx - 70, 190], [cx + 76, 230], [cx - 60, 330], [cx + 56, 410], [cx - 30, 470]], 16)
  // hull breaches
  for (const [x, y, s] of [[cx + 72, 190, 1], [cx - 64, 420, 2], [cx + 50, 370, 3]] as const) {
    shape(c, blobFn(x, y, 11, 8, 30 + s, 9, 0.3), '#0a090d', { lw: 1.1, rim: 0, shade: 0 })
  }
  // bridge housing (root)
  shape(c, ellipseFn(cx, 250, 38, 42), darkMetal(c, w, h), { lw: 1.5, rim: 0.4 })
  shape(c, ellipseFn(cx, 250, 28, 32), bronze(c, w, h), { lw: 1.2, rim: 0.5 })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    seams(c, [[cx + Math.cos(a) * 12, 250 + Math.sin(a) * 14, cx + Math.cos(a) * 27, 250 + Math.sin(a) * 31]], 'rgba(0,0,0,0.5)', 1)
  }
  // bow cradle
  const bow = sym(cx, [[0, 470], [34, 474], [40, 500], [24, 530], [0, 536]])
  shape(c, bow, darkMetal(c, w, h), { lw: 1.3, rim: 0.3 })
  // running slits
  for (const s of [-1, 1]) {
    slit(c, cx + s * 104, 200, cx + s * 100, 300, 1.6)
    slit(c, cx + s * 70, 440, cx + s * 50, 480, 1.3)
    slit(c, cx + s * 50, 112, cx + s * 90, 124, 1.2)
  }
  rivets(c, [[cx - 96, 150], [cx + 96, 150], [cx - 104, 330], [cx + 104, 330], [cx - 60, 470], [cx + 60, 470]], 1)
}

function revEngine(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // exhaust plume housing points UP (stern)
  shape(c, rrFn(cx - 24, 6, 48, h - 12, 12), darkMetal(c, w, h), { lw: 1.4, rim: 0.35 })
  shape(c, ellipseFn(cx, 18, 18, 11), '#0c0b10', { lw: 1.2, rim: 0.2, shade: 0 })
  for (let r = 15; r > 5; r -= 3.3) { c.save(); c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(cx, 18, r, r * 0.6, 0, 0, Math.PI * 2); c.stroke(); c.restore() }
  shape(c, rrFn(cx - 20, 34, 40, 28, 6), bronze(c, w, h), { lw: 1.1, rim: 0.5 })
  grille(c, cx - 14, 40, 28, 16, 5, true)
  for (const s of [-1, 1]) slit(c, cx + s * 22, 30, cx + s * 22, 62, 1.3)
  rivets(c, [[cx - 18, 66], [cx + 18, 66], [cx - 18, 30], [cx + 18, 30]], 0.8)
}

function revMissile(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const body = polyFn([[4, 8, 1], [w - 4, 8, 1], [w - 8, h - 4, 1], [8, h - 4, 1]])
  shape(c, body, oldIvoryDim(c, w, h), { lw: 1.3, rim: 0.3 })
  shape(c, rrFn(8, 12, w - 16, h - 20, 4), darkMetal(c, w, h), { lw: 1, rim: 0.3 })
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) {
    const x = cx + (k - 1) * 11, y = 20 + r * 12
    shape(c, ellipseFn(x, y, 4.2, 4.2), '#0c0b10', { lw: 0.9, rim: 0.3, shade: 0 })
    c.save(); c.fillStyle = lin(c, x, y - 3, x, y + 3, [[0, '#f0e2c8'], [1, '#8a7a60']]); c.beginPath(); c.arc(x, y, 2.4, 0, Math.PI * 2); c.fill(); c.restore()
  }
  slit(c, 10, h - 8, w - 10, h - 8, 1.2)
}

function revPlate(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const p = polyFn([[6, 4, 1], [w - 10, 8, 1], [w - 4, h * 0.5], [w - 12, h - 6, 1], [10, h - 4, 1], [3, h * 0.45]], true)
  shape(c, p, oldIvory(c, w, h), { lw: 1.5, rim: 0.5 })
  fadedBand(c, p, 0, h * 0.2, w, 7)
  scorch(c, p, 70, 4, w, h)
  cracks(c, 71, [[cx - 8, h * 0.6], [cx + 10, h * 0.35]], 10)
  stitches(c, 8, h * 0.3, 8, h * 0.8, 3)
  stitches(c, w - 8, h * 0.3, w - 8, h * 0.8, 3)
  rivets(c, [[14, 12], [w - 16, 14], [16, h - 12], [w - 18, h - 12]], 0.9)
}

/** Bow cannon: a spinal gun in an armoured clamshell. Opened state drawn at runtime. */
function revBow(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const shell = sym(cx, [[0, 4, 1], [30, 8], [44, 36], [42, 80], [26, 108], [0, 116, 1]])
  shape(c, shell, darkMetal(c, w, h), { lw: 1.6, rim: 0.35 })
  shape(c, sym(cx, [[0, 14], [20, 18], [28, 44], [24, 86], [0, 102]]), bronze(c, w, h), { lw: 1.1, rim: 0.5 })
  // muzzle
  shape(c, ellipseFn(cx, 100, 12, 8), '#0b0a0e', { lw: 1.2, rim: 0.2, shade: 0 })
  seams(c, [[cx, 16, cx, 92]], 'rgba(0,0,0,0.6)', 1.6)
  for (const y of [34, 52, 70]) seams(c, [[cx - 24, y, cx + 24, y]], 'rgba(0,0,0,0.4)', 0.8)
  for (const s of [-1, 1]) slit(c, cx + s * 34, 40, cx + s * 30, 80, 1.4)
  rivets(c, [[cx - 30, 20], [cx + 30, 20], [cx - 34, 90], [cx + 34, 90]], 0.9)
}

export function registerArt_m6() {
  defineSprite('m6_hulk', 170, 320, hulk)
  defineSprite('m6_turret', 36, 36, turretBase)
  defineSprite('m6_barrel', 22, 44, turretBarrel)
  defineSprite('m6_broadside', 38, 64, broadside)
  defineSprite('m6_debris_s', 38, 32, debris(81, 16, 12), true)
  defineSprite('m6_debris_m', 50, 44, debris(83, 22, 18), true)
  defineSprite('m6_debris_l', 70, 58, debris(87, 31, 24), true)
  defineSprite('m6_rev_spars', 780, 260, revSpars)
  defineSprite('m6_rev_hull', 300, 540, revHull)
  defineSprite('m6_rev_engine', 60, 76, revEngine)
  defineSprite('m6_rev_missile', 52, 60, revMissile)
  defineSprite('m6_rev_plate', 58, 96, revPlate)
  defineSprite('m6_rev_bow', 96, 120, revBow)
}
