import type { World } from '../game/world'
import type { Background } from './backgrounds'
import { getSprite, drawSprite, drawShadow, glowTexture, hasSprite, setSpriteTint } from './sprites'
import { bulletTex, bulletFx } from './bullets'
import { PW, PH, SCREEN_W, SCREEN_H, FIELD_W, ZOOM } from '../game/consts'
import { Sunline, Aegis, Lantern, Halo } from '../game/weapons'
import { specialFx } from '../game/specials'
import { PickupKind, BulletKind } from '../game/entities'
import type { Enemy } from '../game/entities'
import { TAU } from '../core/math'
import { T } from '../ui/theme'

/**
 * Two stacked canvases: a full-screen HUD layer that only repaints a few times
 * per second, and a playfield-sized layer repainted every frame. Redrawing the
 * whole 1280×720 (×DPR) screen each frame was the dominant GPU cost.
 */
export class Renderer {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  hud: HTMLCanvasElement
  hudCtx: CanvasRenderingContext2D
  scale = 1
  showHitboxes = false
  /** Bumped on resize so layers that paint rarely know to repaint. */
  generation = 0

  constructor(canvas: HTMLCanvasElement, hud: HTMLCanvasElement) {
    this.canvas = canvas
    this.hud = hud
    this.ctx = canvas.getContext('2d', { alpha: false })!
    this.hudCtx = hud.getContext('2d', { alpha: false })!
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const ww = window.innerWidth, wh = window.innerHeight
    const s = Math.min(ww / SCREEN_W, wh / SCREEN_H)
    const cw = Math.floor(SCREEN_W * s), ch = Math.floor(SCREEN_H * s)
    const screen = this.hud.parentElement as HTMLElement
    screen.style.width = `${cw}px`
    screen.style.height = `${ch}px`
    this.hud.style.width = `${cw}px`
    this.hud.style.height = `${ch}px`
    this.hud.width = Math.floor(cw * dpr)
    this.hud.height = Math.floor(ch * dpr)
    this.scale = this.hud.width / SCREEN_W
    this.canvas.style.left = '0px'
    this.canvas.style.width = `${FIELD_W * s}px`
    this.canvas.style.height = `${ch}px`
    this.canvas.width = Math.round(FIELD_W * this.scale)
    this.canvas.height = this.hud.height
    this.generation++
  }

  /** Playfield layer, in world coordinates (PW×PH), zoomed to fill the field. */
  begin() {
    const c = this.ctx
    c.setTransform(this.scale * ZOOM, 0, 0, this.scale * ZOOM, 0, 0)
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'medium'
    return c
  }

  /** Full-screen HUD layer, logical 1280×720 coordinates. */
  beginHud() {
    const c = this.hudCtx
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0)
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'medium'
    return c
  }

  showField(on: boolean) { this.canvas.style.visibility = on ? 'visible' : 'hidden' }

  drawField(w: World, bg: Background | null) {
    const c = this.begin()
    c.save()
    c.fillStyle = '#20202a'
    c.fillRect(0, 0, PW, PH)
    c.translate(w.shakeX, w.shakeY)
    if (bg) bg.drawBase(c)
    else { c.fillStyle = '#20202a'; c.fillRect(-20, -20, PW + 40, PH + 40) }
    drawWorld(c, w, bg, this.showHitboxes)
    c.restore()
    if (w.flashScreen > 0) {
      c.fillStyle = `rgba(255,248,235,${Math.min(0.8, w.flashScreen)})`
      c.fillRect(0, 0, PW, PH)
    }
  }
}

const spr = (k: string) => getSprite(k)

export function drawWorld(c: CanvasRenderingContext2D, w: World, bg: Background | null, hitboxes = false) {
  // decals (scorch)
  for (const d of w.decals) {
    const g = glowTexture('rgba(30,18,12,0.55)', 64, 0.3)
    c.globalAlpha = 0.7
    c.drawImage(g, d.x - d.r, d.y - d.r, d.r * 2, d.r * 2)
  }
  c.globalAlpha = 1
  // tread marks
  if (w.tracks.length) {
    c.fillStyle = 'rgb(35,24,16)'
    for (const t of w.tracks) {
      c.globalAlpha = 0.22 * Math.min(1, t.life / 2)
      c.save(); c.translate(t.x, t.y); c.rotate(t.rot); c.fillRect(-2.5, -3, 5, 6); c.restore()
    }
    c.globalAlpha = 1
  }
  // ground decor (below everything that moves)
  for (const d of w.decor) {
    if (d.above) continue
    if (!hasSprite(d.sprite)) continue
    drawSprite(c, spr(d.sprite), d.x, d.y, d.rot, d.scale, d.alpha)
  }
  w.parts.drawNormal(c, true)

  // ground enemies (sorted by z so trains sit under turrets)
  const ground: Enemy[] = []
  const air: Enemy[] = []
  for (const e of w.enemies) (e.layer === 'ground' ? ground : air).push(e)
  ground.sort((a, b) => (a.def.z ?? 0) - (b.def.z ?? 0))
  // contact shadows first, so every unit sits *in* the ground rather than on top of it
  const sh = glowTexture('rgba(10,6,4,0.75)', 64, 0.25)
  for (const e of ground) {
    if (e.hidden || e.visibleAlpha < 0.4 || e.bossPart) continue
    const r = e.r * 1.45 * e.scale
    c.globalAlpha = 0.5 * e.visibleAlpha
    c.drawImage(sh, e.x - r + 3, e.y - r * 0.9 + 5, r * 2, r * 1.8)
  }
  c.globalAlpha = 1
  setSpriteTint(w.ambient)
  for (const e of ground) drawEnemy(c, w, e)
  setSpriteTint(null)
  for (const d of w.decor) if (d.above && hasSprite(d.sprite)) drawSprite(c, spr(d.sprite), d.x, d.y, d.rot, d.scale, d.alpha)

  // shadows of air units
  for (const e of air) {
    if (e.hidden || e.def.noShadow || e.visibleAlpha < 0.5 || e.parent) continue
    drawShadow(c, spr(e.def.sprite), e.x + 16, e.y + 30, e.rot, e.scale * 0.85)
  }
  const p = w.player
  if (p.alive) drawShadow(c, spr('player'), p.x + 16, p.y + 34, 0, 0.8)

  // pickups
  for (const k of w.pickups.items) {
    if (!k.active) continue
    const key = PK[k.kind]
    const bob = Math.sin(k.age * 6 + k.x) * 0.12
    c.globalCompositeOperation = 'lighter'
    const col = k.kind === PickupKind.Core ? '#b58cff' : k.kind === PickupKind.Repair ? '#6fd3ff' : k.kind === PickupKind.Special ? '#ff9a3d' : '#c6ff3d'
    const gs = k.kind === PickupKind.Credit ? 16 : 26
    c.globalAlpha = 0.5 + 0.2 * Math.sin(k.age * 8)
    c.drawImage(glowTexture(col, 64, 0.1), k.x - gs, k.y - gs, gs * 2, gs * 2)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
    drawSprite(c, spr(key), k.x, k.y, k.kind === PickupKind.Credit || k.kind === PickupKind.CreditBig ? k.age * 3 : 0, 1 + bob)
  }

  for (const e of air) drawEnemy(c, w, e)

  // player shots
  drawShots(c, w)
  // hitscan lines (arcs, rails, zaps)
  drawLines(c, w)
  drawBeams(c, w)

  if (p.alive) drawPlayer(c, w)

  w.parts.drawNormal(c, false)
  w.parts.drawAdd(c)
  drawSpecials(c, w)

  if (bg) bg.drawOver(c)

  drawLasers(c, w)
  drawBullets(c, w)
  drawFloaters(c, w)

  if (hitboxes) {
    c.strokeStyle = '#0f0'
    c.lineWidth = 1
    for (const e of w.enemies) { c.beginPath(); c.arc(e.x, e.y, e.r, 0, TAU); c.stroke() }
    c.strokeStyle = '#ff0'
    c.beginPath(); c.arc(p.x, p.y, p.hitR, 0, TAU); c.stroke()
  }
}

const PK: Record<PickupKind, string> = {
  [PickupKind.Credit]: 'pk_credit', [PickupKind.CreditBig]: 'pk_credit_big', [PickupKind.Repair]: 'pk_repair',
  [PickupKind.Special]: 'pk_special', [PickupKind.Core]: 'pk_core', [PickupKind.Shield]: 'pk_shield',
}

function drawEnemy(c: CanvasRenderingContext2D, w: World, e: Enemy) {
  if (e.hidden) return
  const a = e.visibleAlpha
  if (a < 0.2) {
    // stealth shimmer: faint refraction ring only
    c.globalAlpha = 0.18 + 0.1 * Math.sin(e.age * 9)
    drawSprite(c, spr(e.def.sprite), e.x + Math.sin(e.age * 13) * 1.5, e.y, e.rot, e.scale, 0.25)
    c.globalAlpha = 1
    return
  }
  if (e.elite) {
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = 0.45 + 0.15 * Math.sin(e.age * 6)
    const s = e.r * 2.6
    c.drawImage(glowTexture('#ffcc33', 64, 0.05), e.x - s, e.y - s, s * 2, s * 2)
    c.globalAlpha = 1
    c.globalCompositeOperation = 'source-over'
  }
  if (e.def.drawBody) e.def.drawBody(c, e, w)
  else drawSprite(c, spr(e.def.sprite), e.x, e.y, e.rot, e.scale, a, e.flash)
  if (w.isShielded(e)) {
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = `rgba(90,220,255,${0.5 + 0.2 * Math.sin(w.time * 8 + e.id)})`
    c.lineWidth = 2
    c.beginPath(); c.arc(e.x, e.y, e.r + 6, 0, TAU); c.stroke()
    c.globalCompositeOperation = 'source-over'
  }
  e.def.draw?.(c, e, w)
}

/** Additive halo per player projectile type: makes firepower read as light, not specks. */
const SHOT_GLOW: Record<string, [string, number]> = {
  shot_pulse: ['#ffb23d', 11], shot_pulse_heavy: ['#ffb23d', 15], shot_lance: ['#ffd27a', 22], shot_pellet: ['#ff9a3d', 9],
  shot_slug: ['#ffb23d', 16], shot_missile: ['#ff7a1a', 10], shot_viper: ['#ff7a1a', 12], shot_bloom: ['#ff9a3d', 16],
  shot_shard: ['#ffb23d', 7], shot_helix: ['#7dff6a', 14], shot_helix_seg: ['#7dff6a', 14], shot_drone: ['#ffd27a', 7], shot_lantern: ['#ffd27a', 34],
  shot_mine: ['#ff7a1a', 12],
}

function drawShots(c: CanvasRenderingContext2D, w: World) {
  // Normal-blend halo: additive light vanishes on bright sand/snow, a tinted halo reads everywhere.
  for (const s of w.shots.items) {
    if (!s.active) continue
    const g = SHOT_GLOW[s.sprite]
    if (!g) continue
    const r = g[1] * s.scale
    c.globalAlpha = 0.32
    c.drawImage(glowTexture(g[0], 64, 0.12), s.x - r, s.y - r, r * 2, r * 2)
  }
  c.globalAlpha = 1
  for (const s of w.shots.items) {
    if (!s.active) continue
    const sp = spr(s.sprite)
    if (s.sprite === 'shot_flame') {
      c.globalCompositeOperation = 'lighter'
      const k = s.age / s.ttl
      drawSprite(c, sp, s.x, s.y, s.rot, 0.6 + k * 1.4, 1 - k)
      c.globalCompositeOperation = 'source-over'
      continue
    }
    if (s.sprite === 'shot_chorus') {
      // Sound-wave crescent drawn as strokes so it scales cleanly to any radius.
      const a = Math.max(0.25, 1 - s.age / s.ttl)
      const ang = Math.atan2(s.vy, s.vx)
      c.lineCap = 'round'
      c.globalAlpha = a * 0.5
      c.strokeStyle = '#5a2aa8'
      c.lineWidth = 7
      c.beginPath(); c.arc(s.x, s.y + s.r * 0.6, s.r, ang - 0.9, ang + 0.9); c.stroke()
      c.globalAlpha = a
      c.strokeStyle = '#c49bff'
      c.lineWidth = 4
      c.stroke()
      c.strokeStyle = '#ffffff'
      c.lineWidth = 1.5
      c.stroke()
      c.globalAlpha = a * 0.6
      c.strokeStyle = '#c49bff'
      c.lineWidth = 2
      c.beginPath(); c.arc(s.x, s.y + s.r * 0.6 + 7, s.r * 0.85, ang - 0.8, ang + 0.8); c.stroke()
      c.globalAlpha = 1
      continue
    }
    if (s.sprite === 'shot_pellet' || s.sprite === 'shot_shard') {
      const k = s.age / s.ttl
      drawSprite(c, sp, s.x, s.y, s.rot, 1, k > 0.7 ? (1 - k) / 0.3 : 1)
      continue
    }
    drawSprite(c, sp, s.x, s.y, s.rot, s.scale)
  }
}

function drawLines(c: CanvasRenderingContext2D, w: World) {
  if (!w.lines.length) return
  c.globalCompositeOperation = 'lighter'
  c.lineJoin = 'round'
  c.lineCap = 'round'
  for (const l of w.lines) {
    const k = l.life / l.max
    c.globalAlpha = k
    const path = () => {
      c.beginPath()
      c.moveTo(l.pts[0], l.pts[1])
      for (let i = 2; i < l.pts.length; i += 2) c.lineTo(l.pts[i], l.pts[i + 1])
    }
    path()
    c.globalCompositeOperation = 'source-over'
    c.strokeStyle = l.glow
    c.lineWidth = l.width * 3
    c.globalAlpha = k * 0.45
    c.stroke()
    c.globalCompositeOperation = 'lighter'
    c.globalAlpha = k
    c.strokeStyle = l.color
    c.lineWidth = l.width
    c.stroke()
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
}

function drawBeams(c: CanvasRenderingContext2D, w: World) {
  const f = w.player.front
  if (!(f instanceof Sunline) || !f.on) return
  c.globalCompositeOperation = 'lighter'
  for (const b of f.beams) {
    const ex = b.x + Math.cos(b.ang) * b.len, ey = b.y + Math.sin(b.ang) * b.len
    const pulse = 1 + Math.sin(w.time * 60) * 0.12
    c.lineCap = 'round'
    c.strokeStyle = 'rgba(255,150,40,0.35)'
    c.lineWidth = b.width * 2.6 * pulse
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(ex, ey); c.stroke()
    c.strokeStyle = 'rgba(255,214,110,0.9)'
    c.lineWidth = b.width * pulse
    c.stroke()
    c.strokeStyle = '#fffbe8'
    c.lineWidth = Math.max(1.5, b.width * 0.35)
    c.stroke()
    const g = glowTexture('#ffd27a', 64, 0.15)
    const r = b.width * 2.5
    c.drawImage(g, b.x - r, b.y - r, r * 2, r * 2)
    c.drawImage(g, ex - r, ey - r, r * 2, r * 2)
  }
  c.globalCompositeOperation = 'source-over'
}

function drawPlayer(c: CanvasRenderingContext2D, w: World) {
  const p = w.player
  // pods
  for (const pod of p.pods) {
    const key = `pod_${pod.id}`
    if (pod instanceof Lantern && pod.charge > 0) {
      c.globalCompositeOperation = 'lighter'
      const k = pod.charge / pod.need
      const r = 6 + k * 14
      c.globalAlpha = 0.4 + k * 0.6
      c.drawImage(glowTexture('#ffd27a', 64, 0.2), pod.x - r, pod.y - 10 - r, r * 2, r * 2)
      c.globalAlpha = 1
      c.globalCompositeOperation = 'source-over'
    }
    drawSprite(c, spr(key), pod.x, pod.y, pod instanceof Aegis ? w.time * 3 : 0)
  }
  if (p.rear instanceof Halo) {
    c.globalCompositeOperation = 'lighter'
    for (const q of p.rear.pulses) {
      c.strokeStyle = `rgba(196,155,255,${1 - q.r / q.max})`
      c.lineWidth = 3
      c.beginPath(); c.arc(p.x, p.y, q.r, 0, TAU); c.stroke()
    }
    c.globalCompositeOperation = 'source-over'
  }
  const blink = p.invuln > 0 && p.hitFlash <= 0 && Math.floor(w.time * 30) % 2 === 0
  const alpha = p.phased ? 0.45 : p.entering > 0 ? 1 : blink ? 0.55 : 1
  // engine flame
  c.globalCompositeOperation = 'lighter'
  const fl = 0.8 + Math.random() * 0.4 + (p.vy < 0 ? 0.4 : 0)
  const col = p.overclock > 0 ? '#76f2ff' : '#ff9a3d'
  c.drawImage(glowTexture(col, 64, 0.2), p.x - 9, p.y + 12, 18, 22 * fl)
  c.drawImage(glowTexture('#fff2d0', 64, 0.3), p.x - 4, p.y + 14, 8, 10 * fl)
  c.globalCompositeOperation = 'source-over'
  const bank = p.bank
  const key = Math.abs(bank) > 0.35 ? 'player_bank' : 'player'
  const sp = spr(key)
  const sx = bank < -0.35 ? -1 : 1
  c.save()
  c.translate(p.x, p.y)
  c.scale(sx * (1 - Math.abs(bank) * 0.06), 1)
  c.globalAlpha = alpha
  c.drawImage(sp.img, -sp.w / 2, -sp.h / 2, sp.w, sp.h)
  if (p.hitFlash > 0) { c.globalAlpha = Math.min(1, p.hitFlash); c.drawImage(sp.flash, -sp.w / 2, -sp.h / 2, sp.w, sp.h) }
  c.restore()
  c.globalAlpha = 1
  // shield bubble shows briefly after hits, and a faint rim while charged
  const sk = p.maxShield > 0 ? p.shield / p.maxShield : 0
  if (sk > 0) {
    c.globalCompositeOperation = 'lighter'
    const hitGlow = p.invuln > 0 ? 0.5 : 0
    c.strokeStyle = `rgba(118,242,255,${0.08 + sk * 0.12 + hitGlow})`
    c.lineWidth = 1.5
    c.beginPath(); c.arc(p.x, p.y, 27, 0, TAU); c.stroke()
    c.globalCompositeOperation = 'source-over'
  }
  if (p.shieldBreakFlash > 0) {
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = `rgba(255,80,80,${p.shieldBreakFlash})`
    c.lineWidth = 3
    c.beginPath(); c.arc(p.x, p.y, 27 + (1 - p.shieldBreakFlash) * 20, 0, TAU); c.stroke()
    c.globalCompositeOperation = 'source-over'
  }
  // hit core indicator in precision / always faint
  c.fillStyle = '#ffffff'
  c.globalAlpha = 0.9
  c.beginPath(); c.arc(p.x, p.y, p.hitR, 0, TAU); c.fill()
  c.strokeStyle = T.ember
  c.lineWidth = 1.2
  c.stroke()
  c.globalAlpha = 1
}

function drawSpecials(c: CanvasRenderingContext2D, w: World) {
  const f = specialFx(w)
  if (f.nova) {
    const n = f.nova
    c.globalCompositeOperation = 'lighter'
    c.strokeStyle = `rgba(255,210,122,${1 - n.r / 420})`
    c.lineWidth = 14
    c.beginPath(); c.arc(n.x, n.y, n.r, 0, TAU); c.stroke()
    c.strokeStyle = `rgba(255,255,255,${1 - n.r / 420})`
    c.lineWidth = 3
    c.stroke()
    c.globalCompositeOperation = 'source-over'
  }
  if (f.well) {
    const g = f.well
    const pulse = 1 + Math.sin(w.time * 20) * 0.05
    c.fillStyle = 'rgba(10,0,20,0.85)'
    c.beginPath(); c.arc(g.x, g.y, 34 * pulse, 0, TAU); c.fill()
    c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = `rgba(196,155,255,${0.6 - i * 0.18})`
      c.lineWidth = 3 - i
      c.beginPath(); c.ellipse(g.x, g.y, (46 + i * 22) * pulse, (18 + i * 8) * pulse, w.time * (1 + i * 0.4), 0, TAU); c.stroke()
    }
    c.globalCompositeOperation = 'source-over'
  }
}

function drawLasers(c: CanvasRenderingContext2D, w: World) {
  for (const l of w.lasers) {
    const ex = l.x + Math.cos(l.ang) * l.len, ey = l.y + Math.sin(l.ang) * l.len
    if (l.age < l.warn) {
      const k = l.age / l.warn
      c.strokeStyle = `rgba(255,46,136,${0.25 + 0.5 * k})`
      c.lineWidth = 1 + k * 2
      c.setLineDash([10, 8])
      c.lineDashOffset = -w.time * 80
      c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(ex, ey); c.stroke()
      c.setLineDash([])
    } else {
      c.lineCap = 'round'
      c.strokeStyle = '#2a0718'
      c.lineWidth = l.width + 4
      c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(ex, ey); c.stroke()
      c.globalCompositeOperation = 'lighter'
      c.strokeStyle = '#ff2e88'
      c.lineWidth = l.width * (0.9 + Math.sin(w.time * 50) * 0.1)
      c.stroke()
      c.strokeStyle = '#fff4fa'
      c.lineWidth = l.width * 0.35
      c.stroke()
      c.globalCompositeOperation = 'source-over'
    }
  }
}

const ORBISH = new Set<BulletKind>([BulletKind.Orb, BulletKind.Big, BulletKind.Ring, BulletKind.Wave, BulletKind.Bomb, BulletKind.Mine])

function drawBullets(c: CanvasRenderingContext2D, w: World) {
  const items = w.bullets.items
  const glow = bulletFx.glow!, ring = bulletFx.ring!
  const time = w.time
  // 1) additive pass: pulsing glows under every energy shot, streaks behind fast ones
  c.globalCompositeOperation = 'lighter'
  for (let i = 0; i < items.length; i++) {
    const b = items[i]
    if (!b.active || b.kind === BulletKind.Missile) continue
    const pulse = 1 + 0.18 * Math.sin(time * 13 + i * 1.7)
    const rr = b.r * b.scale * 3.1 * pulse
    c.globalAlpha = b.age < b.arm ? 0.25 : 0.5
    c.drawImage(glow, b.x - rr, b.y - rr, rr * 2, rr * 2)
    // additive light vanishes on sand and snow: a tinted normal-blend halo keeps the pulse visible there
    c.globalCompositeOperation = 'source-over'
    c.globalAlpha = 0.22
    const hr = rr * 0.75
    c.drawImage(glow, b.x - hr, b.y - hr, hr * 2, hr * 2)
    c.globalCompositeOperation = 'lighter'
    if (b.kind === BulletKind.Needle || b.kind === BulletKind.Shard) {
      const sp = Math.hypot(b.vx, b.vy) || 1
      const len = Math.min(34, sp * 0.06)
      c.globalAlpha = 0.45
      c.strokeStyle = '#ff5aa8'
      c.lineWidth = b.r * 1.3
      c.lineCap = 'round'
      c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - (b.vx / sp) * len, b.y - (b.vy / sp) * len); c.stroke()
    }
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
  // 2) bodies
  for (let i = 0; i < items.length; i++) {
    const b = items[i]
    if (!b.active) continue
    const t = bulletTex(b.kind)
    const breathe = ORBISH.has(b.kind) ? 1 + 0.07 * Math.sin(time * 16 + i * 1.7) : 1
    const s = b.scale * breathe * (b.age < 0.08 ? 0.5 + b.age * 6 : 1)
    const bw = t.w * s, bh = t.h * s
    if (b.arm > 0 && b.age < b.arm) c.globalAlpha = 0.5
    if (t.rotate) {
      const a = b.kind === BulletKind.Shard ? b.age * 14 : Math.atan2(b.vy, b.vx) - Math.PI / 2
      const cs = Math.cos(a), sn = Math.sin(a)
      c.save()
      c.transform(cs, sn, -sn, cs, b.x, b.y)
      c.drawImage(t.img, -bw / 2, -bh / 2, bw, bh)
      c.restore()
    } else c.drawImage(t.img, b.x - bw / 2, b.y - bh / 2, bw, bh)
    c.globalAlpha = 1
  }
  // 3) spinning energy ring on the big orbs only (small ones would just turn to mush)
  c.globalCompositeOperation = 'lighter'
  for (let i = 0; i < items.length; i++) {
    const b = items[i]
    if (!b.active || (b.kind !== BulletKind.Big && b.kind !== BulletKind.Wave && b.r * b.scale < 6)) continue
    const rr = b.r * b.scale * 1.9
    const a = time * 5 + i
    const cs = Math.cos(a), sn = Math.sin(a)
    c.save()
    c.transform(cs, sn, -sn, cs, b.x, b.y)
    c.globalAlpha = 0.8
    c.drawImage(ring, -rr, -rr, rr * 2, rr * 2)
    c.restore()
  }
  c.globalAlpha = 1
  c.globalCompositeOperation = 'source-over'
}

function drawFloaters(c: CanvasRenderingContext2D, w: World) {
  c.font = `600 11px ${T.fontMono}`
  c.textAlign = 'center'
  for (let i = w.floaters.length - 1; i >= 0; i--) {
    const f = w.floaters[i]
    c.globalAlpha = Math.min(1, f.life * 2)
    c.fillStyle = '#15131c'
    c.fillText(f.text, f.x + 1, f.y + 1)
    c.fillStyle = f.color
    c.fillText(f.text, f.x, f.y)
  }
  c.globalAlpha = 1
}
