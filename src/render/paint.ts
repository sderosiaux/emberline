/** Shared painting vocabulary so every sprite speaks the same visual language. */
export const PAL = {
  ink: '#15131c',
  // Kestrel / allied: warm ivory ceramic, ember orange, teal glass
  ivory: '#f1e8d6', ivoryMid: '#cdbfa3', ivoryDark: '#8f8069',
  ember: '#ff7a1a', emberHot: '#ffd27a', emberDeep: '#c2410c',
  teal: '#40d8cf', tealDark: '#0f6c73',
  // The Choir: graphite + oxidised bronze, magenta "singing" slits
  gun: '#3b4052', gunLight: '#737c95', gunDark: '#1d202c', gunEdge: '#9aa3ba',
  bronze: '#9a7650', bronzeDark: '#5b4330', bronzeLight: '#d0a878',
  choir: '#ff2e88', choirHot: '#ffd0e6', choirDeep: '#a3155a',
  elite: '#ffcc33',
  // Shots & pickups
  shotAmber: '#ffc93d', shotCyan: '#76f2ff', shotGreen: '#9dff6a', shotViolet: '#c49bff',
  credit: '#c6ff3d', repair: '#6fd3ff', special: '#ff9a3d', core: '#b58cff',
} as const

type Ctx = CanvasRenderingContext2D

export function lin(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

export function rad(ctx: Ctx, x: number, y: number, r: number, stops: [number, string][]) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  for (const [o, c] of stops) g.addColorStop(o, c)
  return g
}

/**
 * Build a left/right symmetric closed path from the right-half outline
 * (points listed top → bottom with x ≥ 0 relative to the axis cx).
 */
export function mirrorPath(ctx: Ctx, cx: number, pts: [number, number][]) {
  ctx.beginPath()
  ctx.moveTo(cx + pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(cx + pts[i][0], pts[i][1])
  for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(cx - pts[i][0], pts[i][1])
  ctx.closePath()
}

export function poly(ctx: Ctx, pts: [number, number][]) {
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
  ctx.closePath()
}

export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, stroke = PAL.ink, lw = 1.2) {
  ctx.fillStyle = fill
  ctx.fill()
  if (lw > 0) {
    ctx.strokeStyle = stroke
    ctx.lineWidth = lw
    ctx.stroke()
  }
}

/** A glowing light (engine, sensor, slit). */
export function light(ctx: Ctx, x: number, y: number, r: number, color: string, core = '#ffffff') {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = rad(ctx, x, y, r, [[0, core], [0.25, color], [1, 'rgba(0,0,0,0)']])
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Thin panel seams to make surfaces read as manufactured. */
export function seams(ctx: Ctx, lines: [number, number, number, number][], color = 'rgba(0,0,0,0.35)', lw = 0.7) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = lw
  ctx.beginPath()
  for (const [a, b, c, d] of lines) { ctx.moveTo(a, b); ctx.lineTo(c, d) }
  ctx.stroke()
  ctx.restore()
}

/** Glowing slit: the Choir's signature "singing" vents. */
export function slit(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w = 2, color: string = PAL.choir) {
  ctx.save()
  ctx.lineCap = 'round'
  ctx.strokeStyle = PAL.ink
  ctx.lineWidth = w + 2
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color
  ctx.lineWidth = w
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'
  ctx.lineWidth = Math.max(0.6, w * 0.35)
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
  ctx.restore()
}

/** Standard enemy metal fill: lit from the upper-left. */
export function choirMetal(ctx: Ctx, w: number, h: number) {
  return lin(ctx, 0, 0, w, h, [[0, PAL.gunLight], [0.45, PAL.gun], [1, PAL.gunDark]])
}
export function bronzeMetal(ctx: Ctx, w: number, h: number) {
  return lin(ctx, 0, 0, w, h, [[0, PAL.bronzeLight], [0.5, PAL.bronze], [1, PAL.bronzeDark]])
}
export function ivoryMetal(ctx: Ctx, w: number, h: number) {
  return lin(ctx, 0, 0, w, h, [[0, '#ffffff'], [0.35, PAL.ivory], [1, PAL.ivoryDark]])
}
