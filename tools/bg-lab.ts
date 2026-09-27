/**
 * Background lab: all biomes side by side (50%), phase buttons, per-biome frame
 * cost, and every ground prop at 1×.
 * Query: ?only=<biome> (single biome at 1×) · ?bullets=1 (mock bullets for readability) · ?props=0
 */
import { BIOMES, createBackground, type Background, type BiomeId } from '../src/render/backgrounds'
import { PROP_NAMES, registerProps } from '../src/render/props'
import { getSprite } from '../src/render/sprites'
import { PW, PH } from '../src/game/consts'

const PHASES: Record<BiomeId, string[]> = {
  cinder: ['day', 'dusk'],
  glasswater: ['calm', 'storm'],
  rime: ['clear', 'blizzard'],
  shoals: ['belt', 'rift'],
  halo: ['exterior', 'interior'],
  graveyard: ['still', 'awaken'],
  heart: ['surface', 'core', 'collapse'],
  garden: ['calm', 'glitch'],
}

const q = new URLSearchParams(location.search)
const only = q.get('only') as BiomeId | null
const bullets = q.get('bullets') === '1'
const scroll = Number(q.get('scroll') ?? 60)
if (only) document.body.classList.add('only')

interface Slot { id: BiomeId; bg: Background; ctx: CanvasRenderingContext2D; ms: HTMLElement; acc: number; n: number; create: number; peak: number }
const slots: Slot[] = []
const root = document.getElementById('biomes')!
for (const id of only ? [only] : BIOMES) {
  const cell = document.createElement('div')
  cell.className = 'cell'
  const bar = document.createElement('div')
  bar.className = 'bar'
  const label = document.createElement('b')
  label.textContent = id
  bar.append(label)
  const cv = document.createElement('canvas')
  cv.width = PW
  cv.height = PH
  const ms = document.createElement('span')
  ms.className = 'ms'
  const t0 = performance.now()
  const bg = createBackground(id, 1)
  const create = performance.now() - t0
  for (const p of PHASES[id]) {
    const b = document.createElement('button')
    b.textContent = p
    b.dataset.phase = `${id}:${p}`
    b.onclick = () => bg.setPhase(p)
    bar.append(b)
  }
  cell.append(bar, cv, ms)
  root.append(cell)
  slots.push({ id, bg, ctx: cv.getContext('2d')!, ms, acc: 0, n: 0, create, peak: 0 })
}

function mockBullets(ctx: CanvasRenderingContext2D, t: number) {
  for (let i = 0; i < 26; i++) {
    const x = (i * 97 + Math.sin(t + i) * 40) % PW, y = (i * 53 + t * 120) % PH
    ctx.fillStyle = '#ff2e88'
    ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#ffd0e6'
    ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill()
  }
  for (let i = 0; i < 10; i++) {
    const x = 240 + (i % 2) * 80, y = (PH - ((t * 500 + i * 70) % PH))
    ctx.fillStyle = '#ffc93d'
    ctx.fillRect(x - 2, y - 8, 4, 16)
  }
  ctx.fillStyle = '#f1e8d6'
  ctx.beginPath(); ctx.moveTo(280, 600); ctx.lineTo(300, 650); ctx.lineTo(260, 650); ctx.fill()
}

const stats: Record<string, { avg: number; create: number; warmPeak: number }> = {}
;(window as unknown as { __stats: typeof stats }).__stats = stats
let last = performance.now()
let t = 0
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  t += dt
  for (const s of slots) {
    const t0 = performance.now()
    s.bg.update(dt, scroll)
    s.bg.drawBase(s.ctx)
    s.bg.drawOver(s.ctx)
    const el = performance.now() - t0
    if (bullets) mockBullets(s.ctx, t)
    // steady state only: variant tiles finish baking in the first seconds
    if (t < 4) { s.acc = 0; s.n = 0; s.peak = Math.max(s.peak, el) } else { s.acc += el; s.n++ }
    if (s.n > 0 && s.n % 30 === 0) {
      stats[s.id] = { avg: s.acc / s.n, create: s.create, warmPeak: s.peak }
      s.ms.textContent = `${(s.acc / s.n).toFixed(2)} ms/frame · create ${s.create.toFixed(0)} ms · warm-up peak ${s.peak.toFixed(1)} ms`
    }
  }
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

if (q.get('props') !== '0') {
  registerProps()
  const pr = document.getElementById('props')!
  for (const name of PROP_NAMES) {
    const sp = getSprite(name)
    const d = document.createElement('div')
    d.className = 'prop'
    const cv = document.createElement('canvas')
    cv.width = sp.w
    cv.height = sp.h
    cv.getContext('2d')!.drawImage(sp.img, 0, 0, sp.w, sp.h)
    const l = document.createElement('span')
    l.textContent = `${name} ${sp.w}×${sp.h}`
    d.append(cv, l)
    pr.append(d)
  }
}
