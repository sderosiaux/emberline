import { defineSprite } from './sprites'

/** Lead-owned effect sprites that need to read on both bright and dark biomes. */
export function registerFxArt() {
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
