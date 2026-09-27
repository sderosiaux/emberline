import { defineSprite } from './sprites'
import { PAL, lin, rad, mirrorPath, fillStroke, light, slit, seams, circle, roundRect, poly, choirMetal, bronzeMetal } from './paint'

type Ctx = CanvasRenderingContext2D

function tread(c: Ctx, x: number, y: number, w: number, h: number) {
  roundRect(c, x, y, w, h, 6)
  fillStroke(c, lin(c, x, y, x + w, y, [[0, '#2a2a30'], [0.5, '#4a4a52'], [1, '#1c1c22']]))
  c.strokeStyle = 'rgba(0,0,0,0.55)'
  c.lineWidth = 1.4
  for (let ty = y + 5; ty < y + h - 3; ty += 7) { c.beginPath(); c.moveTo(x + 2, ty); c.lineTo(x + w - 2, ty); c.stroke() }
  c.strokeStyle = 'rgba(255,255,255,0.12)'
  c.lineWidth = 0.8
  for (let ty = y + 6; ty < y + h - 3; ty += 7) { c.beginPath(); c.moveTo(x + 2, ty); c.lineTo(x + w - 2, ty); c.stroke() }
}

function rivets(c: Ctx, pts: [number, number][]) {
  for (const [x, y] of pts) {
    circle(c, x, y, 1.3)
    c.fillStyle = PAL.bronzeLight
    c.fill()
    c.strokeStyle = PAL.ink
    c.lineWidth = 0.6
    c.stroke()
  }
}

export function registerBossArt() {
  // ───────── SMELTER ─────────
  defineSprite('smelter_body', 230, 180, (c, w, h) => {
    const cx = w / 2
    tread(c, 6, 20, 34, 140)
    tread(c, w - 40, 20, 34, 140)
    // chassis
    mirrorPath(c, cx, [[40, 14], [78, 24], [86, 60], [84, 130], [70, 162], [30, 172]])
    fillStroke(c, bronzeMetal(c, w, h), PAL.ink, 1.6)
    // upper deck plate
    mirrorPath(c, cx, [[30, 26], [62, 34], [68, 70], [64, 120], [44, 146], [0, 150]])
    fillStroke(c, choirMetal(c, w, h), PAL.ink, 1.2)
    seams(c, [[cx - 60, 80, cx + 60, 80], [cx - 56, 112, cx + 56, 112], [cx - 40, 34, cx - 50, 140], [cx + 40, 34, cx + 50, 140]])
    // furnace ring
    circle(c, cx, h / 2 - 4, 40)
    fillStroke(c, lin(c, cx - 40, 40, cx + 40, 130, [[0, '#8d8f9c'], [0.5, '#3b3e4c'], [1, '#17181f']]), PAL.ink, 2)
    circle(c, cx, h / 2 - 4, 33)
    c.fillStyle = '#1a1318'
    c.fill()
    // smokestacks
    for (const sx of [-50, 50]) {
      circle(c, cx + sx, 150, 11)
      fillStroke(c, rad(c, cx + sx - 3, 147, 12, [[0, '#6b6f7c'], [1, '#22242c']]), PAL.ink, 1.3)
      circle(c, cx + sx, 150, 6)
      c.fillStyle = '#0d0c10'
      c.fill()
    }
    // front grille & slits
    for (let i = -3; i <= 3; i++) slit(c, cx + i * 9, 150, cx + i * 9, 162, 2)
    slit(c, cx - 64, 60, cx - 64, 100, 2)
    slit(c, cx + 64, 60, cx + 64, 100, 2)
    rivets(c, [[cx - 70, 30], [cx + 70, 30], [cx - 74, 150], [cx + 74, 150], [cx - 30, 20], [cx + 30, 20]])
    // hazard band
    c.save()
    mirrorPath(c, cx, [[34, 16], [52, 20], [52, 26], [0, 26], [0, 16]])
    c.clip()
    for (let x = cx - 60; x < cx + 60; x += 10) { c.fillStyle = PAL.ember; poly(c, [[x, 14], [x + 5, 14], [x - 2, 28], [x - 7, 28]]); c.fill() }
    c.restore()
  })
  defineSprite('smelter_hatch', 70, 70, (c, w, h) => {
    const cx = w / 2, cy = h / 2
    for (let i = 0; i < 6; i++) {
      c.save()
      c.translate(cx, cy)
      c.rotate((i / 6) * Math.PI * 2)
      poly(c, [[0, 0], [30, -6], [30, 12], [0, 2]])
      fillStroke(c, lin(c, 0, -6, 30, 12, [[0, '#9aa0b0'], [1, '#3b3e4c']]), PAL.ink, 1)
      c.restore()
    }
    circle(c, cx, cy, 7)
    fillStroke(c, PAL.bronze)
    light(c, cx, cy, 6, PAL.ember)
  })
  defineSprite('smelter_arm', 64, 96, (c, w) => {
    const cx = w / 2
    // shoulder
    circle(c, cx, 22, 20)
    fillStroke(c, bronzeMetal(c, w, 50), PAL.ink, 1.4)
    // barrel housing
    mirrorPath(c, cx, [[14, 20], [16, 60], [11, 88], [6, 94]])
    fillStroke(c, choirMetal(c, w, 96), PAL.ink, 1.4)
    for (let y = 40; y < 84; y += 10) seams(c, [[cx - 14, y, cx + 14, y]], 'rgba(0,0,0,0.45)', 1)
    // nozzle
    roundRect(c, cx - 8, 84, 16, 10, 3)
    fillStroke(c, '#1a1a20')
    light(c, cx, 92, 9, PAL.ember, '#fff4c0')
    slit(c, cx - 8, 30, cx + 8, 30, 2)
    circle(c, cx, 22, 7)
    fillStroke(c, '#2b2d38')
  })
  defineSprite('smelter_pod', 44, 44, (c, w, h) => {
    roundRect(c, 3, 3, w - 6, h - 6, 6)
    fillStroke(c, choirMetal(c, w, h), PAL.ink, 1.4)
    for (const [x, y] of [[14, 14], [30, 14], [14, 30], [30, 30]] as const) {
      circle(c, x, y, 6)
      c.fillStyle = '#121218'
      c.fill()
      circle(c, x, y, 3)
      c.fillStyle = PAL.choirDeep
      c.fill()
    }
    slit(c, 8, h - 8, w - 8, h - 8, 1.6)
  })
}
