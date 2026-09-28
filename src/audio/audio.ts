// Public audio facade for the game. Everything is synthesized; nothing here allocates until unlock().

import { MASTER_TRIM, MUSIC_TRIM, type Mixer, createMixer, glideAll, holdAt } from './core'
import { type Arrangement, compose } from './composer'
import { type LoopVoice, startLoop } from './loops'
import { SongPlayer } from './player'
import { SFX, spawnSfx } from './sfx'
import { TRACKS } from './tracks'
import { StreamMusic } from './stream'
import type { Intensity, LoopHandle, LoopName, SfxName, SfxOpts, TrackId } from './types'

export type { Intensity, LoopHandle, LoopName, SfxName, SfxOpts, TrackId } from './types'

const MAX_VOICES = 24
const LOOP_CAP = 3
const LOOKAHEAD = 0.15
const TICK_MS = 25

interface Voice {
  name: SfxName
  prio: number
  start: number
  end: number
  ui: boolean
  gain: GainNode
  tail: AudioNode
}

interface TrackInst {
  id: TrackId
  player: SongPlayer
  /** set once fading out; the track is dropped after this time */
  endAt: number | null
}

const NOOP_LOOP: LoopHandle = { set() {}, stop() {} }

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))

class Engine {
  private ctx: AudioContext | null = null
  private mx: Mixer | null = null
  /** Recorded soundtrack; the procedural composer is only a fallback when a file can't load. */
  private stream: StreamMusic | null = null
  private vols = { master: 1, sfx: 1, music: 1 }
  private paused = false
  private voices: Voice[] = []
  private lastPlay = new Map<SfxName, number>()
  private loops = new Map<LoopName, LoopVoice[]>()
  private tracks: TrackInst[] = []
  private currentId: TrackId | null = null
  private level: Intensity = 1
  private duckUntil = 0
  private duckLevel = 1
  private arrs = new Map<TrackId, Arrangement>()

  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AC) return
      this.ctx = new AC({ latencyHint: 'interactive' })
      this.mx = createMixer(this.ctx, this.ctx.destination)
      this.applyVolumes()
      if (this.paused) this.applyPause(true)
      this.stream = new StreamMusic(this.ctx as AudioContext, this.mx.musicIn)
      setInterval(() => this.tick(), TICK_MS)
      if (this.currentId) { const id = this.currentId; this.currentId = null; this.play(id, 0.5) }
    }
    if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume()
  }

  // ------------------------------------------------------------ volumes / pause / duck

  setVolumes(v: { master?: number; sfx?: number; music?: number }): void {
    if (v.master !== undefined) this.vols.master = clamp01(v.master)
    if (v.sfx !== undefined) this.vols.sfx = clamp01(v.sfx)
    if (v.music !== undefined) this.vols.music = clamp01(v.music)
    this.applyVolumes()
  }

  /** Sliders are squared: 0.5 ≈ -12 dB, which feels like "half" far better than linear. */
  private applyVolumes(): void {
    const { ctx, mx } = this
    if (!ctx || !mx) return
    const now = ctx.currentTime
    glideAll([mx.master], MASTER_TRIM * this.vols.master ** 2, now, 0.03)
    glideAll(mx.sfxVol, this.vols.sfx ** 2, now, 0.03)
    glideAll(mx.musicVol, MUSIC_TRIM * this.vols.music ** 2, now, 0.03)
  }

  setPaused(p: boolean): void {
    if (p === this.paused) return
    this.paused = p
    this.applyPause(p)
  }

  private applyPause(p: boolean): void {
    const { ctx, mx } = this
    if (!ctx || !mx) return
    const now = ctx.currentTime
    glideAll(mx.sfxPause, p ? 0 : 1, now, 0.02)
    glideAll(mx.musicPause, p ? 0 : 1, now, p ? 0.03 : 0.08)
    if (p) {
      for (const v of this.voices.filter((x) => !x.ui)) this.kill(v, now)
      for (const tr of this.tracks) tr.player.halt(now)
    } else {
      for (const tr of this.tracks) tr.player.resume(now + 0.05)
    }
  }

  duck(amount: number, seconds: number): void {
    const { ctx, mx } = this
    if (!ctx || !mx) return
    const now = ctx.currentTime
    const a = clamp01(amount)
    if (a >= 1) {
      this.duckUntil = 0
      glideAll(mx.musicDuck, 1, now, 0.15)
      return
    }
    this.duckLevel = now < this.duckUntil ? Math.min(this.duckLevel, a) : a
    this.duckUntil = Math.max(this.duckUntil, now + Math.max(0, seconds))
    for (const g of mx.musicDuck) {
      holdAt(g.gain, now)
      g.gain.setTargetAtTime(this.duckLevel, now, 0.06)
      g.gain.setTargetAtTime(1, this.duckUntil, 0.25)
    }
  }

  // ------------------------------------------------------------ sfx

  sfx(name: SfxName, opts?: SfxOpts): void {
    const { ctx, mx } = this
    if (!ctx || !mx || ctx.state !== 'running') return
    const def = SFX[name]
    if (!def || (this.paused && !def.ui)) return
    const now = ctx.currentTime
    if (now - (this.lastPlay.get(name) ?? -1) < def.gap) return
    this.sweep(now)

    let same = 0
    let oldest: Voice | undefined
    for (const v of this.voices) {
      if (v.name !== name) continue
      same++
      if (!oldest || v.start < oldest.start) oldest = v
    }
    if (oldest && same >= def.cap) this.kill(oldest, now)
    if (this.voices.length >= MAX_VOICES) {
      let victim: Voice | undefined
      for (const v of this.voices) {
        if (v.prio > def.prio) continue
        if (!victim || v.prio < victim.prio || (v.prio === victim.prio && v.start < victim.start)) victim = v
      }
      if (!victim) return
      this.kill(victim, now)
    }

    this.lastPlay.set(name, now)
    let pitch = opts?.pitch ?? 1
    if (def.jitter) pitch *= 1 + (Math.random() * 2 - 1) * def.jitter
    const vol = Math.max(0, Math.min(1.5, opts?.vol ?? 1))
    const s = spawnSfx(mx, name, now + 0.005, vol, pitch, opts?.pan ?? 0, Math.random)
    this.voices.push({ name, prio: def.prio, start: now, end: now + s.dur + 0.1, ui: !!def.ui, gain: s.gain, tail: s.tail })
  }

  private kill(v: Voice, now: number): void {
    const i = this.voices.indexOf(v)
    if (i >= 0) this.voices.splice(i, 1)
    holdAt(v.gain.gain, now)
    v.gain.gain.setTargetAtTime(0, now, 0.012)
    setTimeout(() => v.tail.disconnect(), 150)
  }

  private sweep(now: number): void {
    if (this.voices.length === 0) return
    this.voices = this.voices.filter((v) => {
      if (v.end > now) return true
      v.tail.disconnect()
      return false
    })
  }

  loop(name: LoopName, opts?: { vol?: number; pitch?: number }): LoopHandle {
    const { ctx, mx } = this
    if (!ctx || !mx || ctx.state !== 'running') return NOOP_LOOP
    const list = this.loops.get(name) ?? []
    this.loops.set(name, list)
    if (list.length >= LOOP_CAP) list.shift()?.stop()
    const v = startLoop(ctx, mx.sfxIn, name, clamp01(opts?.vol ?? 1), opts?.pitch ?? 1)
    list.push(v)
    return {
      set: (p) => v.set(p.vol, p.pitch),
      stop: () => {
        v.stop()
        const i = list.indexOf(v)
        if (i >= 0) list.splice(i, 1)
      },
    }
  }

  // ------------------------------------------------------------ music

  play(id: TrackId, fade = 1.2): void {
    if (id === this.currentId) return
    this.currentId = id
    if (!this.ctx || !this.mx) return
    this.fadeOutAll(fade)
    const stream = this.stream
    if (!stream) { this.startTrack(id, fade); return }
    void stream.play(id, fade).then((ok) => {
      if (!ok && this.currentId === id) this.startTrack(id, fade)
    })
  }

  stop(fade = 1): void {
    this.currentId = null
    this.fadeOutAll(fade)
    this.stream?.stop(fade)
  }

  setIntensity(level: Intensity): void {
    this.level = level
    this.stream?.setIntensity(level)
  }

  current(): TrackId | null {
    return this.currentId
  }

  private arrangement(id: TrackId): Arrangement {
    let a = this.arrs.get(id)
    if (!a) {
      a = compose(TRACKS[id])
      this.arrs.set(id, a)
    }
    return a
  }

  private startTrack(id: TrackId, fade: number): void {
    const { ctx, mx } = this
    if (!ctx || !mx) return
    const spec = TRACKS[id]
    this.level = spec.intensity
    const start = ctx.currentTime + 0.06
    const player = new SongPlayer({
      ctx, out: mx.musicIn, wet: mx.musicWetIn, spec, arr: this.arrangement(id), start,
      level: () => this.level,
    })
    player.fade(1, ctx.currentTime, Math.max(0.05, fade), 0)
    if (this.paused) player.halt(ctx.currentTime)
    this.tracks.push({ id, player, endAt: null })
  }

  private fadeOutAll(fade: number): void {
    const ctx = this.ctx
    if (!ctx) return
    const now = ctx.currentTime
    for (const tr of this.tracks) {
      if (tr.endAt !== null) continue
      tr.player.fade(0, now, fade)
      tr.endAt = now + Math.max(0.01, fade) + 0.1
    }
  }

  private tick(): void {
    const ctx = this.ctx
    if (!ctx || ctx.state !== 'running') return
    const now = ctx.currentTime
    this.stream?.tick()
    if (!this.paused) {
      for (const tr of this.tracks) {
        if (tr.player.nextTime < now - 0.1) tr.player.catchUp(now + 0.02)
        tr.player.scheduleUntil(now + LOOKAHEAD)
      }
    }
    if (this.tracks.some((tr) => tr.endAt !== null && now > tr.endAt)) {
      this.tracks = this.tracks.filter((tr) => {
        if (tr.endAt === null || now <= tr.endAt) return true
        tr.player.dispose()
        return false
      })
    }
    this.sweep(now)
  }
}

const engine = new Engine()

export const audio = {
  /** Create/resume AudioContext. Called on every user gesture; must be idempotent and cheap. */
  unlock: (): void => engine.unlock(),
  setVolumes: (v: { master?: number; sfx?: number; music?: number }): void => engine.setVolumes(v),
  /** pan -1..1 (map from screen x), vol 0..1 multiplier, pitch multiplier (1 = normal). Must be safe to call before unlock (no-op). */
  sfx: (name: SfxName, opts?: SfxOpts): void => engine.sfx(name, opts),
  loop: (name: LoopName, opts?: { vol?: number; pitch?: number }): LoopHandle => engine.loop(name, opts),
  music: {
    /** Crossfade from current; same track = no-op. Resets intensity to the track's default (menus 2, missions 1). */
    play: (track: TrackId, opts?: { fade?: number }): void => engine.play(track, opts?.fade),
    stop: (fade?: number): void => engine.stop(fade),
    /** 0 = ambient/sparse, 1 = combat, 2 = intense, 3 = climax. Layers fade in/out on bar boundaries. */
    setIntensity: (level: Intensity): void => engine.setIntensity(level),
    current: (): TrackId | null => engine.current(),
  },
  /** Temporarily lower music (e.g. during radio chatter / pause). 1 = none. */
  duck: (amount: number, seconds: number): void => engine.duck(amount, seconds),
  /** Pauses music scheduling + mutes sfx while paused menu open (ui_* sfx still play). */
  setPaused: (paused: boolean): void => engine.setPaused(paused),
}
