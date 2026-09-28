// Offline rendering through the exact realtime graph (mixer + master chain). Used by tools/ for QA.

import { MUSIC_TRIM, createMixer, makeRng } from './core'
import { type Layer, compose } from './composer'
import { startLoop } from './loops'
import { SongPlayer } from './player'
import type { LoopSample, Sample } from './samples'
import { spawnSample, spawnSfx } from './sfx'
import { TRACKS } from './tracks'
import type { LoopName, SfxName, SfxOpts, TrackId } from './types'

const SR = 44100

/** The master compressor ramps its gain in from silence when a context starts; sounds are
 *  triggered after it settles so measurements match a context that has been running. */
const SETTLE = 1

export async function renderSfx(name: SfxName, opts: SfxOpts = {}, seconds = 5.5): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (seconds + SETTLE)), SR)
  const mx = createMixer(ctx, ctx.destination)
  spawnSfx(mx, name, SETTLE, opts.vol ?? 1, opts.pitch ?? 1, opts.pan ?? 0, makeRng(7))
  return ctx.startRendering()
}

/** Same as renderSfx but plays a recorded variant instead of the synthesized recipe. */
export async function renderSample(name: SfxName, sample: Sample, opts: SfxOpts = {}, seconds = 5.5): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * (seconds + SETTLE)), SR)
  const mx = createMixer(ctx, ctx.destination)
  spawnSample(mx, name, sample, SETTLE, opts.vol ?? 1, opts.pitch ?? 1, opts.pan ?? 0)
  return ctx.startRendering()
}

/** Fire `count` triggers of one sfx `interval` apart (stress: stacking, no voice limiter involved). */
export async function renderSfxBurst(name: SfxName, count: number, interval: number): Promise<AudioBuffer> {
  const seconds = count * interval + 4 + SETTLE
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR)
  const mx = createMixer(ctx, ctx.destination)
  const r = makeRng(11)
  for (let i = 0; i < count; i++) spawnSfx(mx, name, SETTLE + i * interval, 1, 1 + (r() - 0.5) * 0.1, (r() - 0.5) * 1.6, r)
  return ctx.startRendering()
}

export async function renderLoop(name: LoopName, seconds = 3, pitch = 1, sample?: LoopSample | null): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR)
  const mx = createMixer(ctx, ctx.destination)
  startLoop(ctx, mx.sfxIn, name, 1, pitch, sample)
  return ctx.startRendering()
}

export async function renderTrack(id: TrackId, seconds: number, level: number | ((bar: number) => number), solo?: Layer[]): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR)
  const mx = createMixer(ctx, ctx.destination)
  mx.musicVol.forEach((g) => (g.gain.value = MUSIC_TRIM))
  const spec = TRACKS[id]
  const player = new SongPlayer({
    ctx, out: mx.musicIn, wet: mx.musicWetIn, spec, arr: compose(spec), start: 0.05,
    level: typeof level === 'number' ? () => level : level, solo,
  })
  // Schedule in slices like the realtime lookahead does, so the graph only ever holds the next
  // ~0.6 s of notes (keeps render time representative of realtime CPU cost).
  const slice = 0.5
  const until = seconds - 0.5
  player.scheduleUntil(Math.min(until, slice + 0.1))
  for (let t = slice; t < until; t += slice) {
    const at = t
    void ctx.suspend(at).then(() => {
      player.scheduleUntil(Math.min(until, at + slice + 0.1))
      return ctx.resume()
    })
  }
  return ctx.startRendering()
}

export interface Stats {
  peak: number
  rms: number
  /** loudest 400 ms window RMS */
  rmsMax: number
  nan: boolean
  /** fraction of samples above 0.95 */
  hot: number
}

export function analyze(buf: AudioBuffer): Stats {
  let peak = 0
  let sum = 0
  let nan = false
  let hot = 0
  const n = buf.length
  const win = Math.floor(buf.sampleRate * 0.4)
  let rmsMax = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch)
    let wsum = 0
    for (let i = 0; i < n; i++) {
      const x = d[i]
      if (Number.isNaN(x)) {
        nan = true
        continue
      }
      const a = Math.abs(x)
      if (a > peak) peak = a
      if (a > 0.95) hot++
      const sq = x * x
      sum += sq
      wsum += sq
      if (i >= win) {
        const y = d[i - win]
        if (!Number.isNaN(y)) wsum -= y * y
      }
      if (i >= win && i % 512 === 0) rmsMax = Math.max(rmsMax, Math.sqrt(Math.max(0, wsum) / win))
    }
    if (n < win) rmsMax = Math.max(rmsMax, Math.sqrt(wsum / Math.max(1, n)))
  }
  const total = n * buf.numberOfChannels
  return { peak, rms: Math.sqrt(sum / total), rmsMax, nan, hot: hot / total }
}
