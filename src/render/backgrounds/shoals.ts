/** M4 — asteroid mining belt: dusty indigo nebula, parallax stars, slow distant rocks. */
import { rng } from '../../core/math'
import {
  Fader, H, Scroller, TILE_H, TileSet, W, blit, cachedSeeded, canvas, cloudSprite, hex, lut, softDot, starTile,
  wrapX, type Background, type Job,
} from './kit'
import { rockSprite } from './motifs'
import { Parallax, nebulaTile } from './space'

const NEB = lut([[0, '#0d0b22'], [0.4, '#17143a'], [0.65, '#251e52'], [1, '#3a2c6a']])
const ROCK_FAR = lut([[0, '#0f0d22'], [0.4, '#2a2646'], [0.8, '#4d4668'], [1, '#6e6688']])
const ROCK_NEAR = lut([[0, '#110f1f'], [0.4, '#2e2a40'], [0.8, '#57506c'], [1, '#7a7390']])

/** Ground debris: sparse muted gravel and clumps, transparent between them. */
function* debrisTile(seed: number, v: number, rocks: HTMLCanvasElement[]): Job<HTMLCanvasElement> {
  const [c, x] = canvas(W, TILE_H)
  const r = rng(seed * 31 + v)
  for (let i = 0; i < 260; i++) {
    const px = r.range(0, W), py = r.range(4, TILE_H - 4)
    x.fillStyle = `rgba(${r.int(70, 110)},${r.int(64, 96)},${r.int(100, 130)},${r.range(0.3, 0.6)})`
    x.beginPath(); x.arc(px, py, r.range(0.6, 1.8), 0, Math.PI * 2); x.fill()
  }
  yield
  for (let i = 0; i < 14; i++) {
    const img = r.pick(rocks)
    const s = r.range(0.2, 0.42)
    const m = (img.width * s) / 2 + 4
    x.save()
    x.translate(r.range(0, W), r.range(m, TILE_H - m))
    x.rotate(r.range(0, 6.28))
    x.globalAlpha = 0.55
    x.drawImage(img, (-img.width * s) / 2, (-img.height * s) / 2, img.width * s, img.height * s)
    x.restore()
  }
  return c
}

/** An almond-shaped tear in space, violet glow, star-flecked interior. */
function riftSprite() {
  const w = 300, h = 520
  const [c, x] = canvas(w, h)
  const r = rng(404)
  x.save()
  x.translate(w / 2, h / 2)
  x.scale(w / h, 1)
  const g = x.createRadialGradient(0, 0, 0, 0, 0, h / 2)
  g.addColorStop(0, 'rgba(160,120,255,0.4)')
  g.addColorStop(0.45, 'rgba(110,70,210,0.14)')
  g.addColorStop(1, 'rgba(60,30,140,0)')
  x.fillStyle = g
  x.fillRect(-h / 2, -h / 2, h, h)
  x.restore()
  const edge = (side: number) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= 24; i++) {
      const t = i / 24
      const bulge = Math.sin(t * Math.PI) ** 0.8 * 46
      pts.push([w / 2 + side * (bulge + r.range(-5, 5) * Math.sin(t * Math.PI)) + Math.sin(t * 5) * 10, 60 + t * (h - 120)])
    }
    return pts
  }
  const L = edge(-1), R = edge(1)
  const tear = () => {
    x.beginPath()
    L.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b)))
    for (let i = R.length - 1; i >= 0; i--) x.lineTo(R[i][0], R[i][1])
    x.closePath()
  }
  const inner = x.createLinearGradient(w / 2 - 50, 0, w / 2 + 50, 0)
  inner.addColorStop(0, '#6a4ad0')
  inner.addColorStop(0.5, '#1a0c3a')
  inner.addColorStop(1, '#6a4ad0')
  x.fillStyle = inner
  tear()
  x.fill()
  x.save()
  tear()
  x.clip()
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(220,200,255,${r.range(0.3, 0.9)})`
    x.fillRect(r.range(w / 2 - 50, w / 2 + 50), r.range(60, h - 60), 1.2, 1.2)
  }
  x.restore()
  x.globalCompositeOperation = 'lighter'
  for (const [lw, col] of [[14, 'rgba(140,100,255,0.22)'], [5, 'rgba(190,160,255,0.5)'], [1.6, 'rgba(235,225,255,0.85)']] as const) {
    x.lineWidth = lw
    x.strokeStyle = col
    tear()
    x.stroke()
  }
  return c
}

interface Rock { img: HTMLCanvasElement; x: number; y: number; rot: number; vr: number; s: number; f: number; a: number; light: number; ph: number }

export function createShoals(seed = 1): Background {
  const tex = cachedSeeded(`shoals|tex|${seed}`, () => {
    const far = [0, 1, 2, 3, 4].map(i => rockSprite(150 - i * 14, seed * 50 + i, ROCK_FAR, 7, hex('#6f6aa0')))
    const near = [0, 1, 2, 3, 4, 5].map(i => rockSprite(40 + i * 8, seed * 90 + i, ROCK_NEAR, 3))
    return {
      far, near,
      neb: nebulaTile(seed * 7 + 1, { base: NEB, gas: [92, 70, 150], lane: [8, 6, 20], gasAmt: 0.45, laneAmt: 0.7 }),
      stars0: starTile(W, 1024, seed + 1, 420, ['#c9c4ff', '#ffffff', '#a8c0ff'], 0.4, 1.1, 0.25, 0.7),
      stars1: starTile(W, 900, seed + 2, 90, ['#d8d2ff', '#ffffff', '#ffe6c8'], 0.7, 1.6, 0.35, 0.8, 0.2),
      dust: [0, 1, 2].map(i => cloudSprite(420, 300, 150 + i, '#8f7fc8', 0.5, 2.5)),
      blink: softDot(16, '#9fffd8', 0.3),
      rift: riftSprite(),
    }
  })
  const tiles = cachedSeeded(`shoals|${seed}`, () => new TileSet(3, v => debrisTile(seed, v, tex.near)))
  const ground = new Scroller(tiles, seed)
  const neb = new Parallax(tex.neb, 0.08, 3)
  const s0 = new Parallax(tex.stars0, 0.15, 5), s1 = new Parallax(tex.stars1, 0.35, 10)
  const r = rng(seed * 3 + 9)
  const rocks: Rock[] = Array.from({ length: 9 }, (_, i) => {
    const f = i < 4 ? r.range(0.2, 0.3) : r.range(0.4, 0.6)
    return { img: r.pick(tex.far), x: r.range(0, W), y: r.range(-200, H), rot: r.range(0, 6.28), vr: r.range(-0.12, 0.12), s: f * 1.6, f, a: 0.45 + f * 0.8, light: r.chance(0.5) ? r.range(-0.3, 0.3) : NaN, ph: r.range(0, 6) }
  }).sort((a, b) => a.f - b.f)
  const dust = [0, 1, 2, 3].map(i => ({ img: tex.dust[i % 3], x: r.range(0, W), y: i * 260 - 100, f: r.range(0.6, 0.8) }))
  const rift = new Fader(0, 3)
  let t = 0

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      neb.update(dt, scroll)
      s0.update(dt, scroll)
      s1.update(dt, scroll)
      rift.step(dt)
      for (const k of rocks) {
        k.y += (scroll * k.f + 6 * k.f) * dt
        k.rot += k.vr * dt
        if (k.y - 120 > H) { k.y = -140 - r.range(0, 200); k.x = r.range(0, W); k.vr = r.range(-0.12, 0.12) }
      }
      for (const d of dust) {
        d.y += (scroll * d.f + 5) * dt
        d.x += 4 * dt
        if (d.y - 200 > H) { d.y -= H + 500; d.x = r.range(0, W) }
        d.x = wrapX(d.x, 220)
      }
    },
    drawBase(ctx) {
      ctx.save()
      neb.draw(ctx)
      const rf = rift.e
      if (rf > 0) {
        const p = 0.8 + 0.2 * Math.sin(t * 2.1)
        ctx.globalCompositeOperation = 'lighter'
        blit(ctx, tex.rift, W * 0.62, H * 0.34 + Math.sin(t * 0.3) * 10, 0.18, 1, rf * p)
        ctx.globalCompositeOperation = 'source-over'
      }
      s0.draw(ctx, 0.9)
      s1.draw(ctx)
      for (const k of rocks) {
        blit(ctx, k.img, k.x, k.y, k.rot, k.s, Math.min(1, k.a))
        if (!Number.isNaN(k.light)) {
          const on = Math.sin(t * 3 + k.ph) > 0.6 ? 1 : 0.25
          const lx = k.x + Math.cos(k.rot + k.light) * k.img.width * k.s * 0.25
          const ly = k.y + Math.sin(k.rot + k.light) * k.img.width * k.s * 0.25
          ctx.globalCompositeOperation = 'lighter'
          blit(ctx, tex.blink, lx, ly, 0, 0.6 + k.f, 0.5 * on)
          ctx.globalCompositeOperation = 'source-over'
        }
      }
      for (const d of dust) blit(ctx, d.img, d.x, d.y, 0, 1.3, 0.14)
      if (rf > 0) {
        ctx.globalCompositeOperation = 'soft-light'
        ctx.fillStyle = `rgba(150,100,255,${rf * 0.35})`
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
      }
      ground.draw(ctx)
      ctx.restore()
    },
    drawOver(ctx) {
      // close dust wisps sliding past the camera
      ctx.save()
      ctx.globalCompositeOperation = 'lighter'
      for (const d of dust) blit(ctx, d.img, W - d.x, (d.y * 1.7) % (H + 400) - 200, 0, 1.8, 0.05)
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'rift') rift.t = 1
      else if (name === 'belt' || name === 'calm') rift.t = 0
    },
  }
}
