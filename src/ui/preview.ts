import { World } from '../game/world'
import { DIFFICULTIES, type Loadout, type SlotKey } from '../game/campaign'
import { drawWorld } from '../render/renderer'
import { PW, PH } from '../game/consts'
import { registerEnemy } from '../data/enemies'
import { GroundMover } from '../game/movers'
import { ITEM } from '../data/items'
import { triggerSpecial } from '../game/specials'

registerEnemy({ id: 'dummy', hp: 999999, r: 16, sprite: 'wasp', layer: 'air', score: 0, credits: 0, charge: 0, explode: 'small', contact: 0,
  update(e) { e.hp = e.maxHp; e.x = e.s.bx + Math.sin(e.age * 0.8 + e.s.bx) * 40 } })
registerEnemy({ id: 'dummy_ground', hp: 999999, r: 15, sprite: 'turret_base', layer: 'ground', score: 0, credits: 0, charge: 0, explode: 'small',
  update(e) { e.hp = e.maxHp; if (e.y > PH + 20) e.y = -30 } })

/**
 * Hangar test range: a tiny muted world where the inspected item fires at
 * dummies, so players see what a weapon *does* before paying for it.
 */
export class WeaponPreview {
  private w: World | null = null
  private key = ''
  private ctx: CanvasRenderingContext2D
  private t = 0
  private sweep = 0
  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!
  }

  show(base: Loadout, slot: SlotKey, itemId: string, level: number) {
    const l: Loadout = structuredClone(base)
    const def = ITEM[itemId]
    const o = { id: itemId, level: Math.max(1, level) }
    if (def.slot === 'front') l.front = o
    else if (def.slot === 'rear') l.rear = o
    else if (def.slot === 'pod') { if (slot === 'podL') l.podL = o; else l.podR = o }
    else if (def.slot === 'special') l.special = itemId
    const key = JSON.stringify(l)
    if (key === this.key) return
    this.key = key
    const w = new World(l, DIFFICULTIES.gunship, true)
    w.god = true
    w.scroll = 40
    w.player.y = PH - 120
    w.player.special = 100
    const p = w.player
    this.sweep = 0
    p.ai = (pl, ww, dt) => {
      this.sweep += dt
      const tx = PW / 2 + Math.sin(this.sweep * 0.7) * 110
      if (def.slot === 'special' && pl.special >= pl.specialCost && this.sweep > 1.2) { pl.special = 0; triggerSpecial(pl, ww, itemId); ww.after(4, () => (pl.special = 100)) }
      return { mx: Math.max(-1, Math.min(1, (tx - pl.x) / 40)), my: 0, fire: true, special: false }
    }
    for (let i = 0; i < 5; i++) {
      const e = w.spawn('dummy', 120 + i * 80, 330 + (i % 2) * 60)
      e.s.bx = e.x
    }
    for (let i = 0; i < 3; i++) w.spawn('dummy_ground', 150 + i * 130, 200 + i * 230, { mover: new GroundMover() })
    // a few bullets for defensive items to chew on
    this.w = w
    this.t = 0
  }

  update(dt: number) {
    const w = this.w
    if (!w) return
    this.t += dt
    w.update(Math.min(dt, 1 / 30))
    if (Math.floor(this.t * 2) !== Math.floor((this.t - dt) * 2)) {
      for (let i = 0; i < 3; i++) w.fire(PW / 2 + (Math.random() - 0.5) * 300, 280, Math.PI / 2 + (Math.random() - 0.5) * 0.5, 150)
    }
  }

  draw() {
    const w = this.w
    const c = this.ctx
    if (!w) return
    const viewW = 400
    const s = this.canvas.width / viewW
    const viewH = this.canvas.height / s
    const cx = PW / 2
    const bottom = PH - 60
    c.setTransform(1, 0, 0, 1, 0, 0)
    c.fillStyle = '#23232d'
    c.fillRect(0, 0, this.canvas.width, this.canvas.height)
    c.setTransform(s, 0, 0, s, -(cx - viewW / 2) * s, -(bottom - viewH) * s)
    // test-range floor
    c.strokeStyle = 'rgba(255,255,255,0.06)'
    c.lineWidth = 1
    const off = (w.scrollY % 40)
    for (let y = -40 + off; y < PH; y += 40) { c.beginPath(); c.moveTo(0, y); c.lineTo(PW, y); c.stroke() }
    for (let x = 0; x < PW; x += 40) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, PH); c.stroke() }
    drawWorld(c, w, null)
    c.setTransform(1, 0, 0, 1, 0, 0)
  }

  dispose() { this.w?.player.cleanup(); this.w = null }
}
