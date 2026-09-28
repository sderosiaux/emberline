// Renders every sfx, loop and track offline through the real master chain and reports levels.
// Query params: ?only=sfx,samples,bursts,loops,tracks,layers,perf,dump  ?secs=N (track length)  ?track=id (single track)
// perf = offline render speed (CPU proxy); dump = composed chords/bass/melody per bar as text.

import { type Stats, analyze, renderLoop, renderSample, renderSfx, renderSfxBurst, renderTrack } from '../src/audio/offline'
import { SampleBank } from '../src/audio/samples'
import { SFX } from '../src/audio/sfx'
import { TRACKS } from '../src/audio/tracks'
import { compose } from '../src/audio/composer'
import type { Layer } from '../src/audio/composer'
import type { LoopName, SfxName, TrackId } from '../src/audio/types'

interface Row extends Stats {
  item: string
  ok: boolean
  why: string
}

const q = new URLSearchParams(location.search)
const only = new Set((q.get('only') ?? 'sfx,samples,bursts,loops,tracks').split(','))
const secs = Number(q.get('secs') ?? 60)
const trackIds = q.get('track') ? [q.get('track') as TrackId] : (Object.keys(TRACKS) as TrackId[])
const rows: Row[] = []
const body = document.querySelector('tbody') as HTMLTableSectionElement
const status = document.getElementById('status') as HTMLElement

function verdict(s: Stats, minRms: number): { ok: boolean; why: string } {
  if (s.nan) return { ok: false, why: 'NaN' }
  if (s.peak >= 0.99) return { ok: false, why: 'clip' }
  if (s.rms < minRms) return { ok: false, why: 'silent' }
  return { ok: true, why: 'ok' }
}

function add(item: string, s: Stats, minRms = 1e-4): void {
  const v = verdict(s, minRms)
  rows.push({ item, ...s, ...v })
  const tr = document.createElement('tr')
  const f = (x: number): string => x.toFixed(4)
  tr.innerHTML = `<td>${item}</td><td>${f(s.peak)}</td><td>${f(s.rms)}</td><td>${f(s.rmsMax)}</td><td>${s.hot.toExponential(1)}</td><td>${s.nan}</td><td class="${v.ok ? '' : 'bad'}">${v.why}</td>`
  body.appendChild(tr)
}

async function main(): Promise<void> {
  if (only.has('sfx')) {
    for (const name of Object.keys(SFX) as SfxName[]) {
      status.textContent = `sfx ${name}`
      add(`sfx:${name}`, analyze(await renderSfx(name)))
    }
    for (const p of [1.5, 2]) add(`sfx:pickup_credit@${p}`, analyze(await renderSfx('pickup_credit', { pitch: p })))
  }
  if (only.has('samples')) {
    // every recorded variant (and looping sample) through the real master chain, at unit game volume
    const bank = new SampleBank(new OfflineAudioContext(1, 1, 44100))
    await bank.ready
    for (const name of Object.keys(SFX) as SfxName[]) {
      status.textContent = `sample ${name}`
      const vs = bank.variants(name)
      if (!vs.length) add(`sample:${name} MISSING`, { peak: 0, rms: 0, rmsMax: 0, nan: false, hot: 0 })
      for (const [i, v] of vs.entries()) add(`sample:${name}#${i + 1}`, analyze(await renderSample(name, v, {}, v.buf.duration + 0.5)))
    }
    for (const n of ['beam', 'charge', 'alarm'] as LoopName[]) {
      const s = bank.loop(n)
      if (!s) add(`sample-loop:${n} MISSING`, { peak: 0, rms: 0, rmsMax: 0, nan: false, hot: 0 })
      else for (const p of [1, 1.8]) add(`sample-loop:${n}@${p}`, analyze(await renderLoop(n, 3, p, s)))
    }
  }
  if (only.has('bursts')) {
    const bursts: [SfxName, number, number][] = [
      ['hit_small', 40, 0.01], ['shot_pulse', 30, 0.066], ['shot_scatter', 20, 0.1], ['expl_small', 20, 0.03],
      ['expl_medium', 10, 0.05], ['expl_large', 4, 0.15], ['enemy_shot', 30, 0.04], ['expl_huge', 2, 0.5],
    ]
    for (const [n, c, i] of bursts) {
      status.textContent = `burst ${n}`
      add(`burst:${n}x${c}`, analyze(await renderSfxBurst(n, c, i)))
    }
  }
  if (only.has('loops')) {
    for (const n of ['beam', 'charge', 'alarm'] as LoopName[]) for (const p of [1, 1.8]) add(`loop:${n}@${p}`, analyze(await renderLoop(n, 3, p)))
  }
  if (only.has('tracks')) {
    for (const id of trackIds) {
      status.textContent = `track ${id}`
      add(`track:${id} L3`, analyze(await renderTrack(id, secs, 3)), 0.01)
      add(`track:${id} L1`, analyze(await renderTrack(id, 30, 1)), 0.005)
      add(`track:${id} L0`, analyze(await renderTrack(id, 25, 0)), 0.003)
      add(`track:${id} ramp`, analyze(await renderTrack(id, 40, (b) => Math.min(3, Math.floor(b / 3)))), 0.005)
    }
  }
  if (only.has('layers')) {
    const layers: Layer[] = ['pad', 'bass', 'drums', 'arp', 'lead', 'counter', 'perc']
    for (const id of trackIds) {
      for (const l of layers) {
        status.textContent = `layer ${id}/${l}`
        add(`layer:${id}/${l}`, analyze(await renderTrack(id, 20, 3, [l])), 0)
      }
    }
  }
  if (only.has('perf')) {
    // Offline render speed as a CPU proxy: x-realtime factor per track at intensity 3.
    const lines: string[] = []
    for (const id of trackIds) {
      const t0 = performance.now()
      await renderTrack(id, 30, 3)
      const ms = performance.now() - t0
      lines.push(`perf ${id.padEnd(11)} ${(30000 / ms).toFixed(1)}x realtime`)
    }
    if (q.get('track')) {
      for (const l of ['pad', 'bass', 'drums', 'arp', 'lead', 'counter', 'perc'] as Layer[]) {
        const t1 = performance.now()
        await renderTrack(trackIds[0], 30, 3, [l])
        lines.push(`perf   ${l.padEnd(9)} ${(30000 / (performance.now() - t1)).toFixed(1)}x realtime`)
      }
    }
    const t0 = performance.now()
    await renderTrack('m1', 30, 3, [])
    lines.push(`perf mixer-only   ${(30000 / (performance.now() - t0)).toFixed(1)}x realtime`)
    ;(window as unknown as { __dump: string }).__dump = lines.join('\n')
  }
  if (only.has('dump')) {
    const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
    const nm = (m: number): string => names[m % 12] + (Math.floor(m / 12) - 1)
    const lines: string[] = []
    for (const id of trackIds) {
      const arr = compose(TRACKS[id])
      lines.push(`== ${id} (${arr.bars.length} bars, loop from ${arr.loopFrom})`)
      arr.bars.forEach((b, i) => {
        const lead: string[] = []
        const bass: string[] = []
        b.steps.forEach((evs, s) => evs.forEach((e) => {
          if (e.k === 'n' && e.l === 'lead') lead.push(`${s}:${nm(e.m)}/${e.len}`)
          if (e.k === 'n' && e.l === 'bass') bass.push(nm(e.m))
          if (e.k === 'p' && s === 0) bass.unshift(`[${e.ms.map(nm).join(' ')}]`)
        }))
        lines.push(`${String(i).padStart(3)} ${b.name.padEnd(5)} ${bass.slice(0, 3).join(' ').padEnd(26)} | ${lead.join(' ')}`)
      })
    }
    ;(window as unknown as { __dump: string }).__dump = lines.join('\n')
  }
  status.textContent = `done: ${rows.filter((r) => !r.ok).length} failures / ${rows.length}`
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
