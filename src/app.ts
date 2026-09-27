import { Renderer, drawWorld } from './render/renderer'
import { drawHud, drawHudOverlays } from './render/hud'
import { input } from './core/input'
import { audio } from './audio/audio'
import { Session, type MissionResult } from './game/session'
import { MISSIONS } from './data/missions'
import { newCampaign, type Campaign, type DifficultyId, DIFFICULTIES } from './game/campaign'
import { nextMissionId, missionIndex, applyResult } from './game/progress'
import * as save from './game/save'
import type { Settings, Records } from './game/save'
import { Nav } from './ui/nav'
import { titleScreen, briefingScreen, pauseScreen, failedScreen, resultsScreen, endingScreen, settingsModal, difficultyModal } from './ui/screens'
import { hangarScreen } from './ui/hangar'
import { Attract } from './ui/attract'
import { SCREEN_W, SCREEN_H, FIELD_X, PW, PH } from './game/consts'
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
    this.renderer = new Renderer(document.getElementById('game') as HTMLCanvasElement)
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

  launch() {
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
    this.render()
    this.perf.render = this.perf.render * 0.95 + (performance.now() - t1) * 0.05
  }

  private render() {
    const r = this.renderer
    const c = r.begin()
    const s = this.session
    if (s && (this.screen?.backdrop === 'game')) {
      s.hud.bank = this.campaign?.credits ?? 0
      drawHud(c, s.world, s.hud)
      r.drawField(s.world, s.bg)
      drawHudOverlays(r.begin(), s.world, s.hud)
    } else if (this.attract && this.screen?.backdrop === 'attract') {
      c.fillStyle = '#f4f0e6'
      c.fillRect(0, 0, SCREEN_W, SCREEN_H)
      this.attract.draw(c)
    } else {
      c.fillStyle = '#f4f0e6'
      c.fillRect(0, 0, SCREEN_W, SCREEN_H)
    }
    void FIELD_X; void PW; void PH; void drawWorld
  }
}
