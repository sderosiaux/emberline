import type { World } from './world'
import type { Enemy, Bullet } from './entities'
import { PickupKind } from './entities'
import { PW, PH } from './consts'
import { createFront, createPod } from './weapons'
import { triggerSpecial } from './specials'
import { explode, sparks } from './fx'
import { P, C } from '../render/particles'
import { audio, type TrackId } from '../audio/audio'
import { rand } from '../core/math'
import { type Mods, type PerkDef, rollCards, restorePerks, onGraze, onKill, onBomb, riftDrainMul, magnetMul, pointMul } from './perks'

/**
 * Arcade mode: a danmaku-flavoured run (Touhou-like) on top of the campaign engine.
 * One hit costs a life; bombs clear the screen; enemies drop power and point items;
 * grazing bullets feeds the Rift, a mirrored layer you can flip into for score and as an escape hatch.
 */

/** Persists across the stages of one run. */
export interface ArcadeRun {
  score: number
  lives: number
  bombs: number
  power: number
  graze: number
  stage: number
  captured: number
  spells: number
  continues: number
  /** Current arcade weapon (see ARCADE_WEAPONS). */
  weapon: string
  /** Level-up cards picked so far: perk id → rank. */
  mods: Mods
  xp: number
  xpNext: number
  level: number
}

export const newArcadeRun = (): ArcadeRun => ({ score: 0, lives: 3, bombs: 3, power: 0, graze: 0, stage: 0, captured: 0, spells: 0, continues: 0, weapon: 'pulse', mods: {}, xp: 0, xpNext: 40, level: 1 })

/** Raiden-style weapon capsules cycle through these; the letter and colour are what the player reads. */
export const ARCADE_WEAPONS = [
  { id: 'pulse', letter: 'V', name: 'Vulcan', color: '#ffb02e' },
  { id: 'hail', letter: 'S', name: 'Spread', color: '#ff5a3a' },
  { id: 'sunline', letter: 'L', name: 'Laser', color: '#3ad6ff' },
  { id: 'hornet', letter: 'H', name: 'Homing', color: '#7dff5a' },
] as const
export const CAPSULE_CYCLE = 1.1

export const ARCADE = {
  /** Danmaku: more bullets per pattern, slower so they stay readable. */
  countMul: 1.5,
  speedMul: 0.8,
  grazeRadius: 18,
  grazeScore: 500,
  /** Rift energy: three segments; one to enter, drains while inside, refilled by grazing outside. */
  riftMax: 100,
  riftCost: 34,
  /** ~5 s per segment; grazing inside extends the stay (riftGrazeInside). */
  riftDrain: 7,
  riftPerGraze: 1.6,
  riftGrazeInside: 1.2,
  riftScore: 3,
  riftDamage: 1.5,
  riftScroll: 1.7,
  riftFire: 1.4,
  riftBulletSpeed: 1.18,
  /** Pickups above this line fly to the player and score full value. */
  collectLine: 0.28,
  pointBase: 10000,
  spellTime: 50,
  spellBonus: 1_000_000,
}

const SPELLS: Record<string, string[]> = {
  Smelter: ['Slag Sign 「Furnace That Remembers」', 'Molten Sign 「Refinery Requiem」', 'Ember Sign 「The Last Pour」'],
  Tidebreaker: ['Tide Sign 「Leviathan Breathing」', 'Brine Sign 「The Hull Opens」', 'Maelstrom 「Drowned Choir」'],
  Bastion: ['Shield Sign 「Four Pillars」', 'Lance Sign 「Sweep of the Colony」', 'Siege 「Bastion Walks」'],
  Excavator: ['Drill Sign 「Twin Arms of the Belt」', 'Core Sign 「Strip-Mined Sky」', 'Gravity 「Hurled Mountains」'],
  'The Gardener': ['Bloom 「Six Petals」', 'Lattice 「Star of Patience」', 'Murmur 「A Garden Let Go」'],
  Warden: ['Ring Sign 「Eight Gates」', 'Drone Sign 「Broken Halo」', 'Judgement 「Column of Light」'],
  Revenant: ['Wreck Sign 「Stitched Fleet」', 'Bow Sign 「The Dead Do Not Hurry」', 'Last Order 「Every Wreck Fires」'],
  'The Choir': ['Hymn 「The Wall Sings」', 'Heart 「Petals of the Choir」', 'Crescendo 「The Song Stops」'],
}

export class Arcade {
  rift: number = ARCADE.riftMax * 0.34
  inRift = false
  /** Barrel-roll animation when flipping layers, 1 → 0. */
  roll = 0
  bombT = 0
  respawnT = 0
  pointValue: number = ARCADE.pointBase
  spell: { name: string; t: number; failed: boolean } | null = null
  private spellIdx = 0
  private gunId = ''
  /** Scrap Plating: the next hit is absorbed. */
  scrapShield = false
  /** Level-up reached: the app pauses and shows these cards. */
  pendingCards: PerkDef[] | null = null
  private returnTrack: TrackId | null = null
  private baseScroll = 0
  private baseFire = 1
  private baseSpeed = 1

  constructor(public run: ArcadeRun, w: World) {
    this.baseFire = w.diff.fireRate
    this.baseSpeed = w.diff.bulletSpeed
    w.diff = { ...w.diff, bulletSpeed: this.baseSpeed * ARCADE.speedMul }
    w.score = run.score
    restorePerks(w, run.mods)
  }

  gainXp(n: number) {
    const r = this.run
    r.xp += n
    if (r.xp >= r.xpNext && !this.pendingCards) {
      r.xp -= r.xpNext
      r.level++
      r.xpNext = Math.round(r.xpNext * 1.32)
      this.pendingCards = rollCards(r.mods)
      if (!this.pendingCards.length) this.pendingCards = null
    }
  }

  get layer() { return this.inRift ? 1 : 0 }

  update(w: World, dt: number) {
    const p = w.player
    if (this.roll > 0) this.roll = Math.max(0, this.roll - dt * 2.5)
    if (this.bombT > 0) this.bombT -= dt
    if (this.inRift) {
      this.rift -= ARCADE.riftDrain * riftDrainMul(w) * dt
      if (this.rift <= 0) { this.rift = 0; this.flip(w, true) }
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt
      if (this.respawnT <= 0) this.respawn(w)
    }
    if (this.spell) {
      this.spell.t += dt
      if (this.spell.t > ARCADE.spellTime && !this.spell.failed) {
        this.spell.failed = true
        w.emit({ type: 'radio', who: 'SPELL', text: 'Time out — no capture bonus.', tone: 'odd' })
      }
    }
    p.magnet = 95 * magnetMul(w)
    // auto-collect line: flying high pulls every item in (Touhou's point-of-collection)
    if (p.alive && this.respawnT <= 0 && p.y < PH * ARCADE.collectLine) {
      for (const k of w.pickups.items) if (k.active) k.magnet = true
    }
    // keep the weapon in step with power
    const lvl = 1 + Math.min(7, Math.floor(this.run.power * 1.75))
    if (p.front.level !== lvl || this.gunId !== this.run.weapon) {
      p.front.stop?.()
      p.front = createFront(this.run.weapon, lvl, p, w)
      this.gunId = this.run.weapon
      if (lvl >= 3 && p.pods.length === 0) { p.pods.push(createPod('wasp', 2, -1, p, w), createPod('wasp', 2, 1, p, w)) }
      if (lvl >= 6 && p.pods.length === 2 && p.pods[0].level < 3) { p.pods.length = 0; p.pods.push(createPod('wasp', 3, -1, p, w), createPod('wasp', 3, 1, p, w)) }
    }
    if (this.run.score !== w.score) this.run.score = w.score
  }

  /** Flip between realities. forced = thrown out when the energy runs dry. */
  flip(w: World, forced = false) {
    const p = w.player
    if (!p.alive || this.respawnT > 0) return
    if (!this.inRift && this.rift < ARCADE.riftCost) { if (!w.preview) audio.sfx('ui_deny', { vol: 0.5 }); return }
    this.inRift = !this.inRift
    this.roll = 1
    if (this.inRift) {
      if (this.run.mods.riftbattery >= 2) w.clearBullets(p.x, p.y, 160, true)
      this.baseScroll = w.scroll
      w.scroll = this.baseScroll * ARCADE.riftScroll
      w.diff = { ...w.diff, fireRate: this.baseFire * ARCADE.riftFire, bulletSpeed: this.baseSpeed * ARCADE.speedMul * ARCADE.riftBulletSpeed }
    } else {
      w.scroll = this.baseScroll || w.scroll / ARCADE.riftScroll
      w.diff = { ...w.diff, fireRate: this.baseFire, bulletSpeed: this.baseSpeed * ARCADE.speedMul }
    }
    p.invuln = Math.max(p.invuln, 0.35)
    w.parts.spawn(P.Ring, p.x, p.y, 0, 0, 0.35, 10, 90, this.inRift ? C.red : C.cyan)
    w.flashScreen = Math.max(w.flashScreen, forced ? 0.15 : 0.25)
    if (!w.preview) {
      audio.sfx(this.inRift ? 'rift_enter' : 'rift_exit', { vol: forced ? 0.6 : 0.9 })
      // the Rift has its own score; coming back restores whatever was playing (stage or boss theme)
      if (this.inRift) { this.returnTrack = audio.music.current(); audio.music.play('rift', { fade: 0.4 }); audio.music.setIntensity(3) }
      else if (this.returnTrack) { audio.music.play(this.returnTrack, { fade: 0.6 }); audio.music.setIntensity(w.boss ? 3 : 2) }
    }
  }

  /** Bullets of the other layer are harmless; near-misses on your own layer count as grazes. */
  touch(w: World, b: Bullet, d2: number, hitR: number): 'hit' | 'none' {
    if (b.layer !== this.layer) return 'none'
    const rr = b.r * b.scale + hitR
    if (d2 < rr * rr) return 'hit'
    const gr = rr + ARCADE.grazeRadius
    if (!b.grazed && d2 < gr * gr && w.player.alive && this.respawnT <= 0) {
      b.grazed = true
      this.run.graze++
      this.pointValue += 10
      w.score += ARCADE.grazeScore * (this.inRift ? ARCADE.riftScore : 1)
      if (this.inRift) this.rift = Math.min(ARCADE.riftMax, this.rift + ARCADE.riftGrazeInside)
      else {
        const before = this.rift
        this.rift = Math.min(ARCADE.riftMax, this.rift + ARCADE.riftPerGraze)
        if (before < ARCADE.riftCost && this.rift >= ARCADE.riftCost && !w.preview) audio.sfx('rift_ready', { vol: 0.7 })
      }
      w.parts.spawn(P.Spark, w.player.x, w.player.y, (w.player.x - b.x) * 6, (w.player.y - b.y) * 6, 0.15, 1.4, 0.5, C.white, 6)
      this.gainXp(1)
      onGraze(w)
      if (!w.preview) audio.sfx('graze', { vol: 0.45, pitch: 0.95 + Math.random() * 0.15 })
    }
    return 'none'
  }

  invulnerable(w: World) {
    return this.bombT > 0 || this.respawnT > 0 || w.player.invuln > 0 || w.player.entering > 0
  }

  /** One hit = one life. */
  hit(w: World) {
    if (this.invulnerable(w) || w.god) return
    const p = w.player
    if (this.scrapShield) {
      // Scrap Plating eats the hit
      this.scrapShield = false
      p.invuln = 1.2
      w.clearBullets(p.x, p.y, 120)
      w.parts.spawn(P.Ring, p.x, p.y, 0, 0, 0.4, 10, 80, C.cyan)
      if (!w.preview) audio.sfx('shield_down')
      return
    }
    if (this.spell) this.spell.failed = true
    this.run.lives--
    explode(w, p.x, p.y, 'large')
    sparks(w, p.x, p.y, 24, C.orange, 380)
    w.flashScreen = 0.5
    w.addShake(12)
    if (!w.preview) audio.sfx('player_death')
    // scatter some power so a death hurts but can be recovered
    const lost = Math.min(this.run.power, 0.6)
    this.run.power -= lost
    for (let i = 0; i < Math.round(lost / 0.1); i++) w.pickup(PickupKind.Power, p.x + rand(-30, 30), p.y - 20, 0.1)
    if (this.inRift) this.flip(w, true)
    if (this.run.lives < 0) { this.run.lives = 0; this.respawnT = 0; p.die(); return }
    // off the field until respawn: alive=false keeps collisions, input and drawing out of the way
    p.alive = false
    this.respawnT = 1.1
  }

  private respawn(w: World) {
    const p = w.player
    p.alive = true
    p.x = PW / 2
    p.y = PH + 40
    p.entering = 0.9
    p.invuln = 2.6
    this.run.bombs = Math.max(this.run.bombs, 3)
    w.clearBullets(PW / 2, PH / 2, 1200)
  }

  bomb(w: World) {
    if (this.run.bombs <= 0 || this.bombT > 0 || this.respawnT > 0 || !w.player.alive) return
    this.run.bombs--
    this.bombT = 2.6
    if (this.spell) this.spell.failed = true
    triggerSpecial(w.player, w, 'nova')
    if (!w.preview) audio.sfx('bomb')
    onBomb(w)
    w.clearBullets(w.player.x, w.player.y, 2000, true)
  }

  /** Enemies drop power and point items instead of credits. */
  drop(w: World, e: Enemy) {
    onKill(w, e)
    this.gainXp(Math.max(1, e.def.charge))
    const big = e.maxHp > 300 || e.def.explode === 'large' || e.def.explode === 'huge'
    const nPoint = big ? 6 : e.maxHp > 60 ? 2 : Math.random() < 0.5 ? 1 : 0
    const nPower = big ? 3 : Math.random() < 0.3 ? 1 : 0
    for (let i = 0; i < nPoint; i++) w.pickup(PickupKind.Point, e.x + rand(-12, 12), e.y + rand(-8, 8), 0)
    // weapon capsules: guaranteed from bosses, a gamble from the big ships
    if (e.bossPart && !e.parent || (big && Math.random() < 0.35)) w.pickup(PickupKind.Weapon, e.x, e.y, Math.floor(Math.random() * ARCADE_WEAPONS.length))
    for (let i = 0; i < nPower; i++) w.pickup(big && i === 0 ? PickupKind.PowerBig : PickupKind.Power, e.x + rand(-12, 12), e.y + rand(-8, 8), big && i === 0 ? 0.5 : 0.05)
  }

  /** The capsule shows a different weapon every CAPSULE_CYCLE seconds; you get the one it shows when touched. */
  static capsuleWeapon(value: number, age: number) {
    return ARCADE_WEAPONS[(value + Math.floor(age / CAPSULE_CYCLE)) % ARCADE_WEAPONS.length]
  }

  collectWeapon(w: World, value: number, age: number, x: number, y: number) {
    const wp = Arcade.capsuleWeapon(value, age)
    if (wp.id === this.run.weapon) this.run.power = Math.min(4, this.run.power + 0.5)
    this.run.weapon = wp.id
    w.floater(x, y, wp.name.toUpperCase(), wp.color)
    w.emit({ type: 'radio', who: 'WEAPON', text: `${wp.name} equipped`, tone: 'ally' })
    if (!w.preview) audio.sfx('ui_upgrade', { vol: 0.7 })
  }

  collect(w: World, kind: PickupKind, value: number, x: number, y: number) {
    if (kind === PickupKind.Power || kind === PickupKind.PowerBig) {
      if (this.run.power >= 4) w.score += 1000
      this.run.power = Math.min(4, this.run.power + value)
      w.floater(x, y, this.run.power >= 4 ? 'MAX' : `+${value.toFixed(2)}`, '#ff6a5a')
      if (!w.preview) audio.sfx('item_power', { vol: 0.5 })
      return
    }
    // point items: full value above the collection line, less the lower you grabbed them
    const k = y < PH * ARCADE.collectLine ? 1 : Math.max(0.1, 1 - (y - PH * ARCADE.collectLine) / (PH * 0.8))
    const v = Math.round((this.pointValue * k * pointMul(w) * (this.inRift ? ARCADE.riftScore : 1)) / 10) * 10
    w.score += v
    if (k === 1 || v > 20000) w.floater(x, y, v.toLocaleString('en-US'), k === 1 ? '#ffe066' : '#9fd3ff')
    if (!w.preview) audio.sfx('item_point', { vol: 0.35, pitch: 0.9 + k * 0.3 })
  }

  /** Each boss phase is a named spell card with a timer and a capture bonus. */
  nextSpell(w: World) {
    this.finishSpell(w, true)
    const key = Object.keys(SPELLS).find((k) => w.bossName.startsWith(k))
    const list = key ? SPELLS[key] : []
    const name = list[this.spellIdx] ?? `Choir Sign 「Untitled Hymn No.${this.spellIdx + 1}」`
    this.spellIdx++
    this.spell = { name, t: 0, failed: false }
    this.run.spells++
    w.emit({ type: 'banner', text: 'Spell Card', sub: name })
    if (!w.preview) audio.sfx('spell_declare')
  }

  finishSpell(w: World, bossAlive: boolean) {
    const s = this.spell
    if (!s) return
    this.spell = null
    if (s.failed || !bossAlive && s.t > ARCADE.spellTime) return
    const bonus = Math.round((ARCADE.spellBonus * (1 + this.run.stage * 0.5) * Math.max(0.3, 1 - s.t / ARCADE.spellTime)) / 1000) * 1000
    w.score += bonus
    this.run.captured++
    w.emit({ type: 'radio', who: 'SPELL CAPTURED', text: `${s.name} — +${bonus.toLocaleString('en-US')}`, tone: 'odd' })
    if (!w.preview) audio.sfx('spell_capture')
  }
}
