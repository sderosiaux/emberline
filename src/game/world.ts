import { Shot, Bullet, Enemy, Pickup, Pool, PickupKind, BulletKind } from './entities'
import { Particles, P, C } from '../render/particles'
import { PW, PH } from './consts'
import { ENEMIES } from '../data/enemies'
import type { Mover } from './movers'
import { explode, hitSpark, sfxAt, sparks } from './fx'
import { Player } from './player'
import type { Difficulty, Loadout } from './campaign'
import { rand, TAU, clamp } from '../core/math'
import { audio } from '../audio/audio'

export interface MissionStats {
  kills: number
  spawned: number
  groundKills: number
  groundTotal: number
  shotsFired: number
  shotsHit: number
  damageTaken: number
  creditsEarned: number
  secrets: string[]
  secretTexts: Record<string, string>
  cores: string[]
  time: number
  maxChain: number
  bossTime: number
}

export type GameEvent =
  | { type: 'radio'; who: string; text: string; tone?: 'ally' | 'enemy' | 'odd' }
  | { type: 'banner'; text: string; sub?: string }
  | { type: 'secret'; id: string; text: string }
  | { type: 'core'; id: string }
  | { type: 'boss'; name: string }
  | { type: 'bossDown' }
  | { type: 'complete' }
  | { type: 'dead' }
  | { type: 'warp'; to: string }
  | { type: 'phase'; name: string }

export interface Decal { x: number; y: number; r: number; rot: number }
/** Tread marks left by ground vehicles, fading over time. */
export interface Track { x: number; y: number; rot: number; life: number }

/** Transient line visuals for hitscan weapons (arcs, beams, rails). */
export interface LineFx {
  pts: number[]
  life: number
  max: number
  color: string
  width: number
  glow: string
  jag: number
}

/** Enemy lasers: telegraphed line hazards. */
export interface Laser {
  x: number; y: number; ang: number; len: number; width: number
  warn: number; life: number; age: number
  owner: Enemy | null
  ox: number; oy: number
  dmg: number
  sweep: number
  active: boolean
  sounded: boolean
}

export interface Decor {
  sprite: string
  x: number; y: number
  rot: number
  scale: number
  /** Parallax factor relative to the ground scroll (1 = ground). */
  depth: number
  vx: number
  alpha: number
  above: boolean
}

type Timer = { t: number; fn: () => void }

const GRID = 80
const GCOLS = Math.ceil((PW + 240) / GRID)
const GROWS = Math.ceil((PH + 400) / GRID)

export class World {
  time = 0
  frameDt = 1 / 60
  player: Player
  enemies: Enemy[] = []
  shots = new Pool(() => new Shot(), 2500)
  bullets = new Pool(() => new Bullet(), 2500)
  pickups = new Pool(() => new Pickup(), 500)
  parts = new Particles()
  lines: LineFx[] = []
  lasers: Laser[] = []
  decals: Decal[] = []
  tracks: Track[] = []
  /** Biome light colour/strength used to tint ground units so they sit in the scene. */
  ambient: { color: string; k: number } | null = null
  decor: Decor[] = []
  events: GameEvent[] = []
  timers: Timer[] = []
  scroll = 55
  scrollY = 0
  shake = 0
  shakeX = 0
  shakeY = 0
  shakeScale = 1
  flashScreen = 0
  hitstop = 0
  score = 0
  chain = 0
  chainTimer = 0
  stats: MissionStats
  diff: Difficulty
  /** Preview worlds (shop demo) skip rewards, events and sounds. */
  preview = false
  /** Currently tracked boss root for the HUD. */
  boss: Enemy | null = null
  bossName = ''
  bossParts: Enemy[] = []
  god = false
  /** Mission tier hp multiplier for regular enemies (later missions field sturdier craft). */
  hpScale = 1
  /** Mission tier credit multiplier (later missions pay better per kill). */
  creditScale = 1
  flags = new Set<string>()
  private grid: Enemy[][] = Array.from({ length: GCOLS * GROWS }, () => [])
  private sfxBudget = 0

  constructor(loadout: Loadout, diff: Difficulty, preview = false) {
    this.diff = diff
    this.preview = preview
    this.player = new Player(this, loadout)
    this.stats = {
      kills: 0, spawned: 0, groundKills: 0, groundTotal: 0, shotsFired: 0, shotsHit: 0,
      damageTaken: 0, creditsEarned: 0, secrets: [], secretTexts: {}, cores: [], time: 0, maxChain: 0, bossTime: 0,
    }
  }

  emit(e: GameEvent) { if (!this.preview) this.events.push(e) }

  after(t: number, fn: () => void) { this.timers.push({ t: this.time + t, fn }) }

  addShake(a: number) { this.shake = Math.min(24, this.shake + a * this.shakeScale) }

  addTrack(x: number, y: number, rot: number) {
    if (this.tracks.length > 300) this.tracks.shift()
    this.tracks.push({ x, y, rot, life: 6 })
  }

  addDecal(x: number, y: number, r: number) {
    if (this.decals.length > 60) this.decals.shift()
    this.decals.push({ x, y, r, rot: Math.random() * TAU })
  }

  line(pts: number[], color: string, glow: string, width: number, life: number, jag = 0) {
    this.lines.push({ pts, life, max: life, color, glow, width, jag })
  }

  // ───────────── spawning ─────────────

  spawn(defId: string, x: number, y: number, opts: { mover?: Mover | null; elite?: boolean; hp?: number; tag?: string; parent?: Enemy; ox?: number; oy?: number; rot?: number; data?: unknown } = {}) {
    const def = ENEMIES[defId]
    if (!def) throw new Error(`Unknown enemy ${defId}`)
    const e = new Enemy()
    e.def = def
    e.x = x; e.y = y
    e.layer = def.layer
    e.r = def.r
    e.elite = opts.elite ?? (def.layer === 'air' && def.hp < 400 && Math.random() < this.diff.eliteChance)
    const hp = (opts.hp ?? def.hp) * this.diff.enemyHp * (e.elite ? 2.2 : 1) * (def.boss ? 1 : this.hpScale)
    e.hp = e.maxHp = hp
    e.armor = def.armor ?? 1
    e.mover = opts.mover ?? null
    e.contact = def.contact ?? (def.layer === 'air' ? 20 : 0)
    e.tag = opts.tag ?? ''
    e.rot = opts.rot ?? 0
    e.scale = (def.scale ?? 1) * (e.elite ? 1.12 : 1)
    e.data = opts.data ?? null
    if (opts.parent) { e.parent = opts.parent; e.ox = opts.ox ?? 0; e.oy = opts.oy ?? 0; e.x = opts.parent.x + e.ox; e.y = opts.parent.y + e.oy }
    def.init?.(e, this)
    this.enemies.push(e)
    this.stats.spawned++
    if (def.target) this.stats.groundTotal++
    return e
  }

  /** Enemy bullet. Angle in radians (0 = right, π/2 = down). Applies difficulty speed. */
  fire(x: number, y: number, ang: number, speed: number, kind: BulletKind = BulletKind.Orb, dmg = 10, r = 0) {
    const b = this.bullets.spawn()
    if (!b) return null
    b.reset()
    b.x = x; b.y = y
    const s = speed * this.diff.bulletSpeed
    b.vx = Math.cos(ang) * s; b.vy = Math.sin(ang) * s
    b.kind = kind
    b.dmg = dmg * this.diff.damageTaken
    b.r = r || BULLET_R[kind]
    return b
  }

  /** Angle from a point to the player, leading the target on sharp difficulties. */
  aim(x: number, y: number, speed = 300) {
    const p = this.player
    let tx = p.x, ty = p.y
    if (this.diff.sharp) {
      const t = Math.hypot(tx - x, ty - y) / (speed * this.diff.bulletSpeed)
      tx += p.vx * t * 0.6; ty += p.vy * t * 0.6
    }
    return Math.atan2(ty - y, tx - x)
  }

  laser(x: number, y: number, ang: number, len: number, width: number, warn: number, life: number, owner: Enemy | null = null, sweep = 0) {
    const l: Laser = { x, y, ang, len, width, warn, life, age: 0, owner, ox: owner ? x - owner.x : 0, oy: owner ? y - owner.y : 0, dmg: 25 * this.diff.damageTaken, sweep, active: true, sounded: false }
    this.lasers.push(l)
    if (!this.preview) sfxAt('enemy_laser_charge', x, 0.7)
    return l
  }

  pickup(kind: PickupKind, x: number, y: number, value = 0, id = '') {
    const p = this.pickups.spawn()
    if (!p) return
    p.reset()
    p.kind = kind; p.x = x; p.y = y; p.value = value; p.id = id
    const a = rand(-Math.PI, 0), s = kind === PickupKind.Credit ? rand(40, 140) : 60
    p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s
  }

  dropCredits(x: number, y: number, amount: number) {
    if (amount <= 0) return
    if (amount >= 100) {
      const n = Math.min(10, Math.ceil(amount / 60))
      for (let i = 0; i < n; i++) this.pickup(PickupKind.CreditBig, x + rand(-10, 10), y + rand(-10, 10), Math.round(amount / n))
    } else {
      const n = Math.min(5, Math.max(1, Math.round(amount / 12)))
      for (let i = 0; i < n; i++) this.pickup(PickupKind.Credit, x + rand(-6, 6), y + rand(-6, 6), Math.round(amount / n))
    }
  }

  // ───────────── damage ─────────────

  isShielded(e: Enemy) {
    const s = e.shieldedBy
    return !!(s && !s.dead && !s.gone)
  }

  /** Returns damage actually dealt. */
  damage(e: Enemy, dmg: number, hx: number, hy: number, quiet = false): number {
    if (e.dead || e.hidden) return 0
    if (this.isShielded(e) || e.armor <= 0) {
      if (!quiet && !this.preview && this.sfxBudget > 0) { this.sfxBudget--; sfxAt('hit_armor', hx, 0.35) }
      if (Math.random() < 0.4) this.parts.spawn(P.Glow, hx, hy, 0, 0, 0.08, 7, 2, C.cyan)
      return 0
    }
    const d = dmg * e.armor
    e.hp -= d
    e.flash = e.maxHp > 400 ? Math.max(e.flash, 0.45) : 1
    e.hitThisFrame = true
    if (!quiet) {
      if (Math.random() < 0.5) hitSpark(this, hx, hy, e.layer === 'ground' ? C.orange : C.yellow)
      if (!this.preview && this.sfxBudget > 0 && Math.random() < 0.35) { this.sfxBudget--; sfxAt('hit_small', hx, 0.25, rand(0.9, 1.2)) }
    }
    if (e.hp <= 0) this.kill(e)
    return d
  }

  /** Circular area damage to everything inside. */
  splash(x: number, y: number, r: number, dmg: number, except: Enemy | null = null) {
    const r2 = r * r
    for (const e of this.enemies) {
      if (e.dead || e === except || e.hidden) continue
      const dx = e.x - x, dy = e.y - y
      const rr = r + e.r
      if (dx * dx + dy * dy < Math.max(r2, rr * rr)) this.damage(e, dmg, e.x, e.y, true)
    }
  }

  kill(e: Enemy, rewards = true) {
    if (e.dead) return
    e.dead = true
    const def = e.def
    const ground = e.layer === 'ground'
    explode(this, e.x, e.y, e.elite && def.explode === 'small' ? 'medium' : def.explode, ground, ground ? C.orange : C.yellow)
    if (def.explode === 'large' || def.explode === 'huge') {
      this.hitstop = Math.max(this.hitstop, 0.045)
      // arcade bullet-cancel: a big kill wipes nearby fire and pays it out as scrap
      if (!this.preview) this.clearBullets(e.x, e.y, 150 + e.r, true)
    } else if (def.explode === 'medium') this.hitstop = Math.max(this.hitstop, 0.012)
    def.onDeath?.(e, this)
    e.onDeath?.(this, e)
    if (!rewards || this.preview) return
    this.stats.kills++
    if (def.target) this.stats.groundKills++
    this.chain++
    this.chainTimer = 2.2
    if (this.chainMult() > (this.chain > 1 ? 1 + Math.min(4, Math.floor((this.chain - 1) / 12) * 0.5) : 1)) {
      this.floater(this.player.x, this.player.y - 34, `CHAIN ×${this.chainMult().toFixed(1)}`, '#ff9a3d')
      audio.sfx('ui_upgrade', { vol: 0.35, pitch: 0.8 + this.chainMult() * 0.15 })
    }
    this.stats.maxChain = Math.max(this.stats.maxChain, this.chain)
    const multBefore = this.chainMult()
    const pts = Math.round(def.score * multBefore * (e.elite ? 3 : 1))
    this.score += pts
    if (pts >= 300) this.floater(e.x, e.y - 10, pts.toLocaleString('en-US'), e.elite ? '#ffcc33' : '#ffffff')
    const credits = Math.round(def.credits * this.diff.creditMul * (e.elite ? 3 : 1) * this.creditScale)
    this.dropCredits(e.x, e.y, credits)
    this.player.onKill(def.charge * (e.elite ? 1.5 : 1))
    if (this.diff.revenge && !ground && def.hp < 300 && e.y < this.player.y - 60) {
      const b = this.fire(e.x, e.y, this.aim(e.x, e.y, 170), 170, BulletKind.Shard, 8)
      if (b) b.arm = 0.15
    }
  }

  chainMult() { return 1 + Math.min(4, Math.floor(this.chain / 12) * 0.5) }

  // ───────────── update ─────────────

  update(dt: number) {
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.15 }
    this.frameDt = dt
    this.time += dt
    this.stats.time += dt
    this.sfxBudget = Math.min(6, this.sfxBudget + dt * 40)
    this.scrollY += this.scroll * dt

    for (let i = this.timers.length - 1; i >= 0; i--) {
      const t = this.timers[i]
      if (this.time >= t.t) { this.timers.splice(i, 1); t.fn() }
    }

    if (this.chainTimer > 0) { this.chainTimer -= dt; if (this.chainTimer <= 0) this.chain = 0 }

    this.player.update(dt)
    this.updateShots(dt)
    this.updateEnemies(dt)
    this.updateBullets(dt)
    this.updateLasers(dt)
    this.collideShots()
    this.updatePickups(dt)
    this.parts.update(dt, this.scroll)

    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i]
      f.life -= dt
      f.y -= 30 * dt
      if (f.life <= 0) this.floaters.splice(i, 1)
    }
    for (let i = this.lines.length - 1; i >= 0; i--) {
      if ((this.lines[i].life -= dt) <= 0) this.lines.splice(i, 1)
    }
    for (const d of this.decals) d.y += this.scroll * dt
    for (const t of this.tracks) { t.y += this.scroll * dt; t.life -= dt }
    while (this.tracks.length && (this.tracks[0].life <= 0 || this.tracks[0].y > PH + 40)) this.tracks.shift()
    while (this.decals.length && this.decals[0].y > PH + 100) this.decals.shift()
    for (let i = this.decor.length - 1; i >= 0; i--) {
      const d = this.decor[i]
      d.y += this.scroll * d.depth * dt
      d.x += d.vx * dt
      if (d.y > PH + 400) this.decor.splice(i, 1)
    }

    this.shake = Math.max(0, this.shake - dt * 30 - this.shake * dt * 4)
    const s = this.shake
    this.shakeX = (Math.random() - 0.5) * s
    this.shakeY = (Math.random() - 0.5) * s
    this.flashScreen = Math.max(0, this.flashScreen - dt * 2)
  }

  private updateShots(dt: number) {
    for (const s of this.shots.items) {
      if (!s.active) continue
      s.age += dt
      if (s.age >= s.ttl) { this.expireShot(s); continue }
      if (s.homing > 0) steerShot(this, s, dt)
      if (s.wave) {
        s.waveBaseX += s.vx * dt
        const ramp = Math.min(1, s.age * 6)
        const ph = s.age * s.waveFreq + s.kindData
        s.x = s.waveBaseX + Math.sin(ph) * s.wave * ramp
        s.rot = Math.atan2(s.vy, s.vx + Math.cos(ph) * s.wave * s.waveFreq * ramp) + Math.PI / 2
      } else s.x += s.vx * dt
      s.y += s.vy * dt
      s.rot += s.spin * dt
      if (s.ricochet > 0 && (s.x < 4 || s.x > PW - 4)) { s.vx = -s.vx; s.ricochet--; s.x = clamp(s.x, 4, PW - 4) }
      if (s.trail && Math.random() < s.trail) this.parts.spawn(P.Glow, s.x, s.y, 0, 0, 0.18, 4, 1, C.orange)
      if (s.y < -40 || s.y > PH + 40 || s.x < -40 || s.x > PW + 40) { this.shots.kill(s) }
    }
  }

  expireShot(s: Shot) {
    onShotExpire(this, s)
    this.shots.kill(s)
  }

  private updateEnemies(dt: number) {
    for (const e of this.enemies) e.shieldedBy = e.shieldedBy && e.s.permShield ? e.shieldedBy : null
    const list = this.enemies
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (e.dead || e.gone) continue
      e.age += dt
      e.hitThisFrame = false
      if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 10)
      if (e.parent) {
        if (e.parent.dead || e.parent.gone) {
          if (e.s.detach) { e.parent = null } else { this.kill(e, false); continue }
        } else { e.x = e.parent.x + e.ox; e.y = e.parent.y + e.oy }
      }
      if (e.mover) {
        e.mover.update(e, this, dt)
      }
      e.def.update?.(e, this, dt)
      if (e.s.burn) tickBurn(this, e, dt)
      if (e.cd > 0) e.cd -= dt * this.diff.fireRate
      const on = e.y > -e.r && e.y < PH + e.r && e.x > -e.r && e.x < PW + e.r
      if (on) e.wasOnScreen = true
      if (!e.noCull && !e.parent) {
        // Side exits only count once the unit has been seen (or has loitered too long), so side-entering convoys survive their approach.
        const sideOff = (e.wasOnScreen || e.age > 15) && (e.x < -140 - e.r || e.x > PW + 140 + e.r)
        const off = e.y > PH + 90 + e.r || sideOff || (e.wasOnScreen && e.y < -120 - e.r) || e.y < -900 || e.x < -1200 || e.x > PW + 1200
        if (off) e.gone = true
      }
    }
    // contact damage
    const p = this.player
    if (p.alive) {
      for (const e of list) {
        if (e.dead || e.gone || e.hidden || e.layer !== 'air' || e.contact <= 0) continue
        const rr = e.r * 0.8 + p.bodyR
        const dx = e.x - p.x, dy = e.y - p.y
        if (dx * dx + dy * dy < rr * rr) {
          if (p.phased) { this.damage(e, 400 * (1 / 60), e.x, e.y, true); continue }
          p.hurt(e.contact * this.diff.damageTaken, e.x, e.y)
          if (e.def.hp < 120) this.damage(e, 999, e.x, e.y)
          else this.damage(e, 20, e.x, e.y)
        }
      }
    }
    // compact
    let j = 0
    for (let i = 0; i < list.length; i++) {
      const e = list[i]
      if (!e.dead && !e.gone) list[j++] = e
    }
    list.length = j
  }

  private updateBullets(dt: number) {
    const p = this.player
    const pr = p.hitR
    for (const b of this.bullets.items) {
      if (!b.active) continue
      b.age += dt
      if (b.age >= b.ttl) {
        if (b.onPop && b.popOnExpire) b.onPop(this, b)
        this.bullets.kill(b); continue
      }
      if (b.curve) {
        const c = Math.cos(b.curve * dt), s = Math.sin(b.curve * dt)
        const vx = b.vx * c - b.vy * s
        b.vy = b.vx * s + b.vy * c
        b.vx = vx
      }
      if (b.homing > 0 && p.alive) {
        const cur = Math.atan2(b.vy, b.vx)
        const want = Math.atan2(p.y - b.y, p.x - b.x)
        let d = want - cur
        while (d > Math.PI) d -= TAU
        while (d < -Math.PI) d += TAU
        const na = cur + clamp(d, -b.homing * dt, b.homing * dt)
        const sp = Math.hypot(b.vx, b.vy)
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp
      }
      b.vx += b.ax * dt; b.vy += b.ay * dt
      if (b.maxSpeed > 0) {
        const sp = Math.hypot(b.vx, b.vy)
        if (sp > b.maxSpeed) { b.vx *= b.maxSpeed / sp; b.vy *= b.maxSpeed / sp }
      }
      b.x += b.vx * dt; b.y += b.vy * dt
      if (b.kind === BulletKind.Missile && Math.random() < 0.5) this.parts.spawn(P.Smoke, b.x - b.vx * 0.03, b.y - b.vy * 0.03, 0, 0, 0.5, 3, 7, C.smokeLight, 0)
      if (b.x < -60 || b.x > PW + 60 || b.y < -80 || b.y > PH + 60) { this.bullets.kill(b); continue }
      if (b.age < b.arm) continue
      if (p.alive) {
        const dx = b.x - p.x, dy = b.y - p.y, rr = b.r * b.scale + pr
        if (dx * dx + dy * dy < rr * rr) {
          if (p.phased) continue
          p.hurt(b.dmg, b.x, b.y)
          if (b.onPop) b.onPop(this, b)
          this.bullets.kill(b)
          continue
        }
        // Pods that block bullets (aegis orbs)
        if (p.blockers.length) {
          for (const o of p.blockers) {
            const ex = b.x - o.x, ey = b.y - o.y, orr = o.r + b.r
            if (ex * ex + ey * ey < orr * orr) {
              this.parts.spawn(P.Glow, b.x, b.y, 0, 0, 0.12, 10, 3, C.cyan)
              o.onBlock()
              this.bullets.kill(b)
              break
            }
          }
        }
      }
    }
  }

  private updateLasers(dt: number) {
    const p = this.player
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const l = this.lasers[i]
      l.age += dt
      if (l.owner) {
        if (l.owner.dead || l.owner.gone) { this.lasers.splice(i, 1); continue }
        l.x = l.owner.x + l.ox; l.y = l.owner.y + l.oy
      }
      if (l.sweep) l.ang += l.sweep * dt
      if (l.age >= l.warn + l.life) { this.lasers.splice(i, 1); continue }
      if (l.age < l.warn) continue
      if (!l.sounded) { l.sounded = true; if (!this.preview) sfxAt('enemy_laser_fire', l.x, 0.8) }
      if (!p.alive || p.phased) continue
      // distance from player to segment
      const ex = Math.cos(l.ang), ey = Math.sin(l.ang)
      const px = p.x - l.x, py = p.y - l.y
      const t = clamp(px * ex + py * ey, 0, l.len)
      const cx = px - ex * t, cy = py - ey * t
      const wr = l.width * 0.5 + p.hitR
      if (cx * cx + cy * cy < wr * wr) p.hurt(l.dmg * dt * 6, p.x, p.y, true)
    }
  }

  private collideShots() {
    const grid = this.grid
    for (const c of grid) c.length = 0
    for (const e of this.enemies) {
      if (e.dead || e.hidden) continue
      const c0 = cellX(e.x - e.r), c1 = cellX(e.x + e.r), r0 = cellY(e.y - e.r), r1 = cellY(e.y + e.r)
      for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) grid[cy * GCOLS + cx].push(e)
    }
    for (const s of this.shots.items) {
      if (!s.active || s.kind === ShotKind.Mine) continue
      const cell = grid[cellY(s.y) * GCOLS + cellX(s.x)]
      for (let k = 0; k < cell.length; k++) {
        const e = cell[k]
        if (e.dead) continue
        const dx = e.x - s.x, dy = e.y - s.y, rr = e.r + s.r
        if (dx * dx + dy * dy > rr * rr) continue
        if (s.lastHit.includes(e.id)) continue
        this.hitShot(s, e)
        if (!s.active) break
      }
    }
    // Shootable enemy projectiles (missiles, mines)
    for (const b of this.bullets.items) {
      if (!b.active || b.hp <= 0) continue
      for (const s of this.shots.items) {
        if (!s.active || s.kind === ShotKind.Mine) continue
        const dx = b.x - s.x, dy = b.y - s.y, rr = b.r + s.r + 3
        if (dx * dx + dy * dy > rr * rr) continue
        b.hp -= s.dmg
        if (s.pierce > 0) s.pierce--; else this.shots.kill(s)
        if (b.hp <= 0) {
          explode(this, b.x, b.y, 'tiny', false, C.orange, true)
          this.score += 20
          this.bullets.kill(b)
          break
        }
      }
    }
  }

  private hitShot(s: Shot, e: Enemy) {
    if (!s.counted) { s.counted = true; this.stats.shotsHit++ }
    this.damage(e, s.dmg, s.x, s.y)
    onShotHit(this, s, e)
    if (s.pierce > 0) {
      s.pierce--
      s.lastHit.push(e.id)
    } else {
      this.shots.kill(s)
    }
  }

  private updatePickups(dt: number) {
    const p = this.player
    const mag = p.magnet
    for (const k of this.pickups.items) {
      if (!k.active) continue
      k.age += dt
      const dx = p.x - k.x, dy = p.y - k.y
      const d2 = dx * dx + dy * dy
      if (p.alive && (k.magnet || d2 < mag * mag)) {
        k.magnet = true
        const d = Math.sqrt(d2) || 1
        const sp = 520 + k.age * 200
        k.vx += (dx / d) * sp * dt * 8
        k.vy += (dy / d) * sp * dt * 8
        const v = Math.hypot(k.vx, k.vy)
        if (v > sp) { k.vx *= sp / v; k.vy *= sp / v }
      } else {
        k.vx *= Math.exp(-3 * dt)
        k.vy += (this.scroll * 1.2 - k.vy) * Math.min(1, dt * 2)
      }
      k.x += k.vx * dt; k.y += k.vy * dt
      if (p.alive && d2 < (p.bodyR + 12) ** 2) { this.collect(k); continue }
      if (k.y > PH + 30) this.pickups.kill(k)
    }
  }

  private collect(k: Pickup) {
    const p = this.player
    if (this.preview) { this.pickups.kill(k); return }
    const pan = (k.x / PW) * 2 - 1
    switch (k.kind) {
      case PickupKind.Credit:
      case PickupKind.CreditBig: {
        this.stats.creditsEarned += k.value
        p.creditStreak = Math.min(p.creditStreak + 1, 24)
        p.creditStreakT = 0.6
        if (k.value >= 25) this.floater(k.x, k.y, `+${k.value}`, '#c6ff3d')
        if (this.sfxBudget > 0) { this.sfxBudget -= 0.5; audio.sfx(k.kind === PickupKind.CreditBig ? 'pickup_big' : 'pickup_credit', { pan, vol: 0.5, pitch: 1 + p.creditStreak * 0.04 }) }
        break
      }
      case PickupKind.Repair:
        p.hull = Math.min(p.maxHull, p.hull + k.value)
        this.floater(k.x, k.y, `+${k.value} HULL`, '#6fd3ff')
        audio.sfx('pickup_repair', { pan })
        break
      case PickupKind.Shield:
        p.shield = p.maxShield
        audio.sfx('shield_restored', { pan })
        break
      case PickupKind.Special:
        p.special = Math.min(100, p.special + k.value)
        audio.sfx('pickup_special', { pan })
        break
      case PickupKind.Core:
        if (!this.stats.cores.includes(k.id)) this.stats.cores.push(k.id)
        audio.sfx('pickup_core', { pan })
        this.emit({ type: 'core', id: k.id })
        this.floater(k.x, k.y, 'DATA CORE', '#b58cff')
        break
    }
    sparks(this, k.x, k.y, 3, C.credit, 120, 0.2)
    this.pickups.kill(k)
  }

  floaters: { x: number; y: number; text: string; color: string; life: number }[] = []
  floater(x: number, y: number, text: string, color: string) {
    if (this.preview) return
    if (this.floaters.length > 40) this.floaters.shift()
    this.floaters.push({ x, y, text, color, life: 0.8 })
  }

  secret(id: string, text: string) {
    if (this.stats.secrets.includes(id)) return
    this.stats.secrets.push(id)
    this.stats.secretTexts[id] = text
    audio.sfx('secret')
    this.emit({ type: 'secret', id, text })
  }

  /** Find nearest living, visible enemy satisfying a predicate. */
  nearest(x: number, y: number, maxD: number, pred?: (e: Enemy) => boolean): Enemy | null {
    let best: Enemy | null = null, bd = maxD * maxD
    for (const e of this.enemies) {
      if (e.dead || e.hidden || e.s.civilian || e.s.cloak || e.armor <= 0 || this.isShielded(e) || e.y < -20 || e.y > PH + 10 || e.x < -10 || e.x > PW + 10) continue
      if (pred && !pred(e)) continue
      const d = (e.x - x) ** 2 + (e.y - y) ** 2
      if (d < bd) { bd = d; best = e }
    }
    return best
  }

  clearBullets(x: number, y: number, r: number, toCredits = false) {
    const r2 = r * r
    for (const b of this.bullets.items) {
      if (!b.active) continue
      if ((b.x - x) ** 2 + (b.y - y) ** 2 < r2) {
        this.parts.spawn(P.Glow, b.x, b.y, 0, 0, 0.25, 8, 2, C.magenta)
        if (toCredits && Math.random() < 0.15) this.pickup(PickupKind.Credit, b.x, b.y, 2)
        this.bullets.kill(b)
      }
    }
  }
}

export const BULLET_R: Record<BulletKind, number> = {
  [BulletKind.Orb]: 4.5, [BulletKind.Needle]: 3.5, [BulletKind.Big]: 8, [BulletKind.Missile]: 5,
  [BulletKind.Bomb]: 7, [BulletKind.Ring]: 5, [BulletKind.Shard]: 3.5, [BulletKind.Mine]: 7, [BulletKind.Wave]: 6,
}

const cellX = (x: number) => clamp(Math.floor((x + 120) / GRID), 0, GCOLS - 1)
const cellY = (y: number) => clamp(Math.floor((y + 200) / GRID), 0, GROWS - 1)

// late imports to avoid cycles at module-eval time
import { onShotExpire, onShotHit, steerShot, ShotKind, tickBurn } from './weapons'
