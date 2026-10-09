import type { World } from './world'
import type { Loadout } from './campaign'
import { shipStats, type ShipStats } from './campaign'
import { input } from '../core/input'
import { PW, PH } from './consts'
import { clamp, approach, rand } from '../core/math'
import { createFront, createRear, createPod, type Gun, type RearGun, type Pod } from './weapons'
import { triggerSpecial, updateSpecial } from './specials'
import { P, C } from '../render/particles'
import { explode, shieldRipple, sparks } from './fx'
import { audio } from '../audio/audio'

export interface Blocker { x: number; y: number; r: number; onBlock(): void }

export class Player {
  x = PW / 2
  y = PH - 90
  vx = 0
  vy = 0
  bank = 0
  alive = true
  stats: ShipStats
  maxHull: number
  hull: number
  maxShield: number
  shield: number
  energy: number
  maxEnergy: number
  shieldDelay = 0
  invuln = 0
  special = 0
  specialId: string | null
  specialCost = 100
  specialActive = 0
  specialKind = ''
  phased = false
  overclock = 0
  front: Gun
  rear: RearGun | null
  pods: Pod[] = []
  blockers: Blocker[] = []
  magnet = 95
  bodyR = 14
  hitR = 4
  starving = 0
  creditStreak = 0
  creditStreakT = 0
  reflexCd = 0
  hitFlash = 0
  lowHullWarned = false
  /** Hold-to-fire state after input/AI. */
  firing = false
  /** Precision/focus held: arcade weapons tighten into a concentrated stream. */
  focus = false
  /** Autopilot for tests/demo: if set, overrides input. */
  ai: ((p: Player, w: World, dt: number) => { mx: number; my: number; fire: boolean; special: boolean; precision?: boolean }) | null = null
  deathTimer = 0
  shieldBreakFlash = 0
  private sputterCd = 0
  private alarm: ReturnType<typeof audio.loop> | null = null
  entering = 0

  constructor(private w: World, public loadout: Loadout) {
    this.stats = shipStats(loadout)
    this.maxHull = this.hull = this.stats.hull
    this.maxShield = this.shield = this.stats.shieldCap
    this.maxEnergy = this.energy = this.stats.capacity
    this.hitR = this.stats.ghost ? 3 : 4
    this.front = createFront(loadout.front.id, loadout.front.level, this, w)
    this.rear = loadout.rear ? createRear(loadout.rear.id, loadout.rear.level, this, w) : null
    if (loadout.podL) this.pods.push(createPod(loadout.podL.id, loadout.podL.level, -1, this, w))
    if (loadout.podR) this.pods.push(createPod(loadout.podR.id, loadout.podR.level, 1, this, w))
    this.specialId = loadout.special
    this.specialCost = loadout.special === 'phase' ? 80 : 100
    this.special = 35
  }

  get speed() { return 400 * this.stats.speedMul * (this.phased ? 1.35 : 1) }

  /** Spend energy; returns false if not enough (weapons then skip the shot). */
  useEnergy(n: number): boolean {
    if (this.w.arcade) return true // arcade: power items, not a reactor, set the firepower
    if (this.overclock > 0) return true
    if (this.energy >= n) { this.energy -= n; return true }
    this.starving = 0.25
    return false
  }

  onKill(charge: number) {
    if (this.specialId) this.special = Math.min(100, this.special + charge)
    if (this.stats.leech) this.shield = Math.min(this.maxShield, this.shield + 4)
  }

  hurt(dmg: number, hx: number, hy: number, continuous = false) {
    if (this.w.arcade) { this.w.arcade.hit(this.w); return }
    if (!this.alive || this.w.god || this.phased || this.entering > 0) return
    if (this.invuln > 0 && (!continuous || this.invuln > 10)) return
    this.w.stats.damageTaken += dmg
    this.shieldDelay = this.stats.shieldDelay
    const pan = (this.x / PW) * 2 - 1
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, dmg)
      this.shield -= absorbed
      dmg -= absorbed
      if (!continuous) {
        shieldRipple(this.w, this.x, this.y, 26)
        audio.sfx('shield_hit', { pan, vol: 0.7 })
        this.invuln = 0.08
      }
      if (this.shield <= 0) {
        audio.sfx('shield_down', { pan })
        this.shieldBreakFlash = 1
        if (this.stats.reflex && this.reflexCd <= 0) {
          this.reflexCd = 8
          this.w.clearBullets(this.x, this.y, 170)
          this.w.splash(this.x, this.y, 150, 60)
          this.w.parts.spawn(P.Ring, this.x, this.y, 0, 0, 0.45, 20, 180, C.cyan)
        }
      }
    }
    if (dmg > 0) {
      this.hull -= dmg
      this.hitFlash = 1
      if (!continuous) {
        this.invuln = 0.55
        audio.sfx('hull_hit', { pan })
        this.w.addShake(7)
        sparks(this.w, hx, hy, 10, C.orange, 300)
      }
      if (this.hull <= 0) this.die()
    }
  }

  die() {
    if (!this.alive) return
    this.alive = false
    this.hull = 0
    this.alarm?.stop(); this.alarm = null
    this.front.stop?.()
    audio.sfx('player_death')
    explode(this.w, this.x, this.y, 'large')
    this.w.after(0.25, () => explode(this.w, this.x + 12, this.y - 8, 'medium'))
    this.w.after(0.5, () => explode(this.w, this.x - 10, this.y + 6, 'large'))
    this.w.flashScreen = 0.6
    this.w.after(2.4, () => this.w.emit({ type: 'dead' }))
  }

  update(dt: number) {
    const w = this.w
    if (!this.alive) return
    let mx = input.moveX, my = input.moveY, fire = input.fire, spec = input.special, prec = input.precision
    if (this.ai) {
      const a = this.ai(this, w, dt)
      mx = a.mx; my = a.my; fire = a.fire; spec = a.special; prec = !!a.precision
    }
    if (this.entering > 0) {
      this.entering -= dt
      this.y = approach(this.y, PH - 90, 420 * dt)
      mx = 0; my = 0; spec = false
    }
    this.focus = prec
    const sp = this.speed * (prec ? 0.45 : 1)
    const tvx = mx * sp, tvy = my * sp
    const acc = 5200
    this.vx = approach(this.vx, tvx, acc * dt)
    this.vy = approach(this.vy, tvy, acc * dt)
    const B = w.bounds
    this.x = clamp(this.x + this.vx * dt, B.x0 + 18, B.x1 - 18)
    this.y = clamp(this.y + this.vy * dt, B.y0 + 30, B.y1 - 22)
    this.bank = approach(this.bank, clamp(this.vx / 400, -1, 1), dt * 9)

    // power
    const out = this.stats.output
    this.energy = Math.min(this.maxEnergy, this.energy + out * dt)
    if (this.shieldDelay > 0) this.shieldDelay -= dt
    else if (this.shield < this.maxShield && !this.stats.leech) {
      const want = Math.min(this.maxShield - this.shield, this.stats.shieldRegen * dt)
      const cost = want * this.stats.shieldCost
      // Shields only draw from the top 80% of the reservoir: weapons keep a floor.
      if (this.energy - cost > this.maxEnergy * 0.2) {
        this.energy -= cost
        const was = this.shield
        this.shield += want
        if (was <= 0 && this.shield > 0) audio.sfx('shield_restored', { vol: 0.5 })
      }
    }
    if (this.invuln > 0) this.invuln -= dt
    if (this.reflexCd > 0) this.reflexCd -= dt
    if (this.hitFlash > 0) this.hitFlash -= dt * 4
    if (this.shieldBreakFlash > 0) this.shieldBreakFlash -= dt * 2
    if (this.creditStreakT > 0) { this.creditStreakT -= dt; if (this.creditStreakT <= 0) this.creditStreak = 0 }
    if (this.specialId) this.special = Math.min(100, this.special + dt * 0.8)

    // low hull alarm
    const low = this.hull / this.maxHull < 0.25
    if (low && !this.alarm && !w.preview) this.alarm = audio.loop('alarm', { vol: 0.35 })
    if (!low && this.alarm) { this.alarm.stop(); this.alarm = null }

    // weapons
    this.firing = fire && this.entering <= 0
    this.blockers.length = 0
    this.front.update(dt, this.firing)
    this.rear?.update(dt, this.firing)
    for (const pod of this.pods) pod.update(dt, this.firing)

    if (this.starving > 0) {
      this.starving -= dt
      this.sputterCd -= dt
      if (this.sputterCd <= 0 && this.firing && !w.preview) { this.sputterCd = 0.8; audio.sfx('energy_empty', { vol: 0.4 }) }
    }

    // special
    if (w.arcade) {
      if (spec) w.arcade.bomb(w)
      if (input.rift && !this.ai) w.arcade.flip(w)
    } else if (spec && this.specialId && this.special >= this.specialCost && this.specialActive <= 0) {
      this.special -= this.specialCost
      triggerSpecial(this, w, this.specialId)
    }
    updateSpecial(this, w, dt)
    if (this.overclock > 0) this.overclock -= dt

    // engine trail
    if (Math.random() < 0.9) {
      const flick = rand(0.8, 1.2)
      w.parts.spawn(P.Glow, this.x + rand(-2, 2), this.y + 19, rand(-10, 10), 160 + this.vy * 0.3, 0.12, 5 * flick, 1, this.overclock > 0 ? C.cyan : C.orange)
    }
  }

  /** Called when the mission ends to silence loops. */
  cleanup() {
    this.alarm?.stop(); this.alarm = null
    this.front.stop?.()
  }

}
