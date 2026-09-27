import type { World } from '../game/world'
import type { MissionDef } from '../game/level'
import { ITEM } from '../data/items'
import { T } from '../ui/theme'
import { FIELD_X, PW, PH, SCREEN_W, SCREEN_H } from '../game/consts'
import { clamp } from '../core/math'

export interface RadioLine { who: string; text: string; tone: 'ally' | 'enemy' | 'odd'; t: number }
export interface HudState {
  mission: MissionDef
  radio: RadioLine[]
  banner: { text: string; sub?: string; t: number } | null
  progress: number
  bank: number
  fps: number
  showFps: boolean
  secretToast: { text: string; t: number } | null
  specialHint: number
}

const LW = FIELD_X
const RX = FIELD_X + PW

let paperCache: HTMLCanvasElement | null = null
function paper(): HTMLCanvasElement {
  if (paperCache) return paperCache
  const c = document.createElement('canvas')
  c.width = SCREEN_W * 2; c.height = SCREEN_H * 2
  const x = c.getContext('2d')!
  x.scale(2, 2)
  x.fillStyle = T.paper
  x.fillRect(0, 0, SCREEN_W, SCREEN_H)
  // faint blueprint grid
  x.strokeStyle = 'rgba(28,26,34,0.045)'
  x.lineWidth = 1
  for (let gx = 0; gx < SCREEN_W; gx += 16) { x.beginPath(); x.moveTo(gx + 0.5, 0); x.lineTo(gx + 0.5, SCREEN_H); x.stroke() }
  for (let gy = 0; gy < SCREEN_H; gy += 16) { x.beginPath(); x.moveTo(0, gy + 0.5); x.lineTo(SCREEN_W, gy + 0.5); x.stroke() }
  // field frame
  x.fillStyle = T.ink
  x.fillRect(LW - 6, 0, 6, SCREEN_H)
  x.fillRect(RX, 0, 6, SCREEN_H)
  x.fillStyle = T.ember
  x.fillRect(LW - 10, 0, 2, SCREEN_H)
  x.fillRect(RX + 8, 0, 2, SCREEN_H)
  paperCache = c
  return c
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = T.muted, size = 10, align: CanvasTextAlign = 'left') {
  c.font = `600 ${size}px ${T.fontHead}`
  c.fillStyle = color
  c.textAlign = align
  c.letterSpacing = '1.5px'
  c.fillText(text.toUpperCase(), x, y)
  c.letterSpacing = '0px'
}

function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 14, color: string = T.ink, align: CanvasTextAlign = 'left', weight = 600) {
  c.font = `${weight} ${size}px ${T.fontMono}`
  c.fillStyle = color
  c.textAlign = align
  c.fillText(text, x, y)
}

function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string, ghost = 0, flash = false) {
  c.fillStyle = T.paper3
  c.fillRect(x, y, w, h)
  if (ghost > k) { c.fillStyle = 'rgba(224,70,59,0.35)'; c.fillRect(x, y, w * clamp(ghost, 0, 1), h) }
  c.fillStyle = flash ? T.bad : color
  c.fillRect(x, y, w * clamp(k, 0, 1), h)
  c.fillStyle = 'rgba(255,255,255,0.28)'
  c.fillRect(x, y, w * clamp(k, 0, 1), h * 0.35)
  c.strokeStyle = T.ink
  c.lineWidth = 1.5
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)
  c.strokeStyle = 'rgba(28,26,34,0.25)'
  c.lineWidth = 1
  for (let i = 1; i < 10; i++) { const tx = Math.round(x + (w * i) / 10) + 0.5; c.beginPath(); c.moveTo(tx, y + 1); c.lineTo(tx, y + h - 1); c.stroke() }
}

function pips(c: CanvasRenderingContext2D, x: number, y: number, level: number, max: number) {
  for (let i = 0; i < max; i++) {
    c.fillStyle = i < level ? T.ember : T.paper3
    c.fillRect(x + i * 9, y, 7, 7)
    c.strokeStyle = T.ink
    c.lineWidth = 1
    c.strokeRect(x + i * 9 + 0.5, y + 0.5, 6, 6)
  }
}

const ghost = { hull: 1, shield: 1 }

export function drawHud(c: CanvasRenderingContext2D, w: World, h: HudState) {
  c.drawImage(paper(), 0, 0, SCREEN_W, SCREEN_H)
  const p = w.player
  const time = w.time

  // ───── left panel ─────
  const x0 = 36
  c.font = `700 22px ${T.fontHead}`
  c.fillStyle = T.ink
  c.textAlign = 'left'
  c.letterSpacing = '4px'
  c.fillText('EMBERLINE', x0, 52)
  c.letterSpacing = '0px'
  c.fillStyle = T.ember
  c.fillRect(x0, 60, 44, 3)
  label(c, `Mission ${h.mission.num} · ${h.mission.name}`, x0, 82, T.ink2, 11)

  const bw = LW - x0 - 44
  let y = 124
  const sk = p.maxShield > 0 ? p.shield / p.maxShield : 0
  const hk = p.hull / p.maxHull
  ghost.shield = Math.max(sk, ghost.shield - w.frameDt * 0.6)
  ghost.hull = Math.max(hk, ghost.hull - w.frameDt * 0.4)
  label(c, 'Shield', x0, y); mono(c, `${Math.ceil(p.shield)}`, x0 + bw, y, 12, T.ink, 'right')
  bar(c, x0, y + 6, bw, 14, sk, T.shield, ghost.shield)
  y += 46
  const lowHull = hk < 0.25 && Math.floor(time * 4) % 2 === 0
  label(c, 'Hull', x0, y, lowHull ? T.bad : T.muted); mono(c, `${Math.ceil(p.hull)}`, x0 + bw, y, 12, lowHull ? T.bad : T.ink, 'right')
  bar(c, x0, y + 6, bw, 14, hk, T.hull, ghost.hull, lowHull)
  y += 46
  const starving = p.starving > 0
  label(c, starving ? 'Energy — overdrawn' : 'Energy', x0, y, starving ? T.bad : T.muted)
  mono(c, `${Math.floor(p.energy)}`, x0 + bw, y, 12, T.ink, 'right')
  bar(c, x0, y + 6, bw, 10, p.energy / p.maxEnergy, p.overclock > 0 ? T.shield : T.energy, 0, starving && Math.floor(time * 10) % 2 === 0)
  y += 40

  // special
  if (p.specialId) {
    const def = ITEM[p.specialId]
    const ready = p.special >= p.specialCost
    label(c, 'Special', x0, y)
    c.font = `700 13px ${T.fontHead}`
    c.fillStyle = T.ink
    c.textAlign = 'right'
    c.fillText(def.name.toUpperCase(), x0 + bw, y)
    const k = p.special / 100
    c.fillStyle = T.paper3
    c.fillRect(x0, y + 8, bw, 22)
    c.fillStyle = ready ? (Math.floor(time * 4) % 2 ? T.ember : T.special) : 'rgba(240,124,28,0.55)'
    c.fillRect(x0, y + 8, bw * k, 22)
    const need = p.specialCost / 100
    if (need < 1) { c.fillStyle = T.ink; c.fillRect(x0 + bw * need - 1, y + 8, 2, 22) }
    c.strokeStyle = T.ink; c.lineWidth = 1.5; c.strokeRect(x0 + 0.5, y + 8.5, bw - 1, 21)
    if (ready) {
      c.font = `700 12px ${T.fontHead}`
      c.fillStyle = T.ink
      c.textAlign = 'center'
      c.letterSpacing = '2px'
      c.fillText('READY — PRESS X', x0 + bw / 2, y + 24)
      c.letterSpacing = '0px'
    }
    y += 52
  }

  // loadout
  label(c, 'Loadout', x0, y)
  c.fillStyle = T.line
  c.fillRect(x0, y + 6, bw, 1)
  y += 26
  const L = p.loadout
  const row = (slot: string, id: string | null, lvl: number) => {
    label(c, slot, x0, y, T.muted, 9)
    if (!id) { c.font = `500 12px ${T.fontHead}`; c.fillStyle = T.line; c.textAlign = 'left'; c.fillText('— empty —', x0 + 62, y); y += 22; return }
    const d = ITEM[id]
    c.font = `600 13px ${T.fontHead}`
    c.fillStyle = T.ink
    c.textAlign = 'left'
    c.fillText(d.name, x0 + 62, y)
    if (d.maxLevel > 1) pips(c, x0 + bw - d.maxLevel * 9, y - 8, lvl, d.maxLevel)
    y += 22
  }
  row('Front', L.front.id, L.front.level)
  row('Rear', L.rear?.id ?? null, L.rear?.level ?? 0)
  row('Pod L', L.podL?.id ?? null, L.podL?.level ?? 0)
  row('Pod R', L.podR?.id ?? null, L.podR?.level ?? 0)
  row('Reactor', L.reactor, 1)
  row('Shield', L.shield, 1)

  // controls
  const cy = SCREEN_H - 58
  c.fillStyle = T.line
  c.fillRect(x0, cy - 18, bw, 1)
  label(c, 'Move  arrows / WASD     Fire  space / Z', x0, cy, T.muted, 9)
  label(c, 'Special  X     Precision  shift     Pause  esc', x0, cy + 16, T.muted, 9)

  // ───── right panel ─────
  const rx = RX + 40
  const rw = SCREEN_W - rx - 36
  label(c, 'Score', rx, 50)
  mono(c, w.score.toLocaleString('en-US'), rx + rw, 52, 24, T.ink, 'right', 700)
  const mult = w.chainMult()
  label(c, 'Chain', rx, 88)
  mono(c, `${w.chain}`, rx + 70, 90, 16, T.ink, 'left', 700)
  mono(c, `×${mult.toFixed(1)}`, rx + rw, 90, 16, mult > 1 ? T.ember : T.muted, 'right', 700)
  c.fillStyle = T.paper3
  c.fillRect(rx, 98, rw, 4)
  c.fillStyle = T.ember
  c.fillRect(rx, 98, rw * clamp(w.chainTimer / 2.2, 0, 1), 4)

  label(c, 'Credits this run', rx, 138)
  mono(c, `+${w.stats.creditsEarned.toLocaleString('en-US')}`, rx + rw, 140, 18, T.credit, 'right', 700)
  label(c, 'In the bank', rx, 164, T.muted, 9)
  mono(c, h.bank.toLocaleString('en-US'), rx + rw, 165, 12, T.ink2, 'right')

  // progress
  label(c, 'Progress', rx, 206)
  c.fillStyle = T.paper3
  c.fillRect(rx, 214, rw, 6)
  c.fillStyle = T.ink
  c.fillRect(rx, 214, rw * clamp(h.progress, 0, 1), 6)
  const shipX = rx + rw * clamp(h.progress, 0, 1)
  c.fillStyle = T.ember
  c.beginPath(); c.moveTo(shipX, 208); c.lineTo(shipX + 5, 217); c.lineTo(shipX - 5, 217); c.closePath(); c.fill()

  // comms log
  let ly = 262
  label(c, 'Comms', rx, ly)
  c.fillStyle = T.line
  c.fillRect(rx, ly + 6, rw, 1)
  ly += 28
  const lines = h.radio.slice(-5)
  for (let i = 0; i < lines.length; i++) {
    const r = lines[i]
    const age = time - r.t
    const fresh = age < 0.6
    const a = i === lines.length - 1 ? 1 : 0.55
    c.globalAlpha = a
    const col = r.tone === 'enemy' ? T.bad : r.tone === 'odd' ? T.core : T.ember
    c.fillStyle = col
    c.fillRect(rx, ly - 9, 3, 12)
    label(c, r.who, rx + 10, ly, col, 10)
    ly += 16
    const shown = fresh ? r.text.slice(0, Math.floor((age / 0.6) * r.text.length)) : r.text
    ly = wrap(c, shown, rx + 10, ly, rw - 10, 15, `500 13px ${T.fontHead}`, T.ink)
    ly += 10
    c.globalAlpha = 1
    if (ly > SCREEN_H - 90) break
  }

  if (h.secretToast && time - h.secretToast.t < 4) {
    const k = time - h.secretToast.t
    c.globalAlpha = k > 3.4 ? (4 - k) / 0.6 : 1
    c.fillStyle = T.core
    c.fillRect(rx, SCREEN_H - 92, rw, 44)
    label(c, 'Secret found', rx + 12, SCREEN_H - 74, '#fff', 10)
    c.font = `600 13px ${T.fontHead}`
    c.fillStyle = '#fff'
    c.textAlign = 'left'
    c.fillText(h.secretToast.text, rx + 12, SCREEN_H - 56)
    c.globalAlpha = 1
  }
  if (h.showFps) mono(c, `${h.fps.toFixed(0)} fps · ${w.bullets.count}b ${w.shots.count}s ${w.enemies.length}e ${w.parts.count}p`, rx, SCREEN_H - 20, 10, T.muted)

}

/** Overlays inside the playfield, drawn after the world. */
export function drawHudOverlays(c: CanvasRenderingContext2D, w: World, h: HudState) {
  const p = w.player
  const time = w.time
  c.save()
  c.translate(FIELD_X, 0)
  drawBossBar(c, w)
  if (h.banner) drawBanner(c, h.banner, time)
  if (h.specialHint > 0 && p.specialId && p.special >= p.specialCost) {
    c.globalAlpha = Math.min(1, h.specialHint)
    c.font = `700 14px ${T.fontHead}`
    c.textAlign = 'center'
    c.fillStyle = 'rgba(28,26,34,0.75)'
    c.fillRect(PW / 2 - 130, PH - 46, 260, 26)
    c.fillStyle = '#fff'
    c.letterSpacing = '2px'
    c.fillText('SPECIAL READY — PRESS X', PW / 2, PH - 28)
    c.letterSpacing = '0px'
    c.globalAlpha = 1
  }
  c.restore()
}

function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number, font: string, color: string) {
  c.font = font
  c.fillStyle = color
  c.textAlign = 'left'
  const words = text.split(' ')
  let line = ''
  for (const wd of words) {
    const test = line ? `${line} ${wd}` : wd
    if (c.measureText(test).width > maxW && line) { c.fillText(line, x, y); y += lh; line = wd }
    else line = test
  }
  if (line) { c.fillText(line, x, y); y += lh }
  return y
}

let bossGhost = 1
function drawBossBar(c: CanvasRenderingContext2D, w: World) {
  if (!w.boss || w.boss.dead) { bossGhost = 1; return }
  let hp = 0, max = 0
  for (const e of w.bossParts) { max += e.maxHp; if (!e.dead) hp += Math.max(0, e.hp) }
  const k = max > 0 ? hp / max : 0
  bossGhost = Math.max(k, bossGhost - w.frameDt * 0.25)
  const x = 20, y = 14, bw = PW - 40
  c.fillStyle = 'rgba(244,240,230,0.92)'
  c.fillRect(x - 6, y - 6, bw + 12, 32)
  c.strokeStyle = T.ink
  c.lineWidth = 1.5
  c.strokeRect(x - 5.5, y - 5.5, bw + 11, 31)
  c.font = `700 11px ${T.fontHead}`
  c.fillStyle = T.ink
  c.textAlign = 'left'
  c.letterSpacing = '2px'
  c.fillText(w.bossName.toUpperCase(), x, y + 7)
  c.letterSpacing = '0px'
  c.fillStyle = T.paper3
  c.fillRect(x, y + 12, bw, 8)
  c.fillStyle = 'rgba(224,70,59,0.35)'
  c.fillRect(x, y + 12, bw * bossGhost, 8)
  c.fillStyle = T.bad
  c.fillRect(x, y + 12, bw * k, 8)
}

function drawBanner(c: CanvasRenderingContext2D, b: { text: string; sub?: string; t: number }, time: number) {
  const age = time - b.t
  const dur = 3.2
  if (age > dur || !b.text) return
  const a = age < 0.25 ? age / 0.25 : age > dur - 0.5 ? (dur - age) / 0.5 : 1
  const y = PH * 0.36
  c.globalAlpha = a
  c.fillStyle = 'rgba(244,240,230,0.9)'
  const hgt = b.sub ? 74 : 52
  const wid = PW * Math.min(1, age * 4)
  c.fillRect(PW / 2 - wid / 2, y - hgt / 2, wid, hgt)
  c.fillStyle = T.ember
  c.fillRect(PW / 2 - wid / 2, y - hgt / 2, wid, 3)
  c.fillStyle = T.ink
  c.fillRect(PW / 2 - wid / 2, y + hgt / 2 - 3, wid, 3)
  c.textAlign = 'center'
  c.font = `700 26px ${T.fontHead}`
  c.letterSpacing = '6px'
  c.fillText(b.text.toUpperCase(), PW / 2, y + (b.sub ? -2 : 9))
  c.letterSpacing = '0px'
  if (b.sub) {
    c.font = `500 13px ${T.fontHead}`
    c.fillStyle = T.ink2
    c.fillText(b.sub, PW / 2, y + 24)
  }
  c.globalAlpha = 1
}
