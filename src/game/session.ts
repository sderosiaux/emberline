import { World } from './world'
import { LevelScript, LevelRunner, type MissionDef } from './level'
import { createBackground, type Background } from '../render/backgrounds'
import type { Campaign } from './campaign'
import { DIFFICULTIES, type Loadout } from './campaign'
import { Arcade, type ArcadeRun } from './arcade'

/** Arcade ship: one gun that grows with power items; drones join at higher power. */
const ARCADE_LOADOUT: Loadout = { front: { id: 'pulse', level: 1 }, rear: null, podL: null, podR: null, reactor: 'r5', shield: 's1', hull: 'h1', special: 'nova' }
import type { HudState, RadioLine } from '../render/hud'
import { audio } from '../audio/audio'
import { PH } from './consts'
import { ITEM } from '../data/items'

/** Light colour each biome casts on ground units (see setSpriteTint). */
const AMBIENT: Record<string, { color: string; k: number }> = {
  cinder: { color: '#c0612a', k: 0.2 }, glasswater: { color: '#1d8a96', k: 0.14 }, rime: { color: '#dfeaf6', k: 0.2 },
  shoals: { color: '#3b2d70', k: 0.18 }, halo: { color: '#9aa2b0', k: 0.1 }, graveyard: { color: '#27504a', k: 0.2 },
  heart: { color: '#4b1f55', k: 0.2 }, garden: { color: '#e7cdf2', k: 0.14 },
}

export interface MissionResult {
  mission: MissionDef
  stats: World['stats']
  score: number
  earned: number
  reward: number
  bonuses: { name: string; credits: number }[]
  total: number
  cores: string[]
  secrets: string[]
  warp: string | null
  hullDamage: number
}

/**
 * One flight: owns the world, level runner and background, turns world
 * events into HUD state, and decides when the mission is won or lost.
 */
export class Session {
  world: World
  runner: LevelRunner
  bg: Background
  hud: HudState
  state: 'play' | 'outro' | 'won' | 'lost' = 'play'
  outroT = 0
  warp: string | null = null
  hullDamage = 0
  private lastHull: number

  /** campaign = null in arcade mode, where `run` carries score, lives and power between stages. */
  constructor(public mission: MissionDef, public campaign: Campaign | null, missionIndex: number, public run: ArcadeRun | null = null) {
    const diff = DIFFICULTIES[campaign?.difficulty ?? 'gunship']
    this.world = new World(campaign?.loadout ?? ARCADE_LOADOUT, diff)
    if (run) this.world.arcade = new Arcade(run, this.world)
    this.world.scroll = mission.scroll
    this.world.hpScale = 1 + 0.22 * missionIndex
    this.world.creditScale = 1 + 0.3 * missionIndex
    this.world.ambient = AMBIENT[mission.biome] ?? null
    const L = new LevelScript(mission)
    mission.script(L)
    this.runner = new LevelRunner(L, this.world)
    this.bg = createBackground(mission.biome, missionIndex * 1013 + 7)
    this.world.player.entering = 1.1
    this.world.player.y = PH + 60
    this.lastHull = this.world.player.hull
    this.hud = {
      mission, radio: [], banner: { text: mission.name, sub: `Mission ${mission.num}`, t: 0 }, progress: 0,
      bank: campaign?.credits ?? 0, fps: 60, showFps: false, secretToast: null, specialHint: 0,
    }
    audio.music.play(mission.track, { fade: 1.5 })
    audio.music.setIntensity(2)
  }

  update(dt: number) {
    const w = this.world
    if (this.state === 'play' || this.state === 'outro') {
      if (this.state === 'play') this.runner.update(dt)
      w.update(dt)
      this.bg.update(dt, w.scroll)
    }
    const p = w.player
    if (p.hull < this.lastHull) this.hullDamage += this.lastHull - p.hull
    this.lastHull = p.hull
    this.hud.progress = this.runner.progress
    if (this.hud.specialHint > 0) this.hud.specialHint -= dt
    if (p.specialId && p.special >= p.specialCost && !w.flags.has('hinted_special')) { w.flags.add('hinted_special'); this.hud.specialHint = 4 }

    for (const ev of w.events.splice(0)) {
      switch (ev.type) {
        case 'radio': {
          const line: RadioLine = { who: ev.who, text: ev.text, tone: ev.tone ?? 'ally', t: w.time }
          this.hud.radio.push(line)
          if (this.hud.radio.length > 12) this.hud.radio.shift()
          audio.sfx('radio', { vol: 0.5 })
          audio.duck(0.6, 1.2)
          break
        }
        case 'banner': this.hud.banner = { text: ev.text, sub: ev.sub, t: w.time }; break
        case 'phase': this.bg.setPhase(ev.name); break
        case 'secret': this.hud.secretToast = { text: ev.text, t: w.time }; break
        case 'core': this.hud.secretToast = { text: `Data core recovered: ${coreName(ev.id)}`, t: w.time }; break
        case 'boss':
          this.hud.banner = { text: 'Warning', sub: ev.name, t: w.time }
          audio.sfx('boss_warning')
          break
        case 'bossDown': break
        case 'warp': this.warp = ev.to; break
        case 'dead': if (this.state === 'play') { this.state = 'lost'; audio.music.stop(2) } break
        case 'complete': break
      }
    }

    if (this.state === 'play' && this.runner.done && p.alive && !w.enemies.some((e) => !e.dead && !e.gone && !e.s.ignoreGate && e.layer === 'air')) {
      this.state = 'outro'
      this.outroT = 0
      for (const k of w.pickups.items) if (k.active) k.magnet = true
      // the fight is over: nothing may kill the player during the victory lap
      w.clearBullets(p.x, p.y, 2000)
      w.lasers.length = 0
      p.invuln = 99
      audio.sfx('mission_complete')
      audio.music.setIntensity(0)
      p.ai = () => ({ mx: 0, my: 0, fire: false, special: false })
    }
    if (this.state === 'outro') {
      this.outroT += dt
      if (this.outroT > 1.6) { p.vy = -900 * (this.outroT - 1.5); p.y += p.vy * dt; p.entering = 1 }
      if (this.outroT > 3.4) { this.state = 'won'; p.cleanup() }
    }
  }

  result(missionIndex: number): MissionResult {
    const s = this.world.stats
    const base = 400 + 250 * missionIndex
    const bonuses: { name: string; credits: number }[] = []
    const ground = s.groundTotal > 0 ? s.groundKills / s.groundTotal : 1
    if (s.groundTotal > 0 && ground >= 0.9) bonuses.push({ name: 'Demolition — 90% ground targets', credits: base })
    if (this.hullDamage <= 0) bonuses.push({ name: 'Untouchable — no hull damage', credits: Math.round(base * 1.5) })
    const acc = s.shotsFired > 0 ? s.shotsHit / s.shotsFired : 0
    if (acc >= 0.7 && s.shotsFired > 50) bonuses.push({ name: 'Marksman — 70% accuracy', credits: Math.round(base * 0.5) })
    if (s.maxChain >= 60) bonuses.push({ name: `Chain reaction — ${s.maxChain} chain`, credits: Math.round(base * 0.6) })
    for (const sec of s.secrets) bonuses.push({ name: `Secret — ${s.secretTexts[sec] ?? sec}`, credits: base })
    const reward = 1500 + 1000 * missionIndex
    const earned = s.creditsEarned
    const total = earned + reward + bonuses.reduce((a, b) => a + b.credits, 0)
    return {
      mission: this.mission, stats: s, score: this.world.score, earned, reward, bonuses, total,
      cores: s.cores, secrets: s.secrets, warp: this.warp, hullDamage: this.hullDamage,
    }
  }

  dispose() {
    this.world.player.cleanup()
  }
}

function coreName(id: string) {
  const it = Object.values(ITEM).find((i) => i.core === id)
  return it ? it.name : id
}
