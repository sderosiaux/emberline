/**
 * Procedural sprite registry. Every sprite is vector-painted once into an
 * offscreen canvas at SUPERSAMPLE resolution, plus a white "hit flash" variant
 * and a soft shadow variant for air units. Drawing is then just drawImage.
 */
export const SUPERSAMPLE = 2

export type Painter = (ctx: CanvasRenderingContext2D, w: number, h: number) => void

export interface Sprite {
  key: string
  w: number
  h: number
  img: HTMLCanvasElement
  flash: HTMLCanvasElement
  shadow: HTMLCanvasElement
}

interface Def { w: number; h: number; paint: Painter; shadow: boolean }

const defs = new Map<string, Def>()
const cache = new Map<string, Sprite>()

export function defineSprite(key: string, w: number, h: number, paint: Painter, shadow = false) {
  defs.set(key, { w, h, paint, shadow })
  cache.delete(key)
}

export function hasSprite(key: string) { return defs.has(key) }
export function spriteKeys() { return [...defs.keys()] }

export function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

export function getSprite(key: string): Sprite {
  const hit = cache.get(key)
  if (hit) return hit
  let d = defs.get(key)
  if (!d) {
    // Missing art must never crash a run: draw a visible placeholder and report once.
    console.warn(`[sprites] missing sprite "${key}"`)
    d = { w: 24, h: 24, shadow: false, paint: (c) => { c.fillStyle = '#ff00ff'; c.fillRect(2, 2, 20, 20); c.fillStyle = '#000'; c.fillRect(6, 6, 12, 12) } }
    defs.set(key, d)
  }
  const s = SUPERSAMPLE
  const img = makeCanvas(d.w * s, d.h * s)
  const ctx = img.getContext('2d')!
  ctx.scale(s, s)
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  d.paint(ctx, d.w, d.h)
  const flash = tinted(img, '#ffffff', 0.85)
  const shadow = d.shadow ? blurredShadow(img) : img
  const sp: Sprite = { key, w: d.w, h: d.h, img, flash, shadow }
  cache.set(key, sp)
  return sp
}

/** Warm the cache so the first frame of a mission doesn't hitch. */
export function prewarmAll() {
  for (const k of defs.keys()) getSprite(k)
}

function tinted(src: HTMLCanvasElement, color: string, alpha: number) {
  const c = makeCanvas(src.width, src.height)
  const x = c.getContext('2d')!
  x.drawImage(src, 0, 0)
  x.globalCompositeOperation = 'source-atop'
  x.globalAlpha = alpha
  x.fillStyle = color
  x.fillRect(0, 0, c.width, c.height)
  return c
}

function blurredShadow(src: HTMLCanvasElement) {
  const pad = 8 * SUPERSAMPLE
  const c = makeCanvas(src.width + pad * 2, src.height + pad * 2)
  const x = c.getContext('2d')!
  x.filter = `blur(${3 * SUPERSAMPLE}px)`
  x.drawImage(src, pad, pad)
  x.filter = 'none'
  x.globalCompositeOperation = 'source-in'
  x.fillStyle = 'rgba(10,8,20,0.55)'
  x.fillRect(0, 0, c.width, c.height)
  return c
}

/** Radial glow textures keyed by css color — used by particles and bullets. */
const glowCache = new Map<string, HTMLCanvasElement>()
export function glowTexture(color: string, size = 64, hardness = 0.25) {
  const k = `${color}|${size}|${hardness}`
  const hit = glowCache.get(k)
  if (hit) return hit
  const c = makeCanvas(size, size)
  const x = c.getContext('2d')!
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, color)
  g.addColorStop(hardness, color)
  g.addColorStop(1, 'rgba(0,0,0,0)')
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  glowCache.set(k, c)
  return c
}

/** Draw a sprite centered at (x,y) with optional rotation (radians, 0 = pointing up) and scale. */
export function drawSprite(
  ctx: CanvasRenderingContext2D, sp: Sprite, x: number, y: number,
  rot = 0, scale = 1, alpha = 1, flash = 0,
) {
  const w = sp.w * scale, h = sp.h * scale
  if (alpha !== 1) ctx.globalAlpha = alpha
  if (rot === 0) {
    ctx.drawImage(sp.img, x - w / 2, y - h / 2, w, h)
    if (flash > 0) {
      ctx.globalAlpha = alpha * Math.min(1, flash)
      ctx.drawImage(sp.flash, x - w / 2, y - h / 2, w, h)
    }
  } else {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.drawImage(sp.img, -w / 2, -h / 2, w, h)
    if (flash > 0) {
      ctx.globalAlpha = alpha * Math.min(1, flash)
      ctx.drawImage(sp.flash, -w / 2, -h / 2, w, h)
    }
    ctx.restore()
  }
  ctx.globalAlpha = 1
}

export function drawShadow(ctx: CanvasRenderingContext2D, sp: Sprite, x: number, y: number, rot = 0, scale = 1) {
  const pad = 8 * scale
  const w = sp.w * scale * 0.9 + pad * 2, h = sp.h * scale * 0.9 + pad * 2
  if (rot === 0) ctx.drawImage(sp.shadow, x - w / 2, y - h / 2, w, h)
  else {
    ctx.save()
    ctx.translate(x, y)
    ctx.rotate(rot)
    ctx.drawImage(sp.shadow, -w / 2, -h / 2, w, h)
    ctx.restore()
  }
}
