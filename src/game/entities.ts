import type { EnemyDef } from './enemy-def'
import type { Mover } from './movers'

/** Player projectile. Beams and arcs are hitscan and don't use this. */
export class Shot {
  active = false
  x = 0; y = 0; vx = 0; vy = 0
  r = 3
  dmg = 1
  /** Remaining extra enemies it can pass through. */
  pierce = 0
  ttl = 2
  age = 0
  sprite = 'shot_pulse'
  rot = 0
  spin = 0
  scale = 1
  /** Homing turn rate (rad/s); 0 = none. */
  homing = 0
  target: Enemy | null = null
  speed = 0
  /** Screen-edge bounces left. */
  ricochet = 0
  /** Splash damage on hit/expire. */
  splash = 0
  splashDmg = 0
  /** Special behaviour tag interpreted by weapons.ts (e.g. bloom burst, mine). */
  kind = 0
  kindData = 0
  wave = 0 // sine amplitude for helix
  waveFreq = 0
  waveBaseX = 0
  lastHit: number[] = []
  trail = 0
  /** Source weapon id, for accuracy stats + mirror pod scaling. */
  src = 0
  counted = false
  reset() {
    this.active = true
    this.pierce = 0; this.homing = 0; this.target = null; this.ricochet = 0
    this.splash = 0; this.splashDmg = 0; this.kind = 0; this.kindData = 0
    this.wave = 0; this.waveFreq = 0; this.age = 0; this.rot = 0; this.spin = 0; this.scale = 1
    this.lastHit.length = 0; this.trail = 0; this.speed = 0; this.counted = false
    return this
  }
}

export const enum BulletKind { Orb, Needle, Big, Missile, Bomb, Ring, Shard, Mine, Wave }

/** Enemy projectile. Always drawn above everything so it stays readable. */
export class Bullet {
  active = false
  x = 0; y = 0; vx = 0; vy = 0
  ax = 0; ay = 0
  /** Angular velocity for curving shots. */
  curve = 0
  r = 4
  dmg = 10
  ttl = 8
  age = 0
  kind: BulletKind = BulletKind.Orb
  /** Shootable projectiles (missiles, mines) have hp > 0. */
  hp = 0
  homing = 0
  maxSpeed = 0
  /** Delay before becoming dangerous (spawn telegraph). */
  arm = 0
  /** Called when ttl expires or when shot down (e.g. artillery burst). */
  onPop: ((w: import('./world').World, b: Bullet) => void) | null = null
  popOnExpire = false
  scale = 1
  reset() {
    this.active = true
    this.ax = 0; this.ay = 0; this.curve = 0; this.age = 0; this.hp = 0; this.homing = 0; this.maxSpeed = 0
    this.arm = 0; this.onPop = null; this.popOnExpire = false; this.scale = 1; this.ttl = 8
    return this
  }
}

export type Layer = 'air' | 'ground'

let nextEnemyId = 1

export class Enemy {
  id = nextEnemyId++
  def!: EnemyDef
  x = 0; y = 0; vx = 0; vy = 0
  rot = 0
  hp = 1
  maxHp = 1
  r = 10
  layer: Layer = 'air'
  age = 0
  flash = 0
  dead = false
  /** Removed without death rewards (left the screen / escaped). */
  gone = false
  elite = false
  /** Damage multiplier (0 = invulnerable, e.g. submerged, shielded). */
  armor = 1
  shieldedBy: Enemy | null = null
  mover: Mover | null = null
  parent: Enemy | null = null
  ox = 0; oy = 0
  /** Part of a boss — boss HUD sums these. */
  bossPart = false
  /** Arbitrary per-behaviour state. */
  s: Record<string, number> = {}
  data: unknown = null
  tag = ''
  /** Fire cooldown helpers. */
  cd = 0
  cd2 = 0
  onDeath: ((w: import('./world').World, e: Enemy) => void) | null = null
  /** When true the enemy may leave the screen bottom without being culled until it fully exits. */
  hitThisFrame = false
  wasOnScreen = false
  noCull = false
  scale = 1
  /** Hidden: not drawn, not hittable (stealth, submerged). */
  hidden = false
  /** Contact damage to player (0 = none). ground units never collide. */
  contact = 0
  visibleAlpha = 1
}

export const enum PickupKind { Credit, CreditBig, Repair, Special, Core, Shield }

export class Pickup {
  active = false
  x = 0; y = 0; vx = 0; vy = 0
  kind: PickupKind = PickupKind.Credit
  value = 0
  age = 0
  magnet = false
  id = ''
  reset() { this.active = true; this.age = 0; this.magnet = false; this.id = ''; return this }
}

/** Fixed-capacity pool with swap-free iteration over an 'active' flag. */
export class Pool<T extends { active: boolean }> {
  items: T[] = []
  private free: T[] = []
  count = 0
  constructor(private make: () => T, private cap: number) {}
  spawn(): T | null {
    let it = this.free.pop()
    if (!it) {
      if (this.items.length >= this.cap) return null
      it = this.make()
      this.items.push(it)
    }
    it.active = true
    this.count++
    return it
  }
  kill(it: T) {
    if (!it.active) return
    it.active = false
    this.free.push(it)
    this.count--
  }
  clear() {
    for (const it of this.items) if (it.active) this.kill(it)
  }
}
