// Recorded sound effects, designed offline by tools/generate-sfx.py and levelled against the synth mix by
// tools/sfx-calibrate.py. Everything is small, so the whole bank is fetched and decoded right at unlock.
// Anything that fails to load (or hasn't finished yet) falls back to the synthesized recipe.

import type { LoopName, SfxName } from './types'

interface Manifest {
  sfx: Partial<Record<SfxName, { files: string[]; gain: number }>>
  loops: Partial<Record<LoopName, { file: string; loopStart: number; loopEnd: number; gain: number }>>
}

export interface Sample {
  buf: AudioBuffer
  /** level trim from calibration, applied on the voice gain */
  gain: number
}

export interface LoopSample extends Sample {
  loopStart: number
  loopEnd: number
}

export const SFX_BASE = `${import.meta.env.BASE_URL}sfx/`

export class SampleBank {
  private sfx = new Map<SfxName, { bufs: AudioBuffer[]; gain: number }>()
  private loops = new Map<LoopName, LoopSample>()
  private last = new Map<SfxName, AudioBuffer>()
  readonly ready: Promise<void>

  constructor(ctx: BaseAudioContext, base = SFX_BASE) {
    this.ready = this.load(ctx, base)
  }

  /** A random variant, never the same one twice in a row. */
  pick(name: SfxName, rnd: () => number): Sample | null {
    const s = this.sfx.get(name)
    if (!s) return null
    let buf = s.bufs[Math.floor(rnd() * s.bufs.length)]
    if (s.bufs.length > 1 && buf === this.last.get(name)) buf = s.bufs[(s.bufs.indexOf(buf) + 1) % s.bufs.length]
    this.last.set(name, buf)
    return { buf, gain: s.gain }
  }

  variants(name: SfxName): Sample[] {
    const s = this.sfx.get(name)
    return s ? s.bufs.map((buf) => ({ buf, gain: s.gain })) : []
  }

  loop(name: LoopName): LoopSample | null {
    return this.loops.get(name) ?? null
  }

  private async load(ctx: BaseAudioContext, base: string): Promise<void> {
    const man = await fetch(`${base}manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : null))
      .catch(() => null)
    if (!man) return
    const decode = (file: string): Promise<AudioBuffer | null> =>
      fetch(base + file)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`${r.status} ${file}`))))
        .then((ab) => ctx.decodeAudioData(ab))
        .catch(() => null)
    const sfx = Object.entries(man.sfx).map(async ([name, e]) => {
      if (!e) return
      const bufs = (await Promise.all(e.files.map(decode))).filter((b): b is AudioBuffer => b !== null)
      if (bufs.length) this.sfx.set(name as SfxName, { bufs, gain: e.gain })
    })
    const loops = Object.entries(man.loops).map(async ([name, e]) => {
      if (!e) return
      const buf = await decode(e.file)
      if (buf) this.loops.set(name as LoopName, { buf, gain: e.gain, loopStart: e.loopStart, loopEnd: e.loopEnd })
    })
    await Promise.all([...sfx, ...loops])
  }
}
