import { World } from '../game/world'
import { DIFFICULTIES, type Loadout } from '../game/campaign'
import { createBackground, type Background, type BiomeId } from '../render/backgrounds'
import { drawWorld } from '../render/renderer'
import { autopilot } from '../game/autopilot'
import { FIELD_X, PW, PH, SCREEN_H } from '../game/consts'
import { F } from '../game/level'
import { GroundMover } from '../game/movers'
import { pick, rand } from '../core/math'
import { T } from './theme'

const SHOWCASE: Loadout[] = [
  { front: { id: 'pulse', level: 6 }, rear: { id: 'flank', level: 3 }, podL: { id: 'wasp', level: 2 }, podR: { id: 'wasp', level: 2 }, reactor: 'r3', shield: 's2', hull: 'h3', special: 'nova' },
  { front: { id: 'arc', level: 6 }, rear: { id: 'burner', level: 3 }, podL: { id: 'aegis', level: 2 }, podR: { id: 'aegis', level: 2 }, reactor: 'r4', shield: 's3', hull: 'h3', special: 'swarm' },
  { front: { id: 'hornet', level: 7 }, rear: { id: 'mines', level: 3 }, podL: { id: 'viper', level: 2 }, podR: { id: 'lantern', level: 2 }, reactor: 'r4', shield: 's2', hull: 'h4', special: 'nova' },
  { front: { id: 'sunline', level: 6 }, rear: { id: 'stinger', level: 4 }, podL: { id: 'mirror', level: 2 }, podR: { id: 'spark', level: 2 }, reactor: 'r5', shield: 's4', hull: 'h4', special: 'singularity' },
  { front: { id: 'helix', level: 8 }, rear: { id: 'flank', level: 5 }, podL: { id: 'mirror', level: 3 }, podR: { id: 'mirror', level: 3 }, reactor: 'r5', shield: 's4', hull: 'h5', special: 'overclock' },
]
const BIOMES: BiomeId[] = ['cinder', 'glasswater', 'rime', 'shoals', 'halo', 'graveyard', 'heart']

/** Title-screen demo: an autopiloted Kestrel with a showcase build over a random biome. */
export class Attract {
  w!: World
  bg!: Background
  t = 0
  spawnT = 1
  private idx = Math.floor(Math.random() * SHOWCASE.length)

  constructor() { this.reset() }

  reset() {
    this.idx = (this.idx + 1) % SHOWCASE.length
    this.w = new World(SHOWCASE[this.idx], DIFFICULTIES.courier, true)
    this.w.god = true
    this.w.player.ai = autopilot(1)
    this.w.player.special = 0
    this.bg = createBackground(pick(BIOMES), Math.floor(Math.random() * 1000))
    this.t = 0
  }

  update(dt: number) {
    this.t += dt
    this.w.update(dt)
    this.bg.update(dt, this.w.scroll)
    this.spawnT -= dt
    if (this.spawnT <= 0) {
      this.spawnT = rand(1.4, 2.6)
      const w = this.w
      const r = Math.random()
      const spawn = (id: string, f: ReturnType<typeof F.vee>, n: number) => { for (let i = 0; i < n; i++) { const s = f(i, n); w.spawn(id, s.x, s.y, { mover: s.mover }) } }
      if (r < 0.25) spawn('dart', F.vee(rand(150, PW - 150), 160), 5)
      else if (r < 0.45) spawn('wasp', F.hover(140, 4), 3)
      else if (r < 0.6) spawn('weaver', F.sine(rand(150, PW - 150), 90, 2, 120), 1)
      else if (r < 0.72) w.spawn('turret', rand(60, PW - 60), -40, { mover: new GroundMover() })
      else if (r < 0.82) spawn('bomber', F.column(rand(120, PW - 120), 60), 1)
      else if (r < 0.9) w.spawn('fuel', rand(60, PW - 60), -40, { mover: new GroundMover() })
      else spawn('gunship', F.hoverAt(PW / 2, 150, 6), 1)
    }
    if (this.t > 40) this.reset()
  }

  draw(c: CanvasRenderingContext2D) {
    c.save()
    c.translate(FIELD_X, 0)
    c.beginPath(); c.rect(0, 0, PW, PH); c.clip()
    this.bg.drawBase(c)
    drawWorld(c, this.w, this.bg)
    c.restore()
    c.fillStyle = T.ink
    c.fillRect(FIELD_X - 6, 0, 6, SCREEN_H)
    c.fillRect(FIELD_X + PW, 0, 6, SCREEN_H)
    c.fillStyle = T.ember
    c.fillRect(FIELD_X - 10, 0, 2, SCREEN_H)
    c.fillRect(FIELD_X + PW + 8, 0, 2, SCREEN_H)
  }
}
