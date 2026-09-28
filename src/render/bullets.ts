import { makeCanvas } from './sprites'
import { BulletKind } from '../game/entities'

/**
 * Enemy bullet textures. Readability rule: every enemy projectile has a dark
 * rim (reads on bright ground), a saturated magenta body and a white-hot core
 * (reads on dark space). Nothing else in the game uses this combination.
 */
const S = 2
export interface BulletTex { img: HTMLCanvasElement; w: number; h: number; rotate: boolean }
const tex = new Map<BulletKind, BulletTex>()

function make(w: number, h: number, rotate: boolean, paint: (c: CanvasRenderingContext2D) => void): BulletTex {
  const img = makeCanvas(w * S, h * S)
  const c = img.getContext('2d')!
  c.scale(S, S)
  paint(c)
  return { img, w, h, rotate }
}

/** Energy orb: dark rim (reads on bright ground) → deep magenta → hot pink → white-hot core, plus a specular glint. */
function orb(c: CanvasRenderingContext2D, cx: number, cy: number, r: number, body = '#ff2e88', halo = 'rgba(255,46,136,0.35)') {
  void halo
  c.fillStyle = '#2a0718'
  c.beginPath(); c.arc(cx, cy, r + 1.3, 0, Math.PI * 2); c.fill()
  const g = c.createRadialGradient(cx - r * 0.15, cy - r * 0.15, 0, cx, cy, r)
  g.addColorStop(0, '#ffffff')
  g.addColorStop(0.28, '#ffe0ef')
  g.addColorStop(0.55, body === '#ff2e88' ? '#ff5aa8' : body)
  g.addColorStop(0.82, '#e0147a')
  g.addColorStop(1, '#8e0c4d')
  c.fillStyle = g
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill()
  c.fillStyle = 'rgba(255,255,255,0.85)'
  c.beginPath(); c.ellipse(cx - r * 0.35, cy - r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2); c.fill()
}

/** Additive pieces animated at draw time: a soft pulsing glow and a broken ring that spins. */
export const bulletFx = { glow: null as HTMLCanvasElement | null, ring: null as HTMLCanvasElement | null }
function initFx() {
  const g = makeCanvas(64 * S, 64 * S)
  const x = g.getContext('2d')!
  const rg = x.createRadialGradient(32 * S, 32 * S, 0, 32 * S, 32 * S, 32 * S)
  rg.addColorStop(0, 'rgba(255,90,170,0.9)'); rg.addColorStop(0.35, 'rgba(255,46,136,0.45)'); rg.addColorStop(1, 'rgba(255,46,136,0)')
  x.fillStyle = rg; x.fillRect(0, 0, 64 * S, 64 * S)
  bulletFx.glow = g
  const r = makeCanvas(32 * S, 32 * S)
  const y = r.getContext('2d')!
  y.scale(S, S)
  y.lineCap = 'round'
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2
    y.strokeStyle = 'rgba(255,200,228,0.95)'; y.lineWidth = 1.6
    y.beginPath(); y.arc(16, 16, 12, a, a + 1.1); y.stroke()
  }
  bulletFx.ring = r
}

export function initBulletTextures() {
  initFx()
  tex.set(BulletKind.Orb, make(20, 20, false, (c) => orb(c, 10, 10, 4.6)))
  tex.set(BulletKind.Big, make(36, 36, false, (c) => orb(c, 18, 18, 8.5)))
  tex.set(BulletKind.Ring, make(20, 20, false, (c) => orb(c, 10, 10, 4.6, '#ff5aa5')))
  tex.set(BulletKind.Shard, make(14, 18, true, (c) => {
    c.fillStyle = '#2a0718'
    c.beginPath(); c.moveTo(7, 0); c.lineTo(13, 9); c.lineTo(7, 18); c.lineTo(1, 9); c.closePath(); c.fill()
    c.fillStyle = '#ff2e88'
    c.beginPath(); c.moveTo(7, 2); c.lineTo(11, 9); c.lineTo(7, 16); c.lineTo(3, 9); c.closePath(); c.fill()
    c.fillStyle = '#fff4fa'
    c.beginPath(); c.moveTo(7, 5); c.lineTo(9, 9); c.lineTo(7, 13); c.lineTo(5, 9); c.closePath(); c.fill()
  }))
  tex.set(BulletKind.Needle, make(12, 26, true, (c) => {
    const g = c.createRadialGradient(6, 13, 0, 6, 13, 13)
    g.addColorStop(0, 'rgba(255,46,136,0.4)'); g.addColorStop(1, 'rgba(255,46,136,0)')
    c.fillStyle = g; c.fillRect(0, 0, 12, 26)
    c.fillStyle = '#2a0718'; c.beginPath(); c.ellipse(6, 13, 4.2, 11, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#ff2e88'; c.beginPath(); c.ellipse(6, 13, 3, 9.5, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#fff4fa'; c.beginPath(); c.ellipse(6, 13, 1.4, 7, 0, 0, Math.PI * 2); c.fill()
  }))
  tex.set(BulletKind.Wave, make(24, 24, false, (c) => {
    c.strokeStyle = '#2a0718'; c.lineWidth = 5
    c.beginPath(); c.arc(12, 12, 6.5, 0, Math.PI * 2); c.stroke()
    c.strokeStyle = '#e04dff'; c.lineWidth = 3
    c.beginPath(); c.arc(12, 12, 6.5, 0, Math.PI * 2); c.stroke()
    c.fillStyle = '#fff4fa'; c.beginPath(); c.arc(12, 12, 2.6, 0, Math.PI * 2); c.fill()
  }))
  tex.set(BulletKind.Bomb, make(22, 22, false, (c) => {
    c.fillStyle = '#2a0718'; c.beginPath(); c.arc(11, 11, 8, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#4b2a3a'; c.beginPath(); c.arc(11, 11, 6.5, 0, Math.PI * 2); c.fill()
    c.strokeStyle = '#ff2e88'; c.lineWidth = 2
    c.beginPath(); c.arc(11, 11, 6.5, 0, Math.PI * 2); c.stroke()
    c.fillStyle = '#fff4fa'; c.beginPath(); c.arc(11, 11, 2.2, 0, Math.PI * 2); c.fill()
  }))
  // Missiles are shootable: a physical body, not an energy ball, so players learn "shoot these".
  tex.set(BulletKind.Missile, make(12, 24, true, (c) => {
    c.fillStyle = '#1c1a22'
    c.beginPath(); c.moveTo(6, 1); c.lineTo(10, 7); c.lineTo(10, 19); c.lineTo(2, 19); c.lineTo(2, 7); c.closePath(); c.fill()
    c.fillStyle = '#6f6a78'; c.fillRect(3.5, 7, 5, 11)
    c.fillStyle = '#ff2e88'; c.beginPath(); c.moveTo(6, 2.5); c.lineTo(8.5, 7); c.lineTo(3.5, 7); c.closePath(); c.fill()
    c.fillStyle = '#ffb14a'; c.beginPath(); c.moveTo(3, 19); c.lineTo(6, 24); c.lineTo(9, 19); c.closePath(); c.fill()
  }))
  tex.set(BulletKind.Mine, make(22, 22, false, (c) => {
    c.fillStyle = '#2a0718'
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; c.beginPath(); c.arc(11 + Math.cos(a) * 8, 11 + Math.sin(a) * 8, 2, 0, Math.PI * 2); c.fill() }
    orb(c, 11, 11, 6)
  }))
}

export function bulletTex(k: BulletKind) { return tex.get(k)! }
