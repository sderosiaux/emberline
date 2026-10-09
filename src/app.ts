import { Renderer } from './render/renderer'
import { drawHud, drawHudOverlays, drawHudIdle } from './render/hud'
import { input } from './core/input'
import { audio } from './audio/audio'
import { Session, type MissionResult } from './game/session'
import { MISSIONS, ARCADE_STAGES } from './data/missions'
import { newCampaign, type Campaign, type DifficultyId, DIFFICULTIES } from './game/campaign'
import { nextMissionId, missionIndex, applyResult } from './game/progress'
import * as save from './game/save'
import type { Settings, Records } from './game/save'
import { Nav } from './ui/nav'
import { arcadeStageScreen, arcadeOverScreen } from './ui/arcade-screens'
import { newArcadeRun, type ArcadeRun } from './game/arcade'
import { titleScreen, briefingScreen, pauseScreen, failedScreen, resultsScreen, endingScreen, settingsModal, difficultyModal } from './ui/screens'
import { hangarScreen } from './ui/hangar'
import { Attract } from './ui/attract'
import { SCREEN_W, SCREEN_H } from './game/consts'
import { T } from './ui/theme'
import { installDebug } from './debug'

export interface Screen {
  el: HTMLElement
  nav?: Nav
  update?(dt: number): void
  dispose?(): void
  /** What the canvas shows behind this screen. */
  backdrop: 'attract' | 'game' | 'paper'
}

export class App {
  renderer: Renderer
  ui: HTMLElement
  settings: Settings
  records: Records
  campaign: Campaign | null
  session: Session | null = null
  screen: Screen | null = null
  modal: Screen | null = null
  attract: Attract | null = null
  paused = false
  private last = 0
  private fpsAcc = 0
  private fpsN = 0
  fps = 60
  /** Rolling average ms per frame spent in simulation / rendering (debug readout). */
  perf = { update: 0, render: 0 }
  debug = false
  slowmo = 1
  missionStartCampaign: Campaign | null = null

  constructor() {
    this.renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement, document.getElementById('hud') as HTMLCanvasElement)
    this.ui = document.getElementById('ui')!
    this.settings = save.loadSettings()
    this.records = save.loadRecords()
    this.campaign = save.loadCampaign()
    this.applySettings()
    const fit = () => {
      const s = Math.min(window.innerWidth / SCREEN_W, window.innerHeight / SCREEN_H)
      this.ui.style.transform = `translate(${(-SCREEN_W * s) / 2}px, ${(-SCREEN_H * s) / 2}px) scale(${s})`
    }
    fit()
    window.addEventListener('resize', fit)
    const unlock = () => audio.unlock()
    window.addEventListener('keydown', unlock)
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('blur', () => { if (this.session && this.session.state === 'play' && !this.paused) this.pause() })
    // Hidden tab: stop the music synth too, it is the most expensive thing running.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.session && this.session.state === 'play' && !this.paused) this.pause()
        audio.setPaused(true)
      } else if (!this.paused) audio.setPaused(false)
    })
    this.debug = new URLSearchParams(location.search).has('debug') || import.meta.env.DEV && new URLSearchParams(location.search).has('dev')
    if (this.debug) installDebug(this)
    this.toTitle()
    requestAnimationFrame((t) => this.frame(t))
  }

  applySettings() {
    const s = this.settings
    audio.setVolumes({ master: s.master, music: s.music, sfx: s.sfx })
    input.alwaysFire = s.alwaysFire
  }

  saveSettings() { save.saveSettings(this.settings); this.applySettings() }

  // ───────────── screen management ─────────────

  show(s: Screen) {
    this.closeModal()
    this.screen?.dispose?.()
    this.screen?.el.remove()
    this.screen = s
    this.ui.append(s.el)
    input.clearMenu()
    s.nav?.first()
    if (s.backdrop === 'attract' && !this.attract) this.attract = new Attract()
    if (s.backdrop !== 'attract') this.attract = null
  }

  openModal(m: Screen) {
    this.closeModal()
    this.modal = m
    this.ui.append(m.el)
    input.clearMenu()
    m.nav?.first()
  }

  closeModal() {
    if (!this.modal) return
    this.modal.dispose?.()
    this.modal.el.remove()
    this.modal = null
    input.clearMenu()
  }

  // ───────────── flow ─────────────

  toTitle() {
    this.arcade = null
    this.endSession()
    audio.music.play('title', { fade: 1.5 })
    audio.music.setIntensity(2)
    this.show(titleScreen(this))
  }

  chooseDifficulty() {
    this.openModal(difficultyModal(this, (d) => this.newGame(d)))
  }

  newGame(d: DifficultyId) {
    this.campaign = newCampaign(d)
    save.saveCampaign(this.campaign)
    this.toBriefing()
  }

  continueGame() {
    if (!this.campaign) return
    if (this.campaign.finished) { this.toEnding(); return }
    this.toHangar()
  }

  toBriefing() {
    const c = this.campaign!
    const id = nextMissionId(c)
    if (!id) { this.toEnding(); return }
    audio.music.play('hangar', { fade: 1 })
    audio.music.setIntensity(1)
    this.show(briefingScreen(this, MISSIONS[id], c))
  }

  toHangar() {
    this.endSession()
    audio.music.play('hangar', { fade: 1.2 })
    audio.music.setIntensity(2)
    this.show(hangarScreen(this))
  }

  /** Arcade run in progress (null when playing the campaign). */
  arcade: ArcadeRun | null = null

  startArcade() {
    this.arcade = newArcadeRun()
    this.launchArcadeStage()
  }

  launchArcadeStage() {
    const run = this.arcade!
    this.endSession()
    this.session = new Session(MISSIONS[ARCADE_STAGES[run.stage]], null, run.stage, run)
    this.applySessionSettings()
    this.paused = false
    this.show({ el: document.createElement('div'), backdrop: 'game' })
    document.body.classList.add('hide-cursor')
  }

  private applySessionSettings() {
    const s = this.session!
    s.hud.showFps = this.settings.showFps
    s.world.shakeScale = this.settings.shake === 'full' ? 1 : this.settings.shake === 'reduced' ? 0.4 : 0
    s.world.parts.density = this.settings.effects === 'high' ? 1 : 0.5
  }

  private arcadeRecord() {
    const run = this.arcade!
    if (run.score > this.records.arcadeBest) { this.records.arcadeBest = run.score; save.saveRecords(this.records) }
  }

  /** Continue after game over: the run goes on, the score counter resets (arcade convention). */
  continueArcade() {
    const run = this.arcade!
    run.continues++
    run.score = 0
    run.lives = 3
    run.bombs = 3
    this.launchArcadeStage()
  }

  launch() {
    if (this.arcade) { this.launchArcadeStage(); return }
    const c = this.campaign!
    const id = nextMissionId(c)
    if (!id) return
    this.endSession()
    this.missionStartCampaign = structuredClone(c)
    this.session = new Session(MISSIONS[id], c, missionIndex(c))
    this.session.hud.showFps = this.settings.showFps
    this.session.world.shakeScale = this.settings.shake === 'full' ? 1 : this.settings.shake === 'reduced' ? 0.4 : 0
    this.session.world.parts.density = this.settings.effects === 'high' ? 1 : 0.5
    this.paused = false
    this.show({ el: document.createElement('div'), backdrop: 'game' })
    document.body.classList.add('hide-cursor')
  }

  retry() { this.launch() }

  leaveArcade() {
    if (this.arcade) this.arcadeRecord()
    this.arcade = null
    this.toTitle()
  }

  pause() {
    if (!this.session) return
    if (this.paused) { if (!this.modal) this.openModal(pauseScreen(this)); return }
    this.paused = true
    audio.setPaused(true)
    this.openModal(pauseScreen(this))
  }

  resume() {
    this.paused = false
    audio.setPaused(false)
    this.closeModal()
  }

  abandon() {
    this.resume()
    if (this.arcade) { this.leaveArcade(); return }
    this.campaign!.stats.deaths++
    save.saveCampaign(this.campaign!)
    this.toHangar()
  }

  private endSession() {
    if (this.session) { this.session.dispose(); this.session = null }
    audio.setPaused(false)
    this.paused = false
    document.body.classList.remove('hide-cursor')
  }

  private onWon() {
    const s = this.session!
    if (this.arcade) {
      const run = this.arcade
      run.stage++
      this.arcadeRecord()
      this.endSession()
      audio.music.play(run.stage >= ARCADE_STAGES.length ? 'ending' : 'hangar', { fade: 2 })
      this.show(arcadeStageScreen(this, run, s.mission.name, run.stage >= ARCADE_STAGES.length))
      return
    }
    const c = this.campaign!
    const r: MissionResult = s.result(missionIndex(c))
    this.campaign = applyResult(c, r)
    const rec = this.records
    rec.missionBest[r.mission.id] = Math.max(rec.missionBest[r.mission.id] ?? 0, r.score)
    rec.bestScore = Math.max(rec.bestScore, this.campaign.score)
    rec.secretsEver = [...new Set([...rec.secretsEver, ...r.secrets])]
    save.saveRecords(rec)
    save.saveCampaign(this.campaign)
    this.endSession()
    audio.music.play('hangar', { fade: 2 })
    this.show(resultsScreen(this, r, this.campaign))
  }

  private onLost() {
    if (this.arcade) {
      this.arcadeRecord()
      document.body.classList.remove('hide-cursor')
      this.show({ ...arcadeOverScreen(this, this.arcade), backdrop: 'game' })
      return
    }
    this.campaign!.stats.deaths++
    save.saveCampaign(this.campaign!)
    document.body.classList.remove('hide-cursor')
    this.show({ ...failedScreen(this), backdrop: 'game' })
  }

  afterResults() {
    const c = this.campaign!
    if (c.finished) this.toEnding()
    else this.toHangar()
  }

  toEnding() {
    this.endSession()
    const c = this.campaign!
    const rec = this.records
    if (!rec.completedDifficulties.includes(c.difficulty)) rec.completedDifficulties.push(c.difficulty)
    save.saveRecords(rec)
    audio.music.play('ending', { fade: 2 })
    this.show(endingScreen(this, c))
  }

  openSettings() { this.openModal(settingsModal(this)) }

  resetSave() {
    save.resetAll()
    this.campaign = null
    this.records = save.loadRecords()
    this.settings = save.loadSettings()
    this.applySettings()
    this.toTitle()
  }

  emberlineUnlocked() { return this.records.completedDifficulties.length > 0 }
  difficulties() { return Object.values(DIFFICULTIES).filter((d) => d.id !== 'emberline' || this.emberlineUnlocked()) }

  // ───────────── loop ─────────────

  private frame(t: number) {
    requestAnimationFrame((tt) => this.frame(tt))
    // 120 Hz displays would otherwise render twice as often for no gameplay benefit.
    const cap = this.settings.fpsCap
    if (cap > 0 && this.last && t - this.last < 1000 / cap - 2) return
    let dt = this.last ? (t - this.last) / 1000 : 1 / 60
    this.last = t
    dt = Math.min(dt, 1 / 20)
    this.fpsAcc += dt; this.fpsN++
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsN / this.fpsAcc; this.fpsAcc = 0; this.fpsN = 0 }
    input.poll(dt)

    const wasPaused = this.paused
    const modalBefore = this.modal
    const nav = this.modal?.nav ?? this.screen?.nav
    nav?.update()
    this.modal?.update?.(dt)
    this.screen?.update?.(dt)

    const s = this.session
    if (s && this.screen?.backdrop === 'game') {
      if (!this.modal) input.clearMenu() // menu keys pressed while flying must not click the next screen
      if (input.pause && !wasPaused && s.state === 'play' && !this.modal) this.pause()
      else if (input.pause && wasPaused && this.paused && this.modal === modalBefore) this.resume()
      else if (!this.paused) {
        const step = dt * this.slowmo
        const n = step > 1 / 50 ? 2 : 1
        const t0 = performance.now()
        for (let i = 0; i < n; i++) s.update(step / n)
        this.perf.update = this.perf.update * 0.95 + (performance.now() - t0) * 0.05
        s.hud.fps = this.fps
        if (s.state === 'won') this.onWon()
        else if (s.state === 'lost' && !this.screen.el.classList.contains('failed')) this.onLost()
      }
    } else if (this.attract) {
      this.attract.update(dt)
    }
    const t1 = performance.now()
    this.render(dt)
    this.perf.render = this.perf.render * 0.95 + (performance.now() - t1) * 0.05
  }

  private hudT = 0
  private riftLook = false
  private hudKey = ''
  private fieldPausedDrawn = false

  private render(dt: number) {
    const r = this.renderer
    const s = this.session
    const mode = s && this.screen?.backdrop === 'game' ? 'game' : this.attract && this.screen?.backdrop === 'attract' ? 'attract' : 'paper'
    const key = `${mode}|${r.generation}`
    const hudStale = key !== this.hudKey
    this.hudKey = key
    r.showField(mode !== 'paper')
    if (mode === 'game' && s) {
      s.hud.bank = this.arcade ? this.records.arcadeBest : this.campaign?.credits ?? 0
      // the Rift: the whole playfield flips into a negative, red-shifted reality (GPU-composited CSS filter, no per-pixel cost)
      const rift = !!s.world.arcade?.inRift
      if (rift !== this.riftLook) { this.riftLook = rift; r.canvas.style.filter = rift ? 'invert(1) hue-rotate(160deg) saturate(1.35) contrast(1.05)' : '' }
      // Side panels change slowly: 20 Hz is plenty and saves a full-screen repaint per frame.
      this.hudT -= dt
      if (hudStale || this.hudT <= 0 || this.paused) {
        if (!(this.paused && this.fieldPausedDrawn)) drawHud(r.beginHud(), s.world, s.hud)
        this.hudT = 1 / 20
      }
      if (this.paused && this.fieldPausedDrawn) return
      r.drawField(s.world, s.bg)
      drawHudOverlays(r.begin(), s.world, s.hud)
      this.fieldPausedDrawn = this.paused
      return
    }
    this.fieldPausedDrawn = false
    if (this.riftLook) { this.riftLook = false; r.canvas.style.filter = '' }
    if (hudStale) {
      const h = r.beginHud()
      h.fillStyle = T.paper
      h.fillRect(0, 0, SCREEN_W, SCREEN_H)
      if (mode === 'attract') drawHudIdle(h)
    }
    if (mode === 'attract' && this.attract) this.attract.draw(r.begin())
  }
}
