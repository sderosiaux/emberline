import { defineSprite } from './sprites'

/** Lead-owned effect sprites that need to read on both bright and dark biomes. */
function tile(c: CanvasRenderingContext2D, w: number, h: number, fill: string, edge: string, letter: string, size: number) {
  c.fillStyle = edge
  c.beginPath(); c.roundRect(0.5, 0.5, w - 1, h - 1, 3); c.fill()
  const g = c.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, fill); g.addColorStop(1, edge)
  c.fillStyle = g
  c.beginPath(); c.roundRect(2, 2, w - 4, h - 4, 2); c.fill()
  c.fillStyle = '#ffffff'
  c.font = `800 ${size}px system-ui, sans-serif`
  c.textAlign = 'center'; c.textBaseline = 'middle'
  c.fillText(letter, w / 2, h / 2 + 0.5)
}

export function registerFxArt() {
  // Arcade items: red P = power, blue point tiles — a readable shape language distinct from bullets and credits
  defineSprite('pk_power', 13, 13, (c, w, h) => tile(c, w, h, '#ff4d4d', '#8a1010', 'P', 9))
  defineSprite('pk_power_big', 20, 20, (c, w, h) => tile(c, w, h, '#ff4d4d', '#8a1010', 'P', 14))
  defineSprite('pk_point', 13, 13, (c, w, h) => tile(c, w, h, '#4da6ff', '#0f3f8a', '点', 8))
  // Helix strand segment: saturated green capsule with a dark rim so it reads on sand and snow.
  defineSprite('shot_helix_seg', 10, 22, (c, w, h) => {
    const cx = w / 2
    c.fillStyle = '#0d3b12'
    c.beginPath(); c.ellipse(cx, h / 2, 4.2, 10.2, 0, 0, Math.PI * 2); c.fill()
    const g = c.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, '#eaffd8'); g.addColorStop(0.35, '#7dff5a'); g.addColorStop(1, '#1f9e2a')
    c.fillStyle = g
    c.beginPath(); c.ellipse(cx, h / 2, 3.1, 9, 0, 0, Math.PI * 2); c.fill()
    c.fillStyle = '#ffffff'
    c.beginPath(); c.ellipse(cx, h / 2 - 2, 1.2, 5, 0, 0, Math.PI * 2); c.fill()
  })
}
