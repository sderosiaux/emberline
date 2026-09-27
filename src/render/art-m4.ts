import { defineSprite } from './sprites'
import { PAL, lin, rad, light, slit, seams, choirMetal, bronzeMetal } from './paint'
import { shape, sym, polyFn, ellipseFn, rrFn, blobFn, rivets, grille, stripes, gloss, lens, rng, type Ctx } from './art/kit'

const dark = (c: Ctx, w: number, h: number) => lin(c, 0, 0, w, h, [[0, '#5a6078'], [0.5, '#2c3040'], [1, '#14161f']])

/** Diagonal hazard band clipped to a rect. */
function hazard(c: Ctx, x: number, y: number, w: number, h: number) {
  stripes(c, rrFn(x, y, w, h, 1.5), '#2a2320', PAL.ember, 3, 0.8, 0.9)
}

/** Seeded cracked rock body (used by the rift rock). */
function rockBody(c: Ctx, w: number, h: number, seed: number) {
  const cx = w / 2, cy = h / 2
  const body = blobFn(cx, cy, w / 2 - 2, h / 2 - 2, seed, 12, 0.16)
  shape(c, body, rad(c, cx - w * 0.2, cy - h * 0.22, w * 0.9, [[0, '#8a7f96'], [0.4, '#574d66'], [0.8, '#30283c'], [1, '#1b1524']]), { lw: 1.2, rim: 0.35, shade: 0.5 })
  return body
}

function riftRock(c: Ctx, w: number, h: number) {
  const body = rockBody(c, w, h, 77)
  const cx = w / 2, cy = h / 2
  c.save()
  body(c); c.clip()
  const r = rng(19)
  // violet fracture lines radiating from a bright seam
  c.globalCompositeOperation = 'lighter'
  for (const [lw, col] of [[4, 'rgba(170,110,255,0.3)'], [1.4, 'rgba(235,215,255,0.95)']] as [number, string][]) {
    c.strokeStyle = col; c.lineWidth = lw
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r() * 0.6
      c.beginPath(); c.moveTo(cx + (r() - 0.5) * 4, cy + (r() - 0.5) * 4)
      let x = cx, y = cy
      for (let k = 0; k < 3; k++) { x += Math.cos(a + (r() - 0.5) * 0.9) * w * 0.14; y += Math.sin(a + (r() - 0.5) * 0.9) * h * 0.14; c.lineTo(x, y) }
      c.stroke()
    }
  }
  c.restore()
  light(c, cx, cy, w * 0.32, '#b58cff', '#ffffff')
}

function riftPortal(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2, R = w / 2 - 2
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.fillStyle = rad(c, cx, cy, R, [[0, 'rgba(255,255,255,0.95)'], [0.18, 'rgba(210,170,255,0.9)'], [0.45, 'rgba(120,60,220,0.55)'], [0.8, 'rgba(60,20,140,0.25)'], [1, 'rgba(0,0,0,0)']])
  c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.fill()
  // spiral arms
  for (let arm = 0; arm < 3; arm++) {
    c.strokeStyle = arm === 0 ? 'rgba(255,240,255,0.8)' : 'rgba(196,155,255,0.6)'
    c.lineWidth = 2.2 - arm * 0.4
    c.beginPath()
    for (let t = 0; t <= 1; t += 0.02) {
      const a = arm * (Math.PI * 2 / 3) + t * 5.2
      const rr = 6 + t * R * 0.85
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr
      if (t === 0) c.moveTo(x, y); else c.lineTo(x, y)
    }
    c.stroke()
  }
  c.restore()
  // dark eye
  c.fillStyle = rad(c, cx, cy, 10, [[0, '#07030f'], [0.7, '#1a0a33'], [1, 'rgba(26,10,51,0)']])
  c.beginPath(); c.arc(cx, cy, 10, 0, Math.PI * 2); c.fill()
}

function drillRig(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // outrigger struts
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 10, 16], [cx + s * 30, 6], [cx + s * 34, 12], [cx + s * 16, 26]]), dark(c, w, h), { lw: 1, rim: 0.3 })
    shape(c, ellipseFn(cx + s * 31, 9, 4.5, 4.5), bronzeMetal(c, w, h), { lw: 0.9 })
  }
  // platform
  const plat = sym(cx, [[0, 8], [18, 10, 1], [24, 22, 1], [24, 40, 1], [16, 48, 1], [0, 50]])
  shape(c, plat, choirMetal(c, w, h), { lw: 1.4, rim: 0.5 })
  hazard(c, cx - 20, 11, 40, 5)
  seams(c, [[cx - 22, 30, cx + 22, 30], [cx - 10, 16, cx - 10, 46], [cx + 10, 16, cx + 10, 46]])
  grille(c, cx - 18, 33, 8, 10, 4)
  grille(c, cx + 10, 33, 8, 10, 4)
  // emitter head pointing down
  shape(c, sym(cx, [[0, 34], [9, 36, 1], [8, 52, 1], [4, 62, 1], [0, 64]]), bronzeMetal(c, w, h), { lw: 1.2, rim: 0.55 })
  for (let y = 40; y < 58; y += 5) seams(c, [[cx - 7, y, cx + 7, y + 2]], 'rgba(0,0,0,0.5)', 0.8)
  lens(c, cx, 24, 6, PAL.choir)
  slit(c, cx - 20, 44, cx - 12, 44, 1.2)
  slit(c, cx + 12, 44, cx + 20, 44, 1.2)
  rivets(c, [[cx - 20, 20], [cx + 20, 20], [cx - 20, 40], [cx + 20, 40]])
}

// ───────── EXCAVATOR ─────────

function excBody(c: Ctx, w: number, h: number) {
  const cx = w / 2
  // rear thruster block + exhausts
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 70 - 22, 4, 44, 30, 6), dark(c, w, h), { lw: 1.2, rim: 0.3 })
    grille(c, cx + s * 70 - 16, 10, 32, 16, 6, true)
  }
  // shoulder pylons (arms mount here, drawn by the arm parts)
  for (const s of [-1, 1]) {
    shape(c, polyFn([[cx + s * 64, 50], [cx + s * 132, 58], [cx + s * 138, 92], [cx + s * 118, 118], [cx + s * 70, 116]]), bronzeMetal(c, w, h), { lw: 1.4, rim: 0.45 })
    seams(c, [[cx + s * 80, 60, cx + s * 84, 114], [cx + s * 100, 62, cx + s * 104, 116]], 'rgba(0,0,0,0.45)', 0.8)
    hazard(c, cx + (s < 0 ? -134 : 110), 62, 24, 6)
  }
  // main hull
  const hull = sym(cx, [[0, 18], [48, 22, 1], [78, 40, 1], [84, 110], [72, 150, 1], [40, 172, 1], [0, 178]])
  shape(c, hull, choirMetal(c, w, h), { lw: 1.8, rim: 0.55 })
  gloss(c, hull, cx - 40, 40, 60, 0.18)
  seams(c, [[cx - 80, 70, cx + 80, 70], [cx - 78, 130, cx + 78, 130], [cx - 36, 22, cx - 44, 170], [cx + 36, 22, cx + 44, 170]])
  // core socket (the core glow is drawn at runtime)
  shape(c, ellipseFn(cx, 96, 34, 30), lin(c, cx - 34, 66, cx + 34, 126, [[0, '#8d8f9c'], [0.5, '#3b3e4c'], [1, '#17181f']]), { lw: 2 })
  c.fillStyle = '#120d16'
  c.beginPath(); c.ellipse(cx, 96, 26, 23, 0, 0, Math.PI * 2); c.fill()
  // ore hoppers
  for (const s of [-1, 1]) {
    shape(c, rrFn(cx + s * 56 - 12, 132, 24, 22, 4), bronzeMetal(c, w, h), { lw: 1.1 })
    c.fillStyle = '#1a1510'; c.fillRect(cx + s * 56 - 8, 136, 16, 12)
    for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#c6ff3d' : '#8fbf2a'; c.globalAlpha = 0.8; c.fillRect(cx + s * 56 - 6 + i * 3, 139 + (i % 2) * 3, 2.4, 2.4) }
    c.globalAlpha = 1
  }
  for (const s of [-1, 1]) slit(c, cx + s * 70, 76, cx + s * 70, 120, 1.8)
  slit(c, cx - 24, 30, cx + 24, 30, 1.6)
  rivets(c, [[cx - 70, 44], [cx + 70, 44], [cx - 60, 160], [cx + 60, 160], [cx - 20, 24], [cx + 20, 24]], 1)
}

function excShutter(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1
    shape(c, polyFn([[cx, cy - 28], [cx + s * 34, cy - 18], [cx + s * 36, cy + 16], [cx, cy + 28]]), bronzeMetal(c, w, h), { lw: 1.3, rim: 0.5 })
    seams(c, [[cx + s * 10, cy - 24, cx + s * 12, cy + 24], [cx + s * 22, cy - 20, cx + s * 24, cy + 20]], 'rgba(0,0,0,0.45)', 0.8)
  }
  rivets(c, [[cx - 28, cy - 12], [cx + 28, cy - 12], [cx - 28, cy + 12], [cx + 28, cy + 12]], 1)
  slit(c, cx, cy - 24, cx, cy + 24, 1.4)
}

function excShoulder(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  shape(c, ellipseFn(cx, cy, 24, 24), bronzeMetal(c, w, h), { lw: 1.5, rim: 0.55 })
  shape(c, ellipseFn(cx, cy, 14, 14), dark(c, w, h), { lw: 1.1 })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    c.fillStyle = PAL.ink
    c.beginPath(); c.arc(cx + Math.cos(a) * 19, cy + Math.sin(a) * 19, 1.6, 0, Math.PI * 2); c.fill()
  }
  light(c, cx, cy, 6, PAL.ember, '#fff4c0')
}

/** Drill arm, pointing down; frame alternates the thread phase for a spinning look. */
function excDrill(c: Ctx, w: number, h: number, frame: number) {
  const cx = w / 2
  // boom
  shape(c, sym(cx, [[0, 0], [14, 2, 1], [16, h * 0.42, 1], [12, h * 0.46, 1], [0, h * 0.47]]), dark(c, w, h), { lw: 1.4, rim: 0.35 })
  seams(c, [[cx - 12, 30, cx + 12, 30], [cx - 12, h * 0.2, cx + 12, h * 0.2], [cx - 12, h * 0.32, cx + 12, h * 0.32]], 'rgba(0,0,0,0.5)', 0.8)
  hazard(c, cx - 10, h * 0.36, 20, 6)
  slit(c, cx, 40, cx, h * 0.3, 1.4)
  // motor collar
  shape(c, rrFn(cx - 20, h * 0.44, 40, 20, 5), bronzeMetal(c, w, h), { lw: 1.3, rim: 0.5 })
  grille(c, cx - 14, h * 0.44 + 5, 28, 9, 6, true)
  // conical bit
  const top = h * 0.44 + 20, bot = h - 2
  const bit = polyFn([[cx - 17, top], [cx + 17, top], [cx + 2.5, bot - 4], [cx, bot], [cx - 2.5, bot - 4]], true)
  shape(c, bit, lin(c, cx - 17, top, cx + 17, top, [[0, '#c6c9d4'], [0.45, '#6d7285'], [1, '#262a36']]), { lw: 1.3, rim: 0.5 })
  c.save()
  bit(c); c.clip()
  c.strokeStyle = 'rgba(10,8,16,0.7)'; c.lineWidth = 2.2
  const pitch = 13
  for (let y = top - pitch + (frame ? pitch / 2 : 0); y < bot; y += pitch) {
    c.beginPath(); c.moveTo(cx - 20, y); c.lineTo(cx + 20, y + 9); c.stroke()
  }
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 0.9
  for (let y = top - pitch + (frame ? pitch / 2 : 0) + 2; y < bot; y += pitch) {
    c.beginPath(); c.moveTo(cx - 20, y); c.lineTo(cx + 20, y + 9); c.stroke()
  }
  c.restore()
}

function excMaw(c: Ctx, w: number, h: number) {
  const cx = w / 2
  const jaw = sym(cx, [[0, 2], [40, 4, 1], [52, 18, 1], [50, 50, 1], [36, 64, 1], [0, 66]])
  shape(c, jaw, bronzeMetal(c, w, h), { lw: 1.5, rim: 0.5 })
  // mouth
  shape(c, rrFn(cx - 38, 16, 76, 38, 8), '#110c10', { lw: 1.2, rim: 0 })
  // two grinding rollers with teeth
  for (const y of [24, 44]) {
    c.fillStyle = lin(c, 0, y - 6, 0, y + 6, [[0, '#9aa0b0'], [0.5, '#4a4e5e'], [1, '#1c1e28']])
    c.fillRect(cx - 34, y - 5, 68, 10)
    c.strokeStyle = PAL.ink; c.lineWidth = 1; c.strokeRect(cx - 34, y - 5, 68, 10)
    c.fillStyle = '#d8dce6'
    for (let x = cx - 32; x < cx + 32; x += 7) { c.beginPath(); c.moveTo(x, y + (y < 30 ? 5 : -5)); c.lineTo(x + 3.5, y + (y < 30 ? 10 : -10)); c.lineTo(x + 7, y + (y < 30 ? 5 : -5)); c.fill() }
  }
  light(c, cx, 34, 16, PAL.ember, '#ffd27a')
  hazard(c, cx - 30, 56, 60, 5)
  rivets(c, [[cx - 44, 14], [cx + 44, 14], [cx - 42, 52], [cx + 42, 52]], 1)
}

export function registerArt_m4() {
  defineSprite('m4_drill_rig', 72, 68, drillRig)
  defineSprite('m4_rift_rock', 40, 38, riftRock, true)
  defineSprite('m4_rift_portal', 120, 120, riftPortal)
  defineSprite('m4_exc_body', 280, 184, excBody)
  defineSprite('m4_exc_shutter', 80, 64, excShutter)
  defineSprite('m4_exc_shoulder', 56, 56, excShoulder)
  defineSprite('m4_exc_drill_a', 48, 300, (c, w, h) => excDrill(c, w, h, 0))
  defineSprite('m4_exc_drill_b', 48, 300, (c, w, h) => excDrill(c, w, h, 1))
  defineSprite('m4_exc_maw', 110, 70, excMaw)
}
