import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, choirMetal, bronzeMetal, ivoryMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, rivets, grille, stripes, gloss, glowLine, lens, plume, type Ctx } from './art/kit'

const dark = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#5a6078'], [0.5, '#2c3040'], [1, '#14161f']])

function hazard(c: Ctx, x: number, y: number, w: number, h: number) {
  stripes(c, rrFn(x, y, w, h, 1.5), '#2a2320', PAL.elite, 3, 0.8, 0.9)
}

// ───────── vault ─────────

function vault(c: Ctx, w: number, h: number, open: boolean) {
  const cx = w / 2, cy = h / 2
  shape(c, polyFn([[8, 14], [14, 8], [w - 14, 8], [w - 8, 14], [w - 8, h - 14], [w - 14, h - 8], [14, h - 8], [8, h - 14]]), choirMetal(c, w, h), { lw: 1.6, rim: 0.5 })
  hazard(c, 12, 11, w - 24, 5)
  hazard(c, 12, h - 16, w - 24, 5)
  rivets(c, [[14, 20], [w - 14, 20], [14, h - 20], [w - 14, h - 20], [cx, 13], [cx, h - 13]], 1)
  if (!open) {
    // round blast door with locking bars
    shape(c, ellipseFn(cx, cy, 22, 22), bronzeMetal(c, w, h), { lw: 1.5, rim: 0.55 })
    for (let i = 0; i < 4; i++) {
      c.save(); c.translate(cx, cy); c.rotate(i * Math.PI / 2 + Math.PI / 4)
      shape(c, rrFn(-3, -26, 6, 14, 1.5), dark(c, w, h), { lw: 1, rim: 0.3 })
      c.restore()
    }
    shape(c, ellipseFn(cx, cy, 9, 9), dark(c, w, h), { lw: 1.2 })
    lens(c, cx, cy, 4, '#76f2ff')
    seams(c, [[cx - 20, cy, cx + 20, cy], [cx, cy - 20, cx, cy + 20]], 'rgba(0,0,0,0.4)', 0.8)
  } else {
    // door slid aside: the violet core cradle is exposed
    shape(c, ellipseFn(cx, cy, 22, 22), '#0d0a14', { lw: 1.5, rim: 0 })
    c.fillStyle = rad(c, cx, cy, 20, [[0, '#ffffff'], [0.25, '#d9c4ff'], [0.6, 'rgba(181,140,255,0.6)'], [1, 'rgba(60,20,120,0)']])
    c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill()
    shape(c, polyFn([[cx, cy - 9], [cx + 6, cy], [cx, cy + 9], [cx - 6, cy]]), lin(c, cx - 6, cy - 9, cx + 6, cy + 9, [[0, '#ffffff'], [0.5, PAL.core], [1, '#4b2a9a']]), { lw: 0.9, rim: 0.5 })
    shape(c, rrFn(w - 20, cy - 20, 12, 40, 3), bronzeMetal(c, w, h), { lw: 1.2, rim: 0.4 })
  }
}

// ───────── burning allied frigate (decor) ─────────

function frigate(c: Ctx, w: number, h: number) {
  const cx = w / 2
  for (const x of [-22, 0, 22]) plume(c, cx + x, h - 18, 30, 12, 'rgba(255,122,26,0.5)', '#ffd27a', 1)
  const hull = sym(cx, [[0, 4], [14, 18, 1], [26, 60], [30, 120, 1], [44, 150, 1], [46, 196, 1], [30, h - 16, 1], [0, h - 10]])
  shape(c, hull, ivoryMetal(c, w, h), { lw: 1.6, rim: 0.6 })
  gloss(c, hull, cx - 12, 60, 50, 0.3)
  seams(c, [[cx - 26, 60, cx + 26, 60], [cx - 30, 120, cx + 30, 120], [cx - 44, 170, cx + 44, 170], [cx, 20, cx, h - 20]])
  // ember accent stripes
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 30, 124], [cx + s * 42, 152], [cx + s * 38, 156], [cx + s * 27, 132]]), PAL.ember, { lw: 0.8, rim: 0.3 })
    grille(c, cx + s * 30 - 5, 178, 10, 14, 4)
  }
  // scorched, torn section
  c.save()
  hull(c); c.clip()
  c.fillStyle = rad(c, cx + 14, 96, 36, [[0, 'rgba(10,6,6,0.95)'], [0.55, 'rgba(40,20,14,0.7)'], [1, 'rgba(40,20,14,0)']])
  c.fillRect(0, 0, w, h)
  c.fillStyle = rad(c, cx - 18, 176, 22, [[0, 'rgba(10,6,6,0.9)'], [1, 'rgba(10,6,6,0)']])
  c.fillRect(0, 0, w, h)
  c.restore()
  glowLine(c, cx + 6, 88, cx + 22, 104, 1.6, PAL.ember, 0.9)
  glowLine(c, cx + 10, 108, cx + 24, 96, 1.2, PAL.emberHot, 0.8)
  // bridge glass
  shape(c, sym(cx, [[0, 30], [7, 36, 1], [7, 50, 1], [0, 54]]), lin(c, cx, 30, cx, 54, [[0, '#b8fff8'], [0.5, PAL.teal], [1, PAL.tealDark]]), { lw: 1, rim: 0.5 })
  rivets(c, [[cx - 20, 70], [cx + 20, 70], [cx - 36, 160], [cx + 36, 160]], 0.9)
}

// ───────── WARDEN ─────────

function wardenCore(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // hub collar (the ring rides on this)
  shape(c, ellipseFn(cx, cy, 52, 52), dark(c, w, h), { lw: 1.8, rim: 0.4 })
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2
    seams(c, [[cx + Math.cos(a) * 40, cy + Math.sin(a) * 40, cx + Math.cos(a) * 51, cy + Math.sin(a) * 51]], 'rgba(0,0,0,0.5)', 1)
  }
  // sphere
  const sph = ellipseFn(cx, cy, 38, 38)
  shape(c, sph, rad(c, cx - 14, cy - 16, 60, [[0, '#a8b0c8'], [0.35, PAL.gun], [0.8, PAL.gunDark], [1, '#0c0d14']]), { lw: 1.8, rim: 0.5 })
  // bronze meridian bands
  c.save(); sph(c); c.clip()
  c.strokeStyle = PAL.bronzeDark; c.lineWidth = 6
  c.beginPath(); c.ellipse(cx, cy, 14, 38, 0, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = PAL.bronzeLight; c.lineWidth = 2
  c.beginPath(); c.ellipse(cx, cy, 14, 38, 0, 0, Math.PI * 2); c.stroke()
  c.restore()
  gloss(c, sph, cx - 14, cy - 16, 22, 0.45)
  // defence eye (cold white-cyan, not a magenta blob)
  lens(c, cx, cy, 11, '#76f2ff')
  for (const s of [-1, 1]) slit(c, cx + s * 26, cy - 14, cx + s * 30, cy + 14, 1.5)
}

function wardenSeg(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // outward edge at the top
  const p = polyFn([[2, 6], [cx, 1], [w - 2, 6], [w - 6, h - 3], [cx, h - 6], [6, h - 3]], true)
  shape(c, p, lin(c, 0, 0, w, h, [[0, '#e4c69a'], [0.45, PAL.bronze], [1, PAL.bronzeDark]]), { lw: 1.4, rim: 0.55 })
  shape(c, polyFn([[8, 9], [cx, 6], [w - 8, 9], [w - 10, h - 8], [cx, h - 10], [10, h - 8]], true), choirMetal(c, w, h), { lw: 0.9, rim: 0.35 })
  glowLine(c, 10, 8, w - 10, 8, 1.2, '#76f2ff', 0.8)
  rivets(c, [[7, 8], [w - 7, 8]], 0.8)
  slit(c, cx - 6, h - 12, cx + 6, h - 12, 1.2)
}

function wardenNode(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, polyFn([[cx, 1], [w - 3, cy - 4], [w - 6, h - 4], [6, h - 4], [3, cy - 4]]), dark(c, w, h), { lw: 1.3, rim: 0.4 })
  shape(c, ellipseFn(cx, cy + 3, 9, 9), bronzeMetal(c, w, h), { lw: 1.1, rim: 0.5 })
  // emitter prism points outward (top)
  shape(c, polyFn([[cx, 2], [cx + 5, 12], [cx - 5, 12]]), lin(c, cx, 2, cx, 12, [[0, '#ffffff'], [1, PAL.choirDeep]]), { lw: 0.9, rim: 0.4 })
  light(c, cx, 8, 6, PAL.choir, '#ffffff')
  lens(c, cx, cy + 3, 4, '#76f2ff')
}

function droneThruster(c: Ctx, w: number, h: number) {
  plume(c, w / 2, 2, h - 4, w - 4, 'rgba(118,242,255,0.55)', '#ffffff', 1)
}

// ───────── interior dressing ─────────

function wallRib(c: Ctx, w: number, h: number, flip: boolean) {
  // a vertical dock wall section hugging the screen edge
  c.save()
  if (flip) { c.translate(w, 0); c.scale(-1, 1) }
  shape(c, polyFn([[0, 0], [w - 18, 0], [w - 4, 18], [w - 4, h - 18], [w - 18, h], [0, h]]), dark(c, w, h), { lw: 1.6, rim: 0.35 })
  for (let y = 24; y < h - 10; y += 36) {
    shape(c, rrFn(6, y, w - 20, 20, 3), choirMetal(c, w, h), { lw: 1, rim: 0.4 })
    grille(c, 10, y + 5, w - 30, 10, 5, true)
  }
  hazard(c, w - 12, 20, 6, h - 40)
  rivets(c, [[8, 8], [w - 22, 8], [8, h - 8], [w - 22, h - 8]], 1)
  c.restore()
}

export function registerArt_m5() {
  defineSprite('m5_vault', 64, 64, (c, w, h) => vault(c, w, h, false))
  defineSprite('m5_vault_open', 64, 64, (c, w, h) => vault(c, w, h, true))
  defineSprite('m5_frigate', 110, 240, frigate)
  defineSprite('m5_warden_core', 110, 110, wardenCore)
  defineSprite('m5_warden_seg', 40, 26, wardenSeg)
  defineSprite('m5_warden_node', 30, 30, wardenNode)
  defineSprite('m5_drone_thrust', 14, 26, droneThruster)
  defineSprite('m5_wall_l', 56, 220, (c, w, h) => wallRib(c, w, h, false))
  defineSprite('m5_wall_r', 56, 220, (c, w, h) => wallRib(c, w, h, true))
}
