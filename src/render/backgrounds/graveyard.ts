/** M6 — derelict fleet: teal-grey void, drifting wreck hulls, debris, dying emergency lights. */
import { rng } from '../../core/math'
import {
  Fader, H, Scroller, TILE_H, TileSet, W, blit, cachedSeeded, canvas, cloudSprite, lut, softDot, starTile, wrapX,
  type Background, type Job, type Pt,
} from './kit'
import { wreck, type HullPal } from './motifs'
import { Parallax, nebulaTile } from './space'

const NEB = lut([[0, '#10201d'], [0.4, '#1a322e'], [0.7, '#284843'], [1, '#3c625a']])
const FAR_PAL: HullPal = { light: '#71877f', mid: '#44564f', dark: '#1e2927', rim: '#b8dccd', line: 'rgba(5,12,12,0.5)', window: 'rgba(160,210,190,0.4)' }

function scrapSprite(seed: number) {
  const r = rng(seed)
  const w = r.int(14, 36), h = r.int(8, 22)
  const [c, x] = canvas(w + 4, h + 4)
  x.beginPath()
  x.moveTo(2 + r.range(0, 4), 2)
  x.lineTo(w + 2, 2 + r.range(0, 4))
  x.lineTo(w + 2 - r.range(0, 6), h + 2)
  x.lineTo(2, h + 2 - r.range(0, 5))
  x.closePath()
  const g = x.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, '#6c8078')
  g.addColorStop(1, '#27332f')
  x.fillStyle = g
  x.fill()
  x.strokeStyle = 'rgba(140,180,165,0.35)'
  x.lineWidth = 1
  x.stroke()
  x.strokeStyle = 'rgba(0,0,0,0.4)'
  x.beginPath(); x.moveTo(4, h / 2 + 2); x.lineTo(w, h / 2 + 2); x.stroke()
  return c
}

/** Ground-speed junk field: sparse and muted so it never reads as a threat. */
function* debrisTile(seed: number, v: number, scraps: HTMLCanvasElement[]): Job<HTMLCanvasElement> {
  const [c, x] = canvas(W, TILE_H)
  const r = rng(seed * 17 + v * 5)
  x.globalAlpha = 0.6
  for (let i = 0; i < 26; i++) {
    const img = r.pick(scraps)
    x.save()
    x.translate(r.range(0, W), r.range(30, TILE_H - 30))
    x.rotate(r.range(0, 6.28))
    x.drawImage(img, -img.width / 2, -img.height / 2)
    x.restore()
  }
  yield
  // cables and girder stubs
  x.strokeStyle = 'rgba(60,80,76,0.8)'
  x.lineWidth = 1.2
  for (let i = 0; i < 6; i++) {
    const px = r.range(20, W - 20), py = r.range(60, TILE_H - 60)
    x.beginPath(); x.moveTo(px, py)
    x.bezierCurveTo(px + r.range(-40, 40), py + r.range(-40, 40), px + r.range(-40, 40), py + r.range(-40, 40), px + r.range(-50, 50), py + r.range(-50, 50))
    x.stroke()
  }
  for (let i = 0; i < 200; i++) {
    x.fillStyle = `rgba(90,120,110,${r.range(0.2, 0.5)})`
    x.fillRect(r.range(0, W), r.range(2, TILE_H - 2), r.range(1, 2.5), r.range(1, 2.5))
  }
  return c
}

interface Hulk { img: HTMLCanvasElement; x: number; y: number; rot: number; vr: number; s: number; f: number; anchors: Pt[]; ph: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number }

export function createGraveyard(seed = 1): Background {
  const tex = cachedSeeded(`grave|tex|${seed}`, () => {
    const hulks = [0, 1, 2].map(i => {
      const w = [190, 130, 100][i], h = [540, 360, 260][i]
      const [c, x] = canvas(w, h)
      const anchors = wreck(x, w, h, seed * 19 + i, FAR_PAL)
      return { img: c, anchors }
    })
    return {
      hulks,
      scraps: Array.from({ length: 8 }, (_, i) => scrapSprite(seed * 23 + i)),
      neb: nebulaTile(seed * 11 + 5, { base: NEB, gas: [88, 140, 124], lane: [8, 16, 15], gasAmt: 0.5, laneAmt: 0.45 }),
      stars: starTile(W, 1000, seed + 60, 260, ['#b8d8cf', '#e0efe9'], 0.4, 1.1, 0.2, 0.6),
      haze: [0, 1].map(i => cloudSprite(420, 320, 210 + i, '#7fb0a2', 0.5, 2.5)),
      red: softDot(40, '#ff4a3a', 0.15),
      spark: softDot(8, '#d8fff4', 0.4),
    }
  })
  const tiles = cachedSeeded(`grave|${seed}`, () => new TileSet(3, v => debrisTile(seed, v, tex.scraps)))
  const ground = new Scroller(tiles, seed)
  const neb = new Parallax(tex.neb, 0.06, 2)
  const stars = new Parallax(tex.stars, 0.12, 3)
  const r = rng(seed * 5 + 2)
  const hulks: Hulk[] = [0, 1, 2, 3].map(i => {
    const h = tex.hulks[i % 3]
    const f = [0.16, 0.22, 0.3, 0.4][i]
    return { img: h.img, anchors: h.anchors, x: r.range(60, W - 60), y: -i * 360 + 260, rot: r.range(-0.6, 0.6), vr: r.range(-0.02, 0.02), s: 0.7 + f, f, ph: r.range(0, 6) }
  })
  const mid = Array.from({ length: 10 }, () => ({ img: r.pick(tex.scraps), x: r.range(0, W), y: r.range(0, H), rot: r.range(0, 6), vr: r.range(-0.6, 0.6), f: r.range(0.55, 0.8) }))
  const hazes = [0, 1, 2].map(i => ({ img: tex.haze[i % 2], x: r.range(0, W), y: i * 300 }))
  const sparks: Spark[] = []
  const awaken = new Fader(0, 2.5)
  let t = 0, nextSpark = 1

  const anchorPos = (k: Hulk, a: Pt) => {
    const lx = (a[0] - k.img.width / 2) * k.s, ly = (a[1] - k.img.height / 2) * k.s
    const c = Math.cos(k.rot), s = Math.sin(k.rot)
    return [k.x + lx * c - ly * s, k.y + lx * s + ly * c] as const
  }

  return {
    update(dt, scroll) {
      t += dt
      ground.update(dt, scroll)
      neb.update(dt, scroll)
      stars.update(dt, scroll)
      awaken.step(dt)
      for (const k of hulks) {
        k.y += (scroll * k.f + 4) * dt
        k.rot += k.vr * dt
        if (k.y - k.img.height * k.s * 0.6 > H) { k.y = -k.img.height * k.s * 0.6 - r.range(0, 300); k.x = r.range(40, W - 40); k.rot = r.range(-0.5, 0.5) }
      }
      for (const m of mid) {
        m.y += (scroll * m.f + 8) * dt
        m.rot += m.vr * dt
        if (m.y > H + 30) { m.y = -30; m.x = r.range(0, W) }
      }
      for (const h of hazes) {
        h.y += (scroll * 0.5 + 3) * dt
        h.x += 3 * dt
        if (h.y - 200 > H) { h.y -= H + 500; h.x = r.range(0, W) }
        h.x = wrapX(h.x, 220)
      }
      nextSpark -= dt * (1 + awaken.e * 2)
      if (nextSpark <= 0) {
        const k = r.pick(hulks)
        const [sx, sy] = anchorPos(k, k.anchors[r.int(0, 1)])
        if (sy > 0 && sy < H) for (let i = 0; i < r.int(5, 10); i++) {
          const a = r.range(0, 6.28), v = r.range(20, 70)
          sparks.push({ x: sx, y: sy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: r.range(0.3, 0.8) })
        }
        nextSpark = r.range(0.8, 2.5)
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        p.x += p.vx * dt
        p.y += (p.vy + scroll * 0.3) * dt
        p.life -= dt
        if (p.life <= 0) sparks.splice(i, 1)
      }
    },
    drawBase(ctx) {
      ctx.save()
      const aw = awaken.e
      neb.draw(ctx)
      // cold light from a distant star: rims the wrecks, lifts the void off black
      ctx.globalCompositeOperation = 'screen'
      const sun = ctx.createRadialGradient(W * 0.1, -H * 0.1, 0, W * 0.1, -H * 0.1, H * 1.1)
      sun.addColorStop(0, 'rgba(170,230,210,0.28)')
      sun.addColorStop(1, 'rgba(170,230,210,0)')
      ctx.fillStyle = sun
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'source-over'
      stars.draw(ctx)
      for (const h of hazes) blit(ctx, h.img, h.x, h.y, 0, 1.4, 0.26)
      for (const k of hulks) {
        blit(ctx, k.img, k.x, k.y, k.rot, k.s, 0.85 + k.f * 0.4)
        // emergency beacons: slow, uneven; awakened → brighter, faster, more of them
        ctx.globalCompositeOperation = 'lighter'
        k.anchors.forEach((a, i) => {
          if (i > 2 && aw < 0.3) return
          const rate = 1.3 + aw * 2.5
          const on = Math.max(0, Math.sin(t * rate + k.ph + i * 1.7)) ** 3
          const [x, y] = anchorPos(k, a)
          blit(ctx, tex.red, x, y, 0, 0.5 + aw * 0.6 + k.f * 0.3, (0.25 + aw * 0.55) * on)
        })
        ctx.globalCompositeOperation = 'source-over'
      }
      for (const m of mid) blit(ctx, m.img, m.x, m.y, m.rot, 0.9, 0.6)
      ctx.globalCompositeOperation = 'lighter'
      for (const p of sparks) blit(ctx, tex.spark, p.x, p.y, 0, 0.8, Math.min(1, p.life * 2) * 0.8)
      ctx.globalCompositeOperation = 'source-over'
      if (aw > 0) {
        // red alert wash, breathing
        const b = 0.6 + 0.4 * Math.sin(t * 2.4)
        ctx.globalCompositeOperation = 'soft-light'
        ctx.fillStyle = `rgba(255,60,50,${aw * 0.35 * b})`
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
      }
      ground.draw(ctx)
      ctx.restore()
    },
    drawOver(ctx) {
      ctx.save()
      ctx.globalCompositeOperation = 'screen'
      for (const h of hazes) blit(ctx, h.img, W - h.x, (h.y * 1.6) % (H + 400) - 200, 0, 1.8, 0.06)
      ctx.restore()
    },
    setPhase(name) {
      if (name === 'awaken') awaken.t = 1
      else if (name === 'still' || name === 'calm') awaken.t = 0
    },
  }
}
