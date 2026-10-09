import type { World } from '../game/world'
import type { MissionDef } from '../game/level'
import { ITEM } from '../data/items'
import { T } from '../ui/theme'
import { PW, PH, HUD_X, HUD_W, SCREEN_H } from '../game/consts'
import { clamp } from '../core/math'
import { ARCADE_WEAPONS } from '../game/arcade'
import { PERK } from '../game/perks'
import type { WarnTone } from '../game/bosses/raid'

export interface RadioLine { who: string; text: string; tone: 'ally' | 'enemy' | 'odd'; t: number }
export interface HudState {
  mission: MissionDef
  radio: RadioLine[]
  /** `low`: drawn under the action, for pull-backs where the middle of the screen is the point. */
  banner: { text: string; sub?: string; low?: boolean; t: number } | null
  progress: number
  bank: number
  fps: number
  showFps: boolean
  secretToast: { text: string; t: number } | null
  specialHint: number
  /** Raid warning: big centred alert for boss mechanics (Deadly Boss Mods style). */
  warn: { text: string; tone: WarnTone; t: number } | null
}

/**
 * In-flight HUD: one dark glass column on the right (Tyrian's layout), so the
 * playfield gets everything else. Dark on purpose: it sits next to the game
 * world, and a bright panel would pull the eye away from the bullets.
 */
const H = {
  bg0: '#101019', bg1: '#191826', line: 'rgba(255,255,255,0.08)', text: '#f2ede2', dim: '#8d889c', faint: '#57536a',
}

let columnCache: HTMLCanvasElement | null = null
function column(): HTMLCanvasElement {
  if (columnCache) return columnCache
  const c = document.createElement('canvas')
  c.width = HUD_W * 2; c.height = SCREEN_H * 2
  const x = c.getContext('2d')!
  x.scale(2, 2)
  const g = x.createLinearGradient(0, 0, HUD_W, SCREEN_H)
  g.addColorStop(0, H.bg1); g.addColorStop(1, H.bg0)
  x.fillStyle = g
  x.fillRect(0, 0, HUD_W, SCREEN_H)
  // fine diagonal hatching: reads as a machined panel, not a flat box
  x.strokeStyle = 'rgba(255,255,255,0.025)'
  x.lineWidth = 1
  for (let i = -SCREEN_H; i < HUD_W; i += 7) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + SCREEN_H, SCREEN_H); x.stroke() }
  // seam against the playfield
  const e = x.createLinearGradient(0, 0, 14, 0)
  e.addColorStop(0, 'rgba(0,0,0,0.55)'); e.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = e
  x.fillRect(0, 0, 14, SCREEN_H)
  x.fillStyle = T.ember
  x.fillRect(0, 0, 2, SCREEN_H)
  columnCache = c
  return c
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string = H.dim, size = 9.5, align: CanvasTextAlign = 'left') {
  c.font = `600 ${size}px ${T.fontHead}`
  c.fillStyle = color
  c.textAlign = align
  c.letterSpacing = '1.6px'
  c.fillText(text.toUpperCase(), x, y)
  c.letterSpacing = '0px'
}

function mono(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 13, color: string = H.text, align: CanvasTextAlign = 'left', weight = 600) {
  c.font = `${weight} ${size}px ${T.fontMono}`
  c.fillStyle = color
  c.textAlign = align
  c.fillText(text, x, y)
}

function bar(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, k: number, color: string, ghost = 0, flash = false) {
  c.fillStyle = 'rgba(255,255,255,0.06)'
  c.fillRect(x, y, w, h)
  if (ghost > k) { c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x, y, w * clamp(ghost, 0, 1), h) }
  c.fillStyle = flash ? '#ffffff' : color
  c.fillRect(x, y, w * clamp(k, 0, 1), h)
  c.fillStyle = 'rgba(255,255,255,0.25)'
  c.fillRect(x, y, w * clamp(k, 0, 1), 1)
  c.fillStyle = 'rgba(0,0,0,0.35)'
  for (let i = 1; i < 10; i++) c.fillRect(Math.round(x + (w * i) / 10), y, 1, h)
}

function pips(c: CanvasRenderingContext2D, x: number, y: number, level: number, max: number) {
  for (let i = 0; i < max; i++) {
    c.fillStyle = i < level ? T.ember : 'rgba(255,255,255,0.1)'
    c.fillRect(x + i * 6, y, 4, 4)
  }
}

const ghost = { hull: 1, shield: 1 }

export function drawHud(c: CanvasRenderingContext2D, w: World, h: HudState) {
  c.drawImage(column(), HUD_X, 0, HUD_W, SCREEN_H)
  if (w.arcade) { drawArcadeHud(c, w, h); return }
  const p = w.player
  const time = w.time
  const x0 = HUD_X + 20
  const bw = HUD_W - 40
  const xr = x0 + bw

  // mission tag
  label(c, `${h.mission.num} · ${h.mission.name}`, x0, 30, H.dim, 9)
  c.fillStyle = h.progress >= 0.999 ? T.ember : 'rgba(255,255,255,0.1)'
  c.fillRect(x0, 38, bw, 2)
  c.fillStyle = T.ember
  c.fillRect(x0, 38, bw * clamp(h.progress, 0, 1), 2)

  // score + chain: the arcade heartbeat
  mono(c, w.score.toLocaleString('en-US'), xr, 76, 26, H.text, 'right', 700)
  const mult = w.chainMult()
  const hot = w.chain > 0
  label(c, 'Chain', x0, 98, hot ? T.ember : H.faint)
  mono(c, `${w.chain}`, x0 + 48, 99, 12, hot ? H.text : H.faint, 'left', 700)
  mono(c, `×${mult.toFixed(1)}`, xr, 100, 15, mult > 1 ? T.ember : H.faint, 'right', 700)
  c.fillStyle = 'rgba(255,255,255,0.07)'
  c.fillRect(x0, 106, bw, 3)
  c.fillStyle = T.ember
  c.fillRect(x0, 106, bw * clamp(w.chainTimer / 2.2, 0, 1), 3)

  // vitals
  let y = 140
  const sk = p.maxShield > 0 ? p.shield / p.maxShield : 0
  const hk = p.hull / p.maxHull
  ghost.shield = Math.max(sk, ghost.shield - w.frameDt * 0.6)
  ghost.hull = Math.max(hk, ghost.hull - w.frameDt * 0.4)
  label(c, 'Shield', x0, y); mono(c, `${Math.ceil(p.shield)}`, xr, y + 1, 11, H.text, 'right')
  bar(c, x0, y + 6, bw, 9, sk, T.shield, ghost.shield)
  y += 34
  const lowHull = hk < 0.25 && Math.floor(time * 4) % 2 === 0
  label(c, 'Hull', x0, y, lowHull ? T.bad : H.dim); mono(c, `${Math.ceil(p.hull)}`, xr, y + 1, 11, lowHull ? T.bad : H.text, 'right')
  bar(c, x0, y + 6, bw, 9, hk, T.hull, ghost.hull, lowHull)
  y += 34
  const starving = p.starving > 0
  label(c, starving ? 'Energy — low' : 'Energy', x0, y, starving ? T.bad : H.dim)
  mono(c, `${Math.floor(p.energy)}`, xr, y + 1, 11, H.text, 'right')
  bar(c, x0, y + 6, bw, 5, p.energy / p.maxEnergy, p.overclock > 0 ? T.shield : T.energy, 0, starving && Math.floor(time * 10) % 2 === 0)
  y += 30

  if (p.specialId) {
    const def = ITEM[p.specialId]
    const ready = p.special >= p.specialCost
    label(c, def.name, x0, y, ready ? T.ember : H.dim)
    if (ready) label(c, 'X', xr, y, T.ember, 9.5, 'right')
    const k = p.special / 100
    c.fillStyle = 'rgba(255,255,255,0.06)'
    c.fillRect(x0, y + 6, bw, 12)
    c.fillStyle = ready ? (Math.floor(time * 5) % 2 ? T.ember : '#ffb070') : 'rgba(240,124,28,0.6)'
    c.fillRect(x0, y + 6, bw * k, 12)
    const need = p.specialCost / 100
    if (need < 1) { c.fillStyle = H.text; c.fillRect(x0 + bw * need - 1, y + 6, 2, 12) }
    y += 36
  }

  // credits
  label(c, 'Credits', x0, y)
  mono(c, `+${w.stats.creditsEarned.toLocaleString('en-US')}`, xr, y + 1, 15, '#b6f23a', 'right', 700)
  y += 16
  label(c, 'Bank', x0, y, H.faint, 8.5)
  mono(c, h.bank.toLocaleString('en-US'), xr, y + 1, 10, H.faint, 'right')
  y += 26

  // arsenal
  c.fillStyle = H.line
  c.fillRect(x0, y - 10, bw, 1)
  const L = p.loadout
  const row = (id: string | null, lvl: number, tag: string) => {
    if (!id) return
    const d = ITEM[id]
    label(c, tag, x0, y, H.faint, 8)
    c.font = `600 11.5px ${T.fontHead}`
    c.fillStyle = H.text
    c.textAlign = 'left'
    c.fillText(d.name, x0 + 34, y)
    if (d.maxLevel > 1) pips(c, xr - d.maxLevel * 6 + 2, y - 6, lvl, d.maxLevel)
    y += 17
  }
  row(L.front.id, L.front.level, 'FWD')
  row(L.rear?.id ?? null, L.rear?.level ?? 0, 'AFT')
  row(L.podL?.id ?? null, L.podL?.level ?? 0, 'POD')
  row(L.podR?.id ?? null, L.podR?.level ?? 0, 'POD')
  y += 8

  // comms: newest at the bottom, older lines fade out
  const bottom = SCREEN_H - 34
  const lines = h.radio.slice(-4)
  const blocks: { r: RadioLine; lines: string[] }[] = []
  c.font = `500 12px ${T.fontHead}`
  for (const r of lines) {
    const age = time - r.t
    const shown = age < 0.6 ? r.text.slice(0, Math.floor((age / 0.6) * r.text.length)) : r.text
    blocks.push({ r, lines: wrapLines(c, shown, bw - 8) })
  }
  let by = bottom
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    const hgt = 14 + b.lines.length * 14
    if (by - hgt < y + 10) break
    by -= hgt
    const newest = i === blocks.length - 1
    const age = time - b.r.t
    c.globalAlpha = newest ? 1 : Math.max(0.25, 0.6 - (blocks.length - 1 - i) * 0.15)
    const col = b.r.tone === 'enemy' ? '#ff5a7a' : b.r.tone === 'odd' ? '#b99bff' : T.ember
    c.fillStyle = col
    c.fillRect(x0, by + 2, 2, hgt - 8)
    label(c, b.r.who, x0 + 8, by + 10, col, 8.5)
    c.font = `500 12px ${T.fontHead}`
    c.fillStyle = newest && age < 8 ? H.text : '#b9b4c6'
    c.textAlign = 'left'
    b.lines.forEach((ln, k) => c.fillText(ln, x0 + 8, by + 24 + k * 14))
    by -= 6
    c.globalAlpha = 1
  }

  label(c, 'Esc pause', x0, SCREEN_H - 14, H.faint, 8)
  if (h.showFps) mono(c, `${h.fps.toFixed(0)} fps · ${w.bullets.count}b ${w.enemies.length}e`, xr, SCREEN_H - 14, 9, H.faint, 'right')
}

function wrapLines(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []
  let line = ''
  for (const wd of text.split(' ')) {
    const test = line ? `${line} ${wd}` : wd
    if (c.measureText(test).width > maxW && line) { out.push(line); line = wd } else line = test
  }
  if (line) out.push(line)
  return out
}

/** Overlays inside the playfield (world coordinates), drawn after the world. */
export function drawHudOverlays(c: CanvasRenderingContext2D, w: World, h: HudState) {
  const p = w.player
  const time = w.time
  // low hull: red pulse at the field edges, the only warning that doesn't need eye travel
  const hk = p.hull / p.maxHull
  if (p.alive && hk < 0.3) {
    const a = (0.3 - hk) / 0.3 * (0.35 + 0.2 * Math.sin(time * 8))
    const g = c.createRadialGradient(PW / 2, PH / 2, PH * 0.35, PW / 2, PH / 2, PW * 0.62)
    g.addColorStop(0, 'rgba(224,40,40,0)')
    g.addColorStop(1, `rgba(224,40,40,${a})`)
    c.fillStyle = g
    c.fillRect(0, 0, PW, PH)
  }
  drawBossBar(c, w)
  const sp = w.arcade?.spell
  if (sp) {
    const left = Math.max(0, 50 - sp.t)
    c.textAlign = 'right'
    c.font = `600 10px ${T.fontHead}`
    c.fillStyle = sp.failed ? 'rgba(255,255,255,0.45)' : '#ffd0ea'
    c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 3
    c.fillText(sp.name, PW - 14, 52)
    c.font = `700 12px ${T.fontMono}`
    c.fillStyle = left < 10 ? '#ff6a6a' : '#ffffff'
    c.fillText(sp.failed ? 'FAILED' : left.toFixed(1), PW - 14, 68)
    c.shadowBlur = 0
  }
  if (h.banner) drawBanner(c, h.banner, time)
  if (h.warn) drawWarn(c, h.warn, time)
  if (h.secretToast && time - h.secretToast.t < 4) {
    const k = time - h.secretToast.t
    c.globalAlpha = k > 3.4 ? (4 - k) / 0.6 : Math.min(1, k * 4)
    c.font = `600 12px ${T.fontHead}`
    const tw = c.measureText(h.secretToast.text).width + 40
    c.fillStyle = 'rgba(30,18,60,0.82)'
    c.fillRect(PW / 2 - tw / 2, PH - 64, tw, 36)
    c.fillStyle = T.core
    c.fillRect(PW / 2 - tw / 2, PH - 64, tw, 2)
    c.textAlign = 'center'
    label(c, 'Secret', PW / 2, PH - 49, '#cdb8ff', 8.5, 'center')
    c.font = `600 12px ${T.fontHead}`
    c.fillStyle = '#ffffff'
    c.textAlign = 'center'
    c.fillText(h.secretToast.text, PW / 2, PH - 34)
    c.globalAlpha = 1
  }
  if (h.specialHint > 0 && !w.arcade && p.specialId && p.special >= p.specialCost) {
    c.globalAlpha = Math.min(1, h.specialHint)
    c.font = `700 12px ${T.fontHead}`
    c.textAlign = 'center'
    c.fillStyle = 'rgba(16,16,25,0.75)'
    c.fillRect(PW / 2 - 110, PH - 34, 220, 22)
    c.fillStyle = '#fff'
    c.letterSpacing = '2px'
    c.fillText('SPECIAL READY — PRESS X', PW / 2, PH - 19)
    c.letterSpacing = '0px'
    c.globalAlpha = 1
  }
}

let bossGhost = 1
function drawBossBar(c: CanvasRenderingContext2D, w: World) {
  if (!w.boss || w.boss.dead) { bossGhost = 1; return }
  let hp = 0, max = 0
  for (const e of w.bossParts) { max += e.maxHp; if (!e.dead) hp += Math.max(0, e.hp) }
  const k = max > 0 ? hp / max : 0
  bossGhost = Math.max(k, bossGhost - w.frameDt * 0.25)
  const bw = PW * 0.56, x = (PW - bw) / 2, y = 12
  c.font = `700 9px ${T.fontHead}`
  c.fillStyle = 'rgba(255,255,255,0.9)'
  c.textAlign = 'center'
  c.letterSpacing = '2.5px'
  c.shadowColor = 'rgba(0,0,0,0.8)'
  c.shadowBlur = 3
  c.fillText(w.bossName.toUpperCase(), PW / 2, y + 7)
  c.shadowBlur = 0
  c.letterSpacing = '0px'
  c.fillStyle = 'rgba(10,10,16,0.65)'
  c.fillRect(x - 2, y + 11, bw + 4, 8)
  c.fillStyle = 'rgba(255,255,255,0.3)'
  c.fillRect(x, y + 13, bw * bossGhost, 4)
  c.fillStyle = w.raid.vulnT > 0 ? '#ffd23b' : '#ff3b4a'
  c.fillRect(x, y + 13, bw * k, 4)
  const r = w.raid
  // enrage timer, right of the name
  if (r.enrageAt > 0) {
    const left = r.enrageAt - w.time
    c.font = `700 9px ${T.fontMono}`
    c.textAlign = 'right'
    c.fillStyle = r.enraged ? '#ff4040' : left < 20 ? '#ff9a6a' : 'rgba(255,255,255,0.6)'
    const m = Math.floor(Math.max(0, left) / 60), s = Math.floor(Math.max(0, left) % 60)
    c.fillText(r.enraged ? 'ENRAGED' : `ENRAGE ${m}:${String(s).padStart(2, '0')}`, x + bw, y + 7)
  }
  if (r.vulnT > 0) {
    c.font = `700 9px ${T.fontHead}`
    c.textAlign = 'left'
    c.fillStyle = '#ffd23b'
    c.fillText(`VULNERABLE ${r.vulnT.toFixed(0)}s`, x, y + 7)
  }
  // cast bar
  const cast = r.cast
  if (cast) {
    const cy = y + 26, cw = bw * 0.7, cx = (PW - cw) / 2
    const kk = Math.min(1, cast.t / cast.time)
    const kick = cast.kick
    c.fillStyle = 'rgba(10,10,16,0.75)'
    c.fillRect(cx - 2, cy - 2, cw + 4, kick ? 24 : 16)
    c.fillStyle = kick ? '#3fb8ff' : '#ff8a2a'
    c.fillRect(cx, cy, cw * kk, 12)
    c.font = `700 9px ${T.fontHead}`
    c.textAlign = 'center'
    c.letterSpacing = '1.5px'
    c.fillStyle = '#ffffff'
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 3
    c.fillText(cast.name.toUpperCase(), PW / 2, cy + 9)
    c.shadowBlur = 0
    c.letterSpacing = '0px'
    if (kick) {
      // interrupt meter: damage landed on the weak point vs what it takes
      const kp = Math.min(1, kick.dealt / kick.need)
      c.fillStyle = 'rgba(255,255,255,0.15)'
      c.fillRect(cx, cy + 15, cw, 5)
      c.fillStyle = '#7ff0ff'
      c.fillRect(cx, cy + 15, cw * kp, 5)
      c.font = `700 8px ${T.fontHead}`
      c.textAlign = 'right'
      c.fillStyle = '#bff6ff'
      c.fillText('INTERRUPT', cx - 6, cy + 20)
    }
  }
}

/** Big centred alert, short and loud: the one line a boss mechanic needs you to read. */
function drawWarn(c: CanvasRenderingContext2D, wn: { text: string; tone: WarnTone; t: number }, time: number) {
  const age = time - wn.t
  const dur = 2.2
  if (age > dur) return
  const a = age > dur - 0.4 ? (dur - age) / 0.4 : 1
  const pop = age < 0.12 ? 1 + (1 - age / 0.12) * 0.35 : 1
  const col = wn.tone === 'good' ? '#7dffb0' : wn.tone === 'kick' ? '#7ff0ff' : '#ff5a3c'
  c.save()
  c.globalAlpha = a
  c.translate(PW / 2, PH * 0.46)
  c.scale(pop, pop)
  c.font = `800 22px ${T.fontHead}`
  c.textAlign = 'center'
  c.letterSpacing = '3px'
  c.lineWidth = 5
  c.strokeStyle = 'rgba(0,0,0,0.75)'
  c.strokeText(wn.text.toUpperCase(), 0, 0)
  c.fillStyle = col
  c.fillText(wn.text.toUpperCase(), 0, 0)
  c.restore()
  c.letterSpacing = '0px'
}

function drawBanner(c: CanvasRenderingContext2D, b: { text: string; sub?: string; low?: boolean; t: number }, time: number) {
  const age = time - b.t
  const dur = 2.6
  if (age > dur || !b.text) return
  const a = age < 0.2 ? age / 0.2 : age > dur - 0.4 ? (dur - age) / 0.4 : 1
  const y = PH * (b.low ? 0.7 : 0.34)
  const slide = age < 0.25 ? (1 - age / 0.25) ** 3 * 60 : 0
  c.globalAlpha = a
  const hgt = b.sub ? 58 : 42
  c.fillStyle = 'rgba(12,12,20,0.6)'
  c.fillRect(0, y - hgt / 2, PW, hgt)
  c.fillStyle = T.ember
  c.fillRect(0, y - hgt / 2, PW * Math.min(1, age * 3), 2)
  c.fillRect(PW * (1 - Math.min(1, age * 3)), y + hgt / 2 - 2, PW * Math.min(1, age * 3), 2)
  c.textAlign = 'center'
  c.fillStyle = '#ffffff'
  c.font = `700 24px ${T.fontHead}`
  c.letterSpacing = '8px'
  c.fillText(b.text.toUpperCase(), PW / 2 + slide, y + (b.sub ? -1 : 9))
  c.letterSpacing = '0px'
  if (b.sub) {
    c.font = `600 11px ${T.fontHead}`
    c.fillStyle = '#ffb070'
    c.letterSpacing = '3px'
    c.fillText(b.sub.toUpperCase(), PW / 2 - slide, y + 19)
    c.letterSpacing = '0px'
  }
  c.globalAlpha = 1
}

/** Empty HUD column (title screen): same panel, no flight data. */
export function drawHudIdle(c: CanvasRenderingContext2D) {
  c.drawImage(column(), HUD_X, 0, HUD_W, SCREEN_H)
}

/** Arcade column: score-attack readout (lives, bombs, power, graze, Rift energy) instead of shields and credits. */
function drawArcadeHud(c: CanvasRenderingContext2D, w: World, h: HudState) {
  const a = w.arcade!
  const run = a.run
  const x0 = HUD_X + 20, bw = HUD_W - 40, xr = x0 + bw
  label(c, `Arcade · stage ${run.stage + 1} · ${h.mission.name}`, x0, 30, H.dim, 9)
  c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x0, 38, bw, 2)
  c.fillStyle = T.ember; c.fillRect(x0, 38, bw * clamp(h.progress, 0, 1), 2)
  label(c, 'Hi-score', x0, 62, H.faint, 8.5)
  mono(c, Math.max(h.bank, w.score).toLocaleString('en-US'), xr, 63, 11, H.dim, 'right')
  label(c, 'Score', x0, 84)
  mono(c, w.score.toLocaleString('en-US'), xr, 98, 24, a.inRift ? '#ff6a6a' : H.text, 'right', 700)
  if (a.inRift) label(c, 'Rift ×3', x0, 98, '#ff6a6a', 9)
  let y = 130
  label(c, 'Lives', x0, y)
  for (let i = 0; i < Math.min(run.lives, 8); i++) { c.fillStyle = T.ember; c.beginPath(); c.moveTo(xr - i * 16, y - 9); c.lineTo(xr - i * 16 + 6, y + 2); c.lineTo(xr - i * 16 - 6, y + 2); c.closePath(); c.fill() }
  y += 26
  label(c, 'Bombs', x0, y)
  for (let i = 0; i < Math.min(run.bombs, 8); i++) { c.fillStyle = '#76d6ff'; c.beginPath(); c.arc(xr - 4 - i * 16, y - 4, 5, 0, Math.PI * 2); c.fill() }
  y += 30
  label(c, 'Power', x0, y); mono(c, run.power >= 4 ? 'MAX' : run.power.toFixed(2), xr, y + 1, 12, '#ff6a5a', 'right', 700)
  bar(c, x0, y + 6, bw, 6, run.power / 4, '#ff5a4a')
  y += 30
  const wp = ARCADE_WEAPONS.find((x) => x.id === run.weapon)!
  label(c, 'Weapon', x0, y); mono(c, `${wp.letter} · ${wp.name}`, xr, y + 1, 12, wp.color, 'right', 700)
  y += 24
  label(c, 'Graze', x0, y); mono(c, `${run.graze}`, xr, y + 1, 12, H.text, 'right', 700)
  y += 20
  label(c, 'Point item', x0, y, H.faint, 8.5); mono(c, a.pointValue.toLocaleString('en-US'), xr, y + 1, 10, '#6fb8ff', 'right')
  y += 30
  // Rift: three segments; one full segment opens the way
  label(c, a.inRift ? 'Rift — inside' : a.rift >= 34 ? 'Rift — ready [C]' : 'Rift', x0, y, a.inRift ? '#ff6a6a' : a.rift >= 34 ? T.ember : H.dim)
  const seg = (bw - 8) / 3
  for (let i = 0; i < 3; i++) {
    const k = clamp(a.rift / 100 * 3 - i, 0, 1)
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fillRect(x0 + i * (seg + 4), y + 7, seg, 9)
    c.fillStyle = a.inRift ? '#ff4a5a' : k >= 1 ? '#c49bff' : '#7a62b0'
    c.fillRect(x0 + i * (seg + 4), y + 7, seg * k, 9)
  }
  y += 40
  c.fillStyle = H.line; c.fillRect(x0, y - 12, bw, 1)
  label(c, 'Spells', x0, y); mono(c, `${run.captured} / ${run.spells}`, xr, y + 1, 11, H.text, 'right')
  y += 28
  label(c, `Level ${run.level}`, x0, y, '#ffd27a')
  bar(c, x0, y + 6, bw, 5, run.xp / run.xpNext, '#ffd27a')
  y += 26
  for (const [id, r] of Object.entries(run.mods)) {
    if (y > SCREEN_H - 60) break
    c.font = `600 11px ${T.fontHead}`
    c.fillStyle = H.text
    c.textAlign = 'left'
    c.fillText(PERK[id].name, x0, y)
    pips(c, xr - PERK[id].max * 6 + 2, y - 6, r, PERK[id].max)
    y += 16
  }
  // controls reminder: the mode adds two verbs
  label(c, 'Shift focus · X bomb · C rift', x0, SCREEN_H - 34, H.faint, 8)
  label(c, 'Esc pause', x0, SCREEN_H - 14, H.faint, 8)
}
