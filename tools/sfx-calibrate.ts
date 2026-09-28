// Loudness of every sfx/loop as the player hears it (offline, through the real master chain, game vol 1):
// the synthesized recipe vs the recorded sample at its current manifest gain. Driven by tools/sfx-calibrate.py.

import { renderLoop, renderSample, renderSfx } from '../src/audio/offline'
import { SampleBank } from '../src/audio/samples'
import { SFX } from '../src/audio/sfx'
import type { LoopName, SfxName } from '../src/audio/types'

interface Row { name: string; loop: boolean; synth: number; sample: number | null; variants: number[] }

const status = document.getElementById('status') as HTMLElement

/** BS.1770 K-weighting (44.1 kHz coefficients) then the loudest 50 ms window, in dB. */
function loudness(buf: AudioBuffer, from = 0): number {
  const n = buf.length
  const pow = new Float64Array(n)
  const stages = [
    { b: [1.53090959, -2.65116903, 1.16916686], a: [-1.66375011, 0.71265753] },
    { b: [1.0, -2.0, 1.0], a: [-1.98916967, 0.98919506] },
  ]
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    let x: Float64Array = Float64Array.from(buf.getChannelData(ch))
    for (const { b, a } of stages) {
      const y = new Float64Array(n)
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0
      for (let i = 0; i < n; i++) {
        const v = b[0] * x[i] + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2
        x2 = x1; x1 = x[i]; y2 = y1; y1 = v
        y[i] = v
      }
      x = y
    }
    for (let i = 0; i < n; i++) pow[i] += x[i] * x[i]
  }
  const win = Math.floor(buf.sampleRate * 0.05)
  let sum = 0
  let best = 0
  const start = Math.floor(from * buf.sampleRate)
  for (let i = start; i < n; i++) {
    sum += pow[i]
    if (i - start >= win) sum -= pow[i - win]
    if (i - start >= win - 1) best = Math.max(best, sum / win)
  }
  return 10 * Math.log10(best + 1e-12) - 0.691
}

const powMean = (dbs: number[]): number => 10 * Math.log10(dbs.reduce((s, d) => s + 10 ** (d / 10), 0) / dbs.length)

async function main(): Promise<void> {
  const bank = new SampleBank(new OfflineAudioContext(1, 1, 44100))
  await bank.ready
  const rows: Row[] = []
  for (const name of Object.keys(SFX) as SfxName[]) {
    status.textContent = name
    // renders start after a 1 s settle (see offline.ts): measure from there
    const synth = loudness(await renderSfx(name, {}, 4), 1)
    const variants: number[] = []
    for (const v of bank.variants(name)) variants.push(loudness(await renderSample(name, v, {}, v.buf.duration + 0.3), 1))
    rows.push({ name, loop: false, synth, sample: variants.length ? powMean(variants) : null, variants })
  }
  for (const name of ['beam', 'charge', 'alarm'] as LoopName[]) {
    const s = bank.loop(name)
    // steady state only: skip the fade-in and, for charge, the rising intro
    const synth = loudness(await renderLoop(name, 4), 2)
    const sample = s ? loudness(await renderLoop(name, 4, 1, s), 2) : null
    rows.push({ name, loop: true, synth, sample, variants: sample === null ? [] : [sample] })
  }
  status.textContent = 'done'
  const w = window as unknown as { __results: Row[]; __done: boolean }
  w.__results = rows
  w.__done = true
}

main().catch((e: unknown) => {
  status.textContent = `error: ${String(e)}`
  const w = window as unknown as { __error: string; __done: boolean }
  w.__error = String((e as Error)?.stack ?? e)
  w.__done = true
})
