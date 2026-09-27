/** Sprites specific to mission m3: BASTION, the colony-siege crawler, and the Meridian's flight recorder. */
import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, bronzeMetal, choirMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, rivets, stripes, grille, gloss, type Ctx, type PathFn } from './art/kit'

const HAZ = '#f2c230'
const plate = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#4a4f60'], [0.5, '#2c303d'], [1, '#171a23']])

function octagon(cx: number, cy: number, r: number, k = 0.41): PathFn {
  const a = r * k
  return polyFn([[cx - a, cy - r], [cx + a, cy - r], [cx + r, cy - a], [cx + r, cy + a], [cx + a, cy + r], [cx - a, cy + r], [cx - r, cy + a], [cx - r, cy - a]])
}

function tread(c: Ctx, x: number, y: number, w: number, h: number) {
  shape(c, rrFn(x, y, w, h, 6), lin(c, x, 0, x + w, 0, [[0, '#2a2a30'], [0.5, '#4a4a52'], [1, '#1c1c22']]), { lw: 1.4, rim: 0.25, shade: 0 })
  c.save()
  rrFn(x, y, w, h, 6)(c); c.clip()
  c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 1.6
  c.beginPath()
  for (let ty = y + 4; ty < y + h; ty += 6) { c.moveTo(x, ty); c.lineTo(x + w, ty) }
  c.stroke()
  c.strokeStyle = 'rgba(220,235,255,0.22)'; c.lineWidth = 0.8
  c.beginPath()
  for (let ty = y + 5; ty < y + h; ty += 6) { c.moveTo(x + 1, ty); c.lineTo(x + w - 1, ty) }
  c.stroke()
  c.restore()
}

/** Body in a 280×220 box, centre (140,110). Pylon pads at (±118,-64) and (±118,+56); guns at (±62,-40); cannon well at (0,+70). */
function body(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // outrigger arms to the pylon pads
  for (const sx of [-1, 1]) for (const oy of [-64, 56]) {
    c.save()
    c.strokeStyle = PAL.ink; c.lineWidth = 12
    c.beginPath(); c.moveTo(cx + sx * 60, cy + oy * 0.6); c.lineTo(cx + sx * 118, cy + oy); c.stroke()
    c.strokeStyle = PAL.bronzeDark; c.lineWidth = 8; c.stroke()
    c.strokeStyle = PAL.bronze; c.lineWidth = 3; c.stroke()
    c.restore()
    shape(c, octagon(cx + sx * 118, cy + oy, 19), plate(c, w, h), { lw: 1.3, rim: 0.3 })
    stripes(c, octagon(cx + sx * 118, cy + oy, 14), HAZ, PAL.ink, 2.2, 0.8, 0.8)
  }
  // four tread units
  for (const sx of [-1, 1]) {
    tread(c, cx + sx * 84 - 17, 22, 34, 72)
    tread(c, cx + sx * 84 - 17, 126, 34, 72)
  }
  // hull
  const hull = sym(cx, [[0, 14, 1], [52, 16, 1], [76, 34], [80, 90], [80, 150], [72, 186], [44, 206], [0, 210, 1]])
  shape(c, hull, bronzeMetal(c, w, h), { lw: 2, rim: 0.5 })
  const deck = sym(cx, [[0, 26, 1], [44, 28, 1], [64, 44], [68, 94], [66, 150], [58, 178], [34, 194], [0, 196, 1]])
  shape(c, deck, choirMetal(c, w, h), { lw: 1.3, rim: 0.35, shade: 0.4 })
  gloss(c, deck, cx - 40, 60, 70, 0.18)
  // frost caked on the upper-left edges
  c.save(); hull(c); c.clip()
  c.fillStyle = 'rgba(235,245,255,0.35)'
  for (let i = 0; i < 26; i++) { c.beginPath(); c.arc(cx - 78 + (i * 23) % 60, 16 + (i * 37) % 180, 2 + (i % 3), 0, Math.PI * 2); c.fill() }
  c.restore()
  seams(c, [[cx - 66, 94, cx + 66, 94], [cx - 64, 140, cx + 64, 140], [cx - 30, 28, cx - 30, 194], [cx + 30, 28, cx + 30, 194]])
  // gun mounts
  for (const sx of [-1, 1]) {
    shape(c, octagon(cx + sx * 62, cy - 40, 24), plate(c, w, h), { lw: 1.3, rim: 0.3 })
    shape(c, ellipseFn(cx + sx * 62, cy - 40, 18, 18), '#1b1e27', { lw: 1, rim: 0, shade: 0 })
  }
  // keep: stepped central block with singing slits
  shape(c, octagon(cx, cy - 6, 34), bronzeMetal(c, w, h), { lw: 1.5, rim: 0.55 })
  shape(c, octagon(cx, cy - 6, 24), choirMetal(c, w, h), { lw: 1.1, rim: 0.4, shade: 0.35 })
  for (let k = -2; k <= 2; k++) slit(c, cx + k * 7, cy - 18, cx + k * 7, cy + 4, 1.4)
  grille(c, cx - 14, cy + 12, 28, 6, 6, true)
  // exhaust stacks at the stern (top)
  for (const sx of [-1, 1]) {
    shape(c, ellipseFn(cx + sx * 22, 30, 9, 9), rad(c, cx + sx * 22 - 3, 27, 10, [[0, '#6b6f7c'], [1, '#22242c']]), { lw: 1.2, rim: 0.4, shade: 0 })
    shape(c, ellipseFn(cx + sx * 22, 30, 5, 5), '#0d0c10', { lw: 0.8, rim: 0, shade: 0 })
  }
  // cannon well at the bow
  shape(c, rrFn(cx - 26, cy + 46, 52, 50, 8), '#111218', { lw: 1.5, rim: 0.15, shade: 0 })
  stripes(c, rrFn(cx - 32, cy + 96, 64, 6, 2), HAZ, PAL.ink, 2.4, 0.8, 0.9)
  rivets(c, [[cx - 70, 40], [cx + 70, 40], [cx - 74, 170], [cx + 74, 170], [cx - 40, 20], [cx + 40, 20], [cx - 50, 196], [cx + 50, 196]], 1.1)
  slit(c, cx - 76, 100, cx - 76, 140, 1.6)
  slit(c, cx + 76, 100, cx + 76, 140, 1.6)
}

/** Blast doors over the cannon well (drawn as two halves that slide apart). */
function door(c: Ctx, w: number, h: number) {
  shape(c, rrFn(1, 1, w - 2, h - 2, 3), bronzeMetal(c, w, h), { lw: 1.2, rim: 0.45, shade: 0.35 })
  seams(c, [[3, h * 0.33, w - 3, h * 0.33], [3, h * 0.66, w - 3, h * 0.66]], 'rgba(0,0,0,0.45)', 0.9)
  rivets(c, [[5, 5], [w - 5, 5], [5, h - 5], [w - 5, h - 5]], 0.9)
}

/** Main cannon: a long ribbed lance barrel, muzzle DOWN. */
function cannon(c: Ctx, w: number, h: number) {
  const cx = w / 2
  shape(c, rrFn(cx - 16, 2, 32, 30, 6), choirMetal(c, w, h), { lw: 1.4, rim: 0.5 })
  shape(c, rrFn(cx - 8, 26, 16, h - 34, 4), lin(c, cx - 8, 0, cx + 8, 0, [[0, PAL.gunEdge], [0.45, PAL.gun], [1, PAL.gunDark]]), { lw: 1.3, rim: 0.35, shade: 0.2 })
  for (let y = 34; y < h - 16; y += 9) shape(c, rrFn(cx - 10, y, 20, 4, 1.5), bronzeMetal(c, w, h), { lw: 0.9, rim: 0.4, shade: 0 })
  shape(c, rrFn(cx - 12, h - 14, 24, 12, 3), '#1a1a20', { lw: 1.2, rim: 0.3, shade: 0 })
  slit(c, cx - 6, 14, cx + 6, 14, 1.6)
  light(c, cx, h - 6, 8, '#ff9a3d', '#fff4d0')
}

function pylon(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, octagon(cx, cy, 17), plate(c, w, h), { lw: 1.3, rim: 0.3 })
  // four insulator fins
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2
    const x = cx + Math.cos(a) * 11, y = cy + Math.sin(a) * 11
    shape(c, ellipseFn(x, y, 4.5, 4.5), bronzeMetal(c, w, h), { lw: 1, rim: 0.45, shade: 0.3 })
  }
  shape(c, ellipseFn(cx, cy, 9, 9), '#15303a', { lw: 1.1, rim: 0.3, shade: 0 })
  c.save()
  c.fillStyle = rad(c, cx - 2, cy - 2, 9, [[0, '#e9fdff'], [0.4, '#7fe6ff'], [1, '#1b5b6a']])
  c.beginPath(); c.arc(cx, cy, 7, 0, Math.PI * 2); c.fill()
  c.restore()
  slit(c, cx - 14, cy, cx - 9, cy, 1)
  slit(c, cx + 9, cy, cx + 14, cy, 1)
}

function pylonDead(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, octagon(cx, cy, 17), lin(c, 0, 0, w, h, [[0, '#3a3c44'], [1, '#121318']]), { lw: 1.3, rim: 0.15 })
  shape(c, polyFn([[cx - 8, cy - 6], [cx + 2, cy - 9], [cx + 9, cy + 1], [cx + 3, cy + 8], [cx - 7, cy + 6]]), '#0a0a0e', { lw: 1, rim: 0, shade: 0 })
  seams(c, [[cx - 12, cy - 12, cx + 4, cy + 2], [cx + 10, cy - 8, cx - 2, cy + 12]], 'rgba(0,0,0,0.6)', 1)
}

function gunBase(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx, cy, 17, 17), bronzeMetal(c, w, h), { lw: 1.3, rim: 0.5 })
  shape(c, ellipseFn(cx, cy, 11, 11), '#1b1e27', { lw: 1, rim: 0, shade: 0 })
  rivets(c, Array.from({ length: 10 }, (_, i) => [cx + Math.cos(i * 0.628) * 14, cy + Math.sin(i * 0.628) * 14] as [number, number]), 0.7)
}

function gunBarrel(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  // twin heavy mortar tubes, muzzles DOWN
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 5 - 3.5, cy - 2, 7, h / 2 - 2, 2), lin(c, cx - 8, 0, cx + 8, 0, [[0, PAL.gunEdge], [0.45, PAL.gun], [1, PAL.gunDark]]), { lw: 1.1, rim: 0.3, shade: 0.2 })
    shape(c, rrFn(cx + s * 5 - 4.5, h - 7, 9, 5, 1.5), bronzeMetal(c, w, h), { lw: 1, rim: 0.4, shade: 0 })
  }
  const head = sym(cx, [[0, cy - 12], [9, cy - 10], [12, cy - 2], [10, cy + 7], [0, cy + 10, 1]])
  shape(c, head, choirMetal(c, w, h), { lw: 1.2, rim: 0.55 })
  gloss(c, head, cx - 4, cy - 5, 7, 0.3)
  slit(c, cx - 4, cy + 3, cx + 4, cy + 3, 1)
}

/** Collapsed fortress: the keep caved in, treads splayed, fires in the wreck. */
function rubble(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (const sx of [-1, 1]) {
    c.save(); c.translate(cx + sx * 86, 60); c.rotate(sx * 0.25); tread(c, -17, -36, 34, 72); c.restore()
    c.save(); c.translate(cx + sx * 90, 165); c.rotate(-sx * 0.35); tread(c, -17, -36, 34, 72); c.restore()
  }
  const hull = sym(cx, [[0, 30, 1], [40, 22], [70, 50], [76, 110], [64, 170], [30, 196], [0, 188, 1]])
  shape(c, hull, lin(c, 0, 0, w, h, [[0, '#6a5a48'], [0.5, '#3a3129'], [1, '#1a1612']]), { lw: 2, rim: 0.2 })
  c.save(); hull(c); c.clip()
  for (let i = 0; i < 14; i++) {
    const x = cx - 60 + ((i * 47) % 120), y = 40 + ((i * 29) % 140)
    shape(c, polyFn([[x, y], [x + 14, y + 3], [x + 10, y + 14], [x - 2, y + 10]]), i % 2 ? '#2b2e38' : '#4b4034', { lw: 0.9, rim: 0.2, shade: 0 })
  }
  c.restore()
  shape(c, ellipseFn(cx, cy - 4, 30, 24), '#0c0a0c', { lw: 1.2, rim: 0, shade: 0 })
  light(c, cx - 6, cy - 2, 18, '#ff7a1a', '#ffe0a0')
  light(c, cx + 34, cy + 40, 10, '#ff7a1a', '#ffe0a0')
}

/** The Meridian's flight recorder: small, orange, half-buried in frost. */
function blackbox(c: Ctx, w: number, h: number) {
  shape(c, ellipseFn(w / 2, h / 2 + 2, w / 2 - 1, h / 2 - 3), 'rgba(220,235,250,0.6)', { lw: 0, rim: 0, shade: 0 })
  shape(c, rrFn(3, 3, w - 6, h - 7, 2), lin(c, 0, 0, w, h, [[0, '#ffb347'], [0.5, '#e8741a'], [1, '#8a3a0a']]), { lw: 1, rim: 0.5 })
  stripes(c, rrFn(3, h - 9, w - 6, 3, 0.5), '#f2f2f2', PAL.ink, 1, 0.8, 0)
  c.fillStyle = PAL.ink; c.fillRect(w / 2 - 3, 6, 6, 1)
}

export function registerArt_m3() {
  defineSprite('m3_bastion_body', 280, 220, body)
  defineSprite('m3_bastion_door', 26, 50, door)
  defineSprite('m3_bastion_cannon', 44, 100, cannon)
  defineSprite('m3_bastion_pylon', 40, 40, pylon)
  defineSprite('m3_bastion_pylon_dead', 40, 40, pylonDead)
  defineSprite('m3_bastion_gun', 40, 40, gunBase)
  defineSprite('m3_bastion_gun_barrel', 30, 56, gunBarrel)
  defineSprite('m3_bastion_rubble', 280, 220, rubble)
  defineSprite('m3_blackbox', 16, 20, blackbox)
}
