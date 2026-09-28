// Recorded soundtrack player (tracks generated offline with Lyria, see tools/generate-music.py).
// Each track is decoded once and looped with a bar-aligned crossfade between the loop points computed
// by tools/music-loops.py, because generated songs end with a fade or a final hit.
// Intensity is expressed with a low-pass filter + level, so calm stretches sound distant and fights open up.

import type { Intensity, TrackId } from './types'

interface TrackMeta { loopStart: number; loopEnd: number; xfade: number; duration: number }

interface Voice {
  src: AudioBufferSourceNode
  gain: GainNode
}

interface Playing {
  id: TrackId
  buf: AudioBuffer
  meta: TrackMeta
  bus: GainNode
  filter: BiquadFilterNode
  voices: Voice[]
  /** Context time at which the current segment reaches loopEnd. */
  segEnd: number
  stopped: boolean
}

const BASE = `${import.meta.env.BASE_URL}music/`
/** Tracks are mastered to -16 LUFS; this sits them under the effects like the synth score did. */
const TRIM = 0.55
const LEVELS: Record<Intensity, { cutoff: number; gain: number }> = {
  0: { cutoff: 700, gain: 0.55 },
  1: { cutoff: 2200, gain: 0.78 },
  2: { cutoff: 18000, gain: 0.95 },
  3: { cutoff: 20000, gain: 1.05 },
}

export class StreamMusic {
  private metaReq: Promise<Record<string, TrackMeta> | null>
  private buffers = new Map<TrackId, Promise<AudioBuffer | null>>()
  private playing: Playing[] = []
  private want: TrackId | null = null
  private level: Intensity = 2

  constructor(private ctx: AudioContext, private out: AudioNode) {
    this.metaReq = fetch(`${BASE}tracks.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
  }

  /** Resolves false when the recorded track is unavailable, so the caller can fall back to synthesis. */
  async play(id: TrackId, fade: number): Promise<boolean> {
    this.want = id
    const meta = (await this.metaReq)?.[id]
    if (!meta) return false
    const buf = await this.load(id)
    if (!buf) return false
    if (this.want !== id) return true // superseded while loading
    this.fadeOutAll(fade)
    this.start(id, buf, meta, fade)
    this.prefetchNeighbours(id)
    return true
  }

  stop(fade: number): void {
    this.want = null
    this.fadeOutAll(fade)
  }

  setIntensity(level: Intensity): void {
    this.level = level
    const now = this.ctx.currentTime
    for (const p of this.playing) if (!p.stopped) this.applyLevel(p, now, 1.2)
  }

  /** Called from the engine's scheduler tick: queue the next loop segment ahead of time. */
  tick(): void {
    const now = this.ctx.currentTime
    for (const p of this.playing) {
      if (p.stopped) continue
      if (now > p.segEnd - 1.5) this.queueLoop(p)
    }
  }

  private load(id: TrackId): Promise<AudioBuffer | null> {
    let b = this.buffers.get(id)
    if (!b) {
      b = fetch(`${BASE}${id}.mp3`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status}`))))
        .then((ab) => this.ctx.decodeAudioData(ab))
        .catch(() => null)
      this.buffers.set(id, b)
      // decoded tracks are ~40 MB each: keep only a few around
      if (this.buffers.size > 3) {
        for (const k of this.buffers.keys()) {
          if (k !== id && k !== this.want && !this.playing.some((p) => p.id === k)) { this.buffers.delete(k); break }
        }
      }
    }
    return b
  }

  /** Warm the likely next tracks (boss after a mission, hangar after anything) so transitions are instant. */
  private prefetchNeighbours(id: TrackId) {
    const next: TrackId[] = id.startsWith('m') || id === 'secret' ? ['boss', 'hangar'] : id === 'hangar' ? [] : ['hangar']
    if (id === 'm7') next.unshift('final_boss')
    for (const n of next) setTimeout(() => void this.load(n), 4000)
  }

  private start(id: TrackId, buf: AudioBuffer, meta: TrackMeta, fade: number) {
    const ctx = this.ctx
    const now = ctx.currentTime + 0.05
    const bus = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.Q.value = 0.5
    const trim = ctx.createGain()
    trim.gain.value = TRIM
    bus.connect(filter).connect(trim).connect(this.out)
    const p: Playing = { id, buf, meta, bus, filter, voices: [], segEnd: 0, stopped: false }
    bus.gain.setValueAtTime(0, now)
    const lv = LEVELS[this.level]
    filter.frequency.setValueAtTime(lv.cutoff, now)
    bus.gain.linearRampToValueAtTime(lv.gain, now + Math.max(0.05, fade))
    const v = this.voice(p, 0, now, 1)
    p.voices.push(v)
    p.segEnd = now + meta.loopEnd
    this.playing.push(p)
  }

  private voice(p: Playing, offset: number, when: number, gain: number): Voice {
    const src = this.ctx.createBufferSource()
    src.buffer = p.buf
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(gain, when)
    src.connect(g).connect(p.bus)
    src.start(when, offset)
    return { src, gain: g }
  }

  private queueLoop(p: Playing) {
    const { loopStart, loopEnd } = p.meta
    const xfade = Math.max(0.25, p.meta.xfade) // short fade: hides any residual misalignment
    const at = p.segEnd
    const old = p.voices[p.voices.length - 1]
    old.gain.gain.setValueAtTime(1, at)
    old.gain.gain.linearRampToValueAtTime(0, at + xfade)
    old.src.stop(at + xfade + 0.05)
    const nv = this.voice(p, loopStart, at, 0)
    nv.gain.gain.linearRampToValueAtTime(1, at + xfade)
    p.voices = [nv]
    p.segEnd = at + (loopEnd - loopStart)
  }

  private applyLevel(p: Playing, now: number, over: number) {
    const lv = LEVELS[this.level]
    p.filter.frequency.cancelScheduledValues(now)
    p.filter.frequency.setTargetAtTime(lv.cutoff, now, over / 3)
    p.bus.gain.cancelScheduledValues(now)
    p.bus.gain.setTargetAtTime(lv.gain, now, over / 3)
  }

  private fadeOutAll(fade: number) {
    const now = this.ctx.currentTime
    for (const p of this.playing) {
      if (p.stopped) continue
      p.stopped = true
      p.bus.gain.cancelScheduledValues(now)
      p.bus.gain.setValueAtTime(p.bus.gain.value, now)
      p.bus.gain.linearRampToValueAtTime(0, now + Math.max(0.05, fade))
      for (const v of p.voices) v.src.stop(now + Math.max(0.05, fade) + 0.05)
      const bus = p.bus
      setTimeout(() => bus.disconnect(), (fade + 0.3) * 1000)
    }
    this.playing = this.playing.filter((p) => !p.stopped)
  }
}
