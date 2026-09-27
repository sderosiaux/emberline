/**
 * Player projectiles (point UP) and pickups. Player shots stay warm and
 * elongated so they never read as the Choir's round magenta bullets.
 */
import { defineSprite } from '../sprites'
import { PAL, lin, rad, light } from '../paint'
import { shape, sym, polyFn, ellipseFn, rrFn, gloss, plume, type Ctx, type Pt, type PathFn } from './kit'

/** Additive soft halo filling the sprite. */
function halo(c: Ctx, x: number, y: number, rx: number, ry: number, col: string, a = 0.5) {
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.globalAlpha = a
  c.translate(x, y); c.scale(1, ry / rx)
  c.fillStyle = rad(c, 0, 0, rx, [[0, col], [1, 'rgba(0,0,0,0)']])
  c.beginPath(); c.arc(0, 0, rx, 0, Math.PI * 2); c.fill()
  c.restore()
}

/** Energy bolt: halo, coloured capsule, white-hot core, pointed tip up. */
function bolt(c: Ctx, w: number, h: number, col: string, deep: string, core = '#fffbe8') {
  const cx = w / 2
  halo(c, cx, h / 2, w / 2, h / 2, col, 0.6)
  const outer = sym(cx, [[0, 0.5, 1], [w * 0.3, h * 0.2], [w * 0.28, h * 0.6], [0, h - 0.5, 1]])
  c.save()
  outer(c)
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, col], [0.7, deep], [1, 'rgba(0,0,0,0)']])
  c.fill()
  c.restore()
  const inner = sym(cx, [[0, 1.5, 1], [w * 0.14, h * 0.22], [w * 0.12, h * 0.55], [0, h * 0.85, 1]])
  inner(c); c.fillStyle = core; c.fill()
}

function pulse(c: Ctx, w: number, h: number) { bolt(c, w, h, PAL.shotAmber, '#ff8a1a') }

function lance(c: Ctx, w: number, h: number) {
  const cx = w / 2
  halo(c, cx, h / 2, w / 2, h / 2, PAL.shotAmber, 0.55)
  // Long spear with a faceted head and a fading tail.
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.fillStyle = lin(c, 0, 8, 0, h, [[0, '#ffd27a'], [0.5, 'rgba(255,138,26,0.7)'], [1, 'rgba(255,90,0,0)']])
  c.fillRect(cx - 1.8, 8, 3.6, h - 8)
  c.restore()
  const head = sym(cx, [[0, 0.5, 1], [3.6, 7], [2.2, 11, 1], [0, 10]])
  shape(c, head, lin(c, 0, 0, 0, 11, [[0, '#ffffff'], [0.4, '#ffe39a'], [1, '#ff9a2a']]), { lw: 0, rim: 0, shade: 0 })
  c.fillStyle = '#ffffff'
  c.fillRect(cx - 0.6, 6, 1.2, h - 12)
  light(c, cx, 6, 4, PAL.shotAmber, '#ffffff')
}

function pellet(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, 3.5, 3.5, PAL.shotAmber, 0.8)
  c.fillStyle = rad(c, cx - 0.5, cy - 0.5, 2.6, [[0, '#ffffff'], [0.5, '#ffe7a0'], [1, '#ff9a2a']])
  c.beginPath(); c.ellipse(cx, cy, 1.9, 2.4, 0, 0, Math.PI * 2); c.fill()
}

function slug(c: Ctx, w: number, h: number) {
  const cx = w / 2
  plume(c, cx, 10, h - 10, 5, 'rgba(255,138,26,0.85)', '#ffe39a', 1)
  halo(c, cx, 7, 6, 8, PAL.shotAmber, 0.45)
  const body = sym(cx, [[0, 0.8, 1], [1.8, 2.2], [3, 5], [3, 11], [0, 11.3]])
  shape(c, body, lin(c, cx - 3, 0, cx + 3, 0, [[0, '#fff6d6'], [0.35, '#f0c060'], [1, '#8a5a16']]), { lw: 0.9, rim: 0.6, shade: 0.3 })
  c.save()
  body(c); c.clip()
  c.fillStyle = 'rgba(120,70,10,0.7)'
  c.fillRect(cx - 4, 7.5, 8, 0.9)
  c.restore()
  light(c, cx, 11.5, 3, '#ff9a2a', '#ffffff')
}

function playerMissile(c: Ctx, w: number, h: number, body: string, nose: string, len: number) {
  const cx = w / 2
  plume(c, cx, len - 0.5, h - len + 0.5, 4, 'rgba(255,122,26,0.95)', '#fff2c0', 1)
  light(c, cx, len, 2.6, PAL.ember, '#ffffff')
  for (const s of [-1, 1]) shape(c, polyFn([[cx + s * 1.2, len - 5], [cx + s * (w / 2 - 0.3), len - 1], [cx + s * 1.2, len - 1.2]]), nose, { lw: 0.6, rim: 0, shade: 0 })
  const b = sym(cx, [[0, 0.5, 1], [1.4, 2.5], [1.7, 5], [1.7, len - 1], [0, len - 0.5]])
  shape(c, b, lin(c, cx - 2, 0, cx + 2, 0, [[0, '#ffffff'], [0.5, body], [1, '#7d6c55']]), { lw: 0.7, rim: 0.4, shade: 0.2 })
  shape(c, sym(cx, [[0, 0.5, 1], [1.4, 2.5], [1.6, 3.6], [0, 3.6]]), nose, { lw: 0.6, rim: 0.4, shade: 0 })
}

function bloom(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, 7, 7, '#ff9a2a', 0.5)
  const pts: Pt[] = []
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2
    const r = i % 2 ? 3.6 : 6.6
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1])
  }
  shape(c, polyFn(pts), rad(c, cx - 1.5, cy - 1.5, 7, [[0, '#fff4c8'], [0.4, '#ffb53d'], [1, '#c2410c']]), { lw: 0.8, rim: 0.4, shade: 0.2 })
  c.fillStyle = rad(c, cx, cy, 3, [[0, '#ffffff'], [1, '#ffd27a']])
  c.beginPath(); c.arc(cx, cy, 2.4, 0, Math.PI * 2); c.fill()
}

function shard(c: Ctx, w: number, h: number) {
  const cx = w / 2
  halo(c, cx, h / 2, w / 2, h / 2, PAL.shotAmber, 0.6)
  const p = polyFn([[cx, 0.5], [cx + 2, 4], [cx + 0.8, h - 0.5], [cx - 1.4, 5]])
  p(c); c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#ffffff'], [0.4, '#ffe39a'], [1, '#ff8a1a']]); c.fill()
  c.fillStyle = 'rgba(255,255,255,0.8)'
  polyFn([[cx, 0.5], [cx - 1.4, 5], [cx + 0.2, 5.5]])(c); c.fill()
}

function helix(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, 4, 4, PAL.shotGreen, 0.8)
  c.fillStyle = rad(c, cx - 0.6, cy - 0.6, 3, [[0, '#ffffff'], [0.45, '#d8ffc0'], [1, '#4fd12a']])
  c.beginPath(); c.arc(cx, cy, 2.4, 0, Math.PI * 2); c.fill()
}

function playerMine(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4
    shape(c, polyFn([[cx + Math.cos(a - 0.4) * 4, cy + Math.sin(a - 0.4) * 4], [cx + Math.cos(a) * 7.6, cy + Math.sin(a) * 7.6], [cx + Math.cos(a + 0.4) * 4, cy + Math.sin(a + 0.4) * 4]]), PAL.ivoryDark, { lw: 0.8, rim: 0.4, shade: 0 })
  }
  const body = ellipseFn(cx, cy, 5.4, 5.4)
  shape(c, body, rad(c, cx - 2, cy - 2, 8, [[0, '#ffffff'], [0.4, PAL.ivory], [1, PAL.ivoryDark]]), { lw: 1, rim: 0.5 })
  c.save()
  c.strokeStyle = PAL.ember; c.lineWidth = 1.3
  c.beginPath(); c.arc(cx, cy, 3.6, 0, Math.PI * 2); c.stroke()
  c.restore()
  light(c, cx, cy, 3.4, PAL.ember, '#ffffff')
}

function drone(c: Ctx, w: number, _h: number) {
  const cx = w / 2
  plume(c, cx, 6.5, 3.5, 2.2, 'rgba(255,138,26,0.9)', '#fff2c0', 1)
  const b = sym(cx, [[0, 0.5, 1], [1.8, 3.5], [1.6, 6.5], [0, 7.2]])
  shape(c, b, lin(c, 0, 0, w, 0, [[0, '#ffffff'], [1, PAL.ivoryDark]]), { lw: 0.6, rim: 0.3, shade: 0 })
  c.fillStyle = PAL.ember
  c.fillRect(cx - 1.2, 3.6, 2.4, 0.9)
}

function lantern(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, 13, 13, '#ffb84a', 0.75)
  halo(c, cx, cy, 8, 8, '#ffe38a', 0.6)
  c.fillStyle = rad(c, cx - 1.5, cy - 1.5, 7, [[0, '#ffffff'], [0.35, '#fff1b0'], [0.8, '#ffc23d'], [1, '#e08a10']])
  c.beginPath(); c.arc(cx, cy, 5.6, 0, Math.PI * 2); c.fill()
  // Soft cross-shaped rays and orbiting motes.
  c.save()
  c.globalCompositeOperation = 'lighter'
  for (const [dx, dy] of [[1, 0], [0, 1]]) {
    c.fillStyle = lin(c, cx - dx * 12, cy - dy * 12, cx + dx * 12, cy + dy * 12, [[0, 'rgba(255,200,90,0)'], [0.5, 'rgba(255,235,170,0.7)'], [1, 'rgba(255,200,90,0)']])
    c.beginPath(); c.ellipse(cx, cy, dx ? 12 : 1.1, dy ? 12 : 1.1, 0, 0, Math.PI * 2); c.fill()
  }
  c.restore()
  for (const [a, r] of [[-0.6, 9], [2.2, 8.5], [3.9, 9.5]]) light(c, cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.8, '#ffd27a', '#ffffff')
}

function chorus(c: Ctx, w: number, _h: number) {
  const cx = w / 2
  // Three nested sound-wave arcs, convex side up.
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.lineCap = 'round'
  const arcs: [number, number, number][] = [[12, 3.2, 0.9], [9, 2, 0.6], [6, 1.3, 0.4]]
  for (const [r, lw, a] of arcs) {
    const cy = r + 1.5
    for (const [k, col] of [[3, `rgba(196,155,255,${a * 0.35})`], [1, `rgba(196,155,255,${a})`], [0.4, `rgba(255,255,255,${a})`]] as [number, string][]) {
      c.strokeStyle = col; c.lineWidth = lw * k
      c.beginPath(); c.arc(cx, cy, r, Math.PI * 1.18, Math.PI * 1.82); c.stroke()
    }
  }
  c.restore()
}

function flame(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  c.fillStyle = rad(c, cx, cy + 0.5, 8, [[0, 'rgba(255,245,200,0.95)'], [0.3, 'rgba(255,190,70,0.8)'], [0.65, 'rgba(255,90,20,0.4)'], [1, 'rgba(120,20,0,0)']])
  c.fillRect(0, 0, w, h)
  // Lobed puff for a less perfect silhouette.
  for (const [dx, dy, r] of [[-2.5, -2, 3.5], [2.6, -1, 3], [0, 2.5, 3.4]]) {
    c.fillStyle = rad(c, cx + dx, cy + dy, r, [[0, 'rgba(255,220,130,0.5)'], [1, 'rgba(255,120,30,0)']])
    c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, Math.PI * 2); c.fill()
  }
}

// ─────────────── Pickups ───────────────

/** Faceted gem: bright table, darker pavilion facets, star glint. */
function gem(c: Ctx, cx: number, cy: number, r: number, light1: string, mid: string, dark: string) {
  const outer: Pt[] = []
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 2
    outer.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 1.05])
  }
  const p = polyFn(outer)
  shape(c, p, lin(c, cx - r, cy - r, cx + r, cy + r, [[0, light1], [0.5, mid], [1, dark]]), { lw: 1, rim: 0.4, shade: 0.2 })
  const t = r * 0.5
  const table = polyFn(Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3 - Math.PI / 2
    return [cx + Math.cos(a) * t, cy + Math.sin(a) * t] as Pt
  }))
  c.save()
  table(c); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill()
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 0.5; c.stroke()
  c.beginPath()
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 - Math.PI / 2
    c.moveTo(cx + Math.cos(a) * t, cy + Math.sin(a) * t); c.lineTo(outer[i][0], outer[i][1])
  }
  c.stroke()
  c.fillStyle = 'rgba(0,0,0,0.2)'
  polyFn([[outer[1][0], outer[1][1]], [outer[2][0], outer[2][1]], [outer[3][0], outer[3][1]], [cx, cy + t], [cx + t * 0.87, cy + t * 0.5]])(c); c.fill()
  c.restore()
  p(c); c.strokeStyle = '#1b2a08'; c.lineWidth = 0.9; c.stroke()
  sparkle(c, cx - r * 0.35, cy - r * 0.4, r * 0.55)
}

function sparkle(c: Ctx, x: number, y: number, s: number) {
  c.save()
  c.globalCompositeOperation = 'lighter'
  c.fillStyle = 'rgba(255,255,255,0.95)'
  c.beginPath()
  c.moveTo(x, y - s); c.lineTo(x + s * 0.18, y - s * 0.18); c.lineTo(x + s, y); c.lineTo(x + s * 0.18, y + s * 0.18)
  c.lineTo(x, y + s); c.lineTo(x - s * 0.18, y + s * 0.18); c.lineTo(x - s, y); c.lineTo(x - s * 0.18, y - s * 0.18)
  c.closePath(); c.fill()
  c.restore()
}

function credit(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.credit, 0.45)
  gem(c, cx, cy, w * 0.36, '#f4ffc8', PAL.credit, '#4f7a0a')
}

function creditBig(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.credit, 0.5)
  gem(c, cx, cy, w * 0.38, '#f4ffc8', PAL.credit, '#3f6a06')
  sparkle(c, cx + 5.5, cy + 4.5, 2)
}

function repair(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.repair, 0.45)
  const cap = rrFn(2, 3.5, w - 4, h - 7, (h - 7) / 2)
  shape(c, cap, lin(c, 0, 0, 0, h, [[0, '#ffffff'], [0.5, '#d9eefc'], [1, '#7aa5c7']]), { lw: 1, rim: 0.6 })
  c.save()
  cap(c); c.clip()
  c.fillStyle = lin(c, 0, 0, 0, h, [[0, '#a8e6ff'], [1, '#2b7fc0']])
  c.fillRect(0, 0, 5, h); c.fillRect(w - 5, 0, 5, h)
  c.restore()
  cap(c); c.strokeStyle = PAL.ink; c.lineWidth = 1; c.stroke()
  const cross: PathFn = cc => {
    cc.beginPath()
    cc.roundRect(cx - 1.5, cy - 4.2, 3, 8.4, 0.6)
    cc.roundRect(cx - 4.2, cy - 1.5, 8.4, 3, 0.6)
  }
  cross(c); c.fillStyle = '#2d9cf0'; c.fill()
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(cx - 1.5, cy - 4.2, 1.2, 8.4)
  gloss(c, cap, cx - 4, cy - 3, 5, 0.6)
}

function special(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.special, 0.55)
  // Energy cell: glass cylinder with metal caps and a glowing core.
  const cell = rrFn(cx - 4.5, 3, 9, h - 6, 2)
  shape(c, cell, lin(c, cx - 5, 0, cx + 5, 0, [[0, '#ffe0b0'], [0.4, PAL.special], [1, '#b04a08']]), { lw: 1, rim: 0.5 })
  light(c, cx, cy, 5, PAL.special, '#ffffff')
  for (const y of [2, h - 5]) shape(c, rrFn(cx - 5.5, y, 11, 3, 1), lin(c, cx - 5, 0, cx + 5, 0, [[0, '#f2e8d8'], [1, '#6e6250']]), { lw: 0.9, rim: 0.5, shade: 0 })
  c.save()
  c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 0.9
  c.beginPath(); c.moveTo(cx + 1.2, cy - 3.6); c.lineTo(cx - 1.4, cy + 0.4); c.lineTo(cx + 1.2, cy + 0.2); c.lineTo(cx - 1, cy + 3.8); c.stroke()
  c.restore()
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(cx - 3.4, 6, 1, h - 12)
}

function core(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.core, 0.7)
  // Elongated octahedral crystal with an inner lattice and orbiting shards.
  const outer = polyFn([[cx, 1.5], [cx + 6.5, cy - 1], [cx + 5, cy + 4], [cx, h - 1.5], [cx - 5, cy + 4], [cx - 6.5, cy - 1]])
  shape(c, outer, lin(c, cx - 6, 2, cx + 6, h - 2, [[0, '#f6ecff'], [0.3, '#c9a8ff'], [0.65, '#7a4dd6'], [1, '#2a145e']]), { lw: 1, rim: 0.5, shade: 0.3 })
  c.save()
  outer(c); c.clip()
  c.fillStyle = 'rgba(255,255,255,0.35)'
  polyFn([[cx, 1.5], [cx - 6.5, cy - 1], [cx, cy + 1]])(c); c.fill()
  c.fillStyle = 'rgba(20,0,60,0.35)'
  polyFn([[cx + 6.5, cy - 1], [cx + 5, cy + 4], [cx, h - 1.5], [cx, cy + 1]])(c); c.fill()
  c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.5
  c.beginPath(); c.moveTo(cx, 1.5); c.lineTo(cx, h - 1.5); c.moveTo(cx - 6.5, cy - 1); c.lineTo(cx, cy + 1); c.lineTo(cx + 6.5, cy - 1); c.stroke()
  c.restore()
  outer(c); c.strokeStyle = '#1a0a36'; c.lineWidth = 1; c.stroke()
  light(c, cx, cy, 4.5, '#e2ccff', '#ffffff')
  for (const [x, y, s] of [[cx - 8.5, cy + 5.5, 1.6], [cx + 8.4, cy - 5, 1.3]]) {
    polyFn([[x, y - s * 1.6], [x + s, y], [x, y + s * 1.6], [x - s, y]])(c)
    c.fillStyle = '#d9c2ff'; c.fill(); c.strokeStyle = '#1a0a36'; c.lineWidth = 0.6; c.stroke()
  }
  sparkle(c, cx - 2.5, cy - 4.5, 2.6)
}

function shield(c: Ctx, w: number, h: number) {
  const cx = w / 2, cy = h / 2
  halo(c, cx, cy, w / 2, h / 2, PAL.shotCyan, 0.45)
  c.save()
  c.strokeStyle = PAL.ink; c.lineWidth = 4.4
  c.beginPath(); c.arc(cx, cy, 6.2, 0, Math.PI * 2); c.stroke()
  c.strokeStyle = lin(c, 0, 0, w, h, [[0, '#e8fdff'], [0.5, PAL.shotCyan], [1, PAL.tealDark]]); c.lineWidth = 2.8; c.stroke()
  c.globalCompositeOperation = 'lighter'
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 0.9
  c.beginPath(); c.arc(cx, cy, 6.2, Math.PI * 1.05, Math.PI * 1.6); c.stroke()
  c.restore()
  // Inner hex shield glyph.
  const hex = polyFn(Array.from({ length: 6 }, (_, i) => {
    const a = i * Math.PI / 3 + Math.PI / 6
    return [cx + Math.cos(a) * 2.8, cy + Math.sin(a) * 2.8] as Pt
  }))
  hex(c); c.fillStyle = 'rgba(118,242,255,0.55)'; c.fill()
  c.strokeStyle = '#e8fdff'; c.lineWidth = 0.6; c.stroke()
}

export function registerShots() {
  defineSprite('shot_pulse', 6, 16, pulse)
  defineSprite('shot_pulse_heavy', 9, 22, pulse)
  defineSprite('shot_lance', 10, 32, lance)
  defineSprite('shot_pellet', 7, 7, pellet)
  defineSprite('shot_slug', 12, 18, slug)
  defineSprite('shot_missile', 8, 16, (c, w, h) => playerMissile(c, w, h, PAL.ivory, PAL.ember, 10))
  defineSprite('shot_viper', 9, 18, (c, w, h) => playerMissile(c, w, h, '#ffb070', PAL.emberDeep, 11))
  defineSprite('shot_bloom', 14, 14, bloom)
  defineSprite('shot_shard', 5, 10, shard)
  defineSprite('shot_helix', 8, 8, helix)
  defineSprite('shot_mine', 16, 16, playerMine)
  defineSprite('shot_drone', 4, 10, drone)
  defineSprite('shot_lantern', 26, 26, lantern)
  defineSprite('shot_chorus', 20, 14, chorus)
  defineSprite('shot_flame', 16, 16, flame)
}

export function registerPickups() {
  defineSprite('pk_credit', 12, 12, credit)
  defineSprite('pk_credit_big', 18, 18, creditBig)
  defineSprite('pk_repair', 18, 18, repair)
  defineSprite('pk_special', 18, 18, special)
  defineSprite('pk_core', 22, 22, core)
  defineSprite('pk_shield', 18, 18, shield)
}
