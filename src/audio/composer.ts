// Turns a declarative TrackSpec (chords, rhythms, patterns) into concrete per-step note events.
// Melodies are motif-based: each rhythm letter owns one seeded contour, re-fitted to whatever chord
// is underneath, so a letter repeated over different chords sounds like a sequence of the same idea.
// Strong beats and long notes always land on chord tones.

import { type Intensity } from './types'
import { hashStr, makeRng } from './core'
import type { DrumName, KitPreset, PadPreset, SynthPreset } from './instruments'
import { type Chord, type ScaleName, SCALES, chordKey, chordPcs, nearestPc, parseChord, placeAbove } from './theory'

export type Layer = 'pad' | 'bass' | 'drums' | 'arp' | 'lead' | 'counter' | 'perc'
export const LAYERS: Layer[] = ['pad', 'bass', 'drums', 'arp', 'lead', 'counter', 'perc']

export type DrumPattern = Partial<Record<DrumName, string>>

export interface ArpSpec {
  /** steps between notes */
  rate: number
  /** chord-tone indices (wrapping upward by octave), -1 = rest */
  seq: number[]
  center: number
  gate?: number
}

export interface SectionSpec {
  /** one chord symbol per bar; several space-separated symbols split the bar evenly */
  bars: string[]
  /** bass pattern per bar ('|' separates bars, cycles). R root, O octave, 5 fifth, 3 third, 7 seventh,
   *  b flat-seven below, A chromatic approach to next chord, r/o = ghost, '-' hold, '.' rest */
  bass: string
  drums: string
  perc?: string
  /** motif letters per bar (keys of TrackSpec.rhythms), '_' = no melody */
  mel?: string
  melShift?: number
  arp?: ArpSpec
  pad?: string
  counter?: string
  fill?: boolean
  crash?: boolean
}

export interface TrackSpec {
  bpm: number
  /** tonic pitch class */
  key: number
  scale: ScaleName
  /** 16ths per bar (16 = 4/4, 14 = 7/8) */
  steps?: number
  swing?: number
  seed: number
  /** intensity applied when the track starts */
  intensity: Intensity
  form: string[]
  loopFrom: number
  sections: Record<string, SectionSpec>
  /** melody rhythms: x onset, X accented, - hold, . rest */
  rhythms: Record<string, string>
  lead: { p: SynthPreset; lo: number; hi: number }
  counter: { p: SynthPreset; lo: number; hi: number; rhythm: string }
  bass: { p: SynthPreset; lo: number }
  arp: ArpSpec & { p: SynthPreset }
  pad: { p?: PadPreset; poly?: SynthPreset; center: number; rhythm?: string }
  kit: KitPreset
  drums: Record<string, DrumPattern>
  perc: Record<string, DrumPattern>
  fills: DrumPattern[]
  mix?: Partial<Record<Layer, number>>
  rev?: Partial<Record<Layer, number>>
  dly?: Partial<Record<Layer, number>>
  delayBeats?: number
  layerMin?: Partial<Record<Layer, number>>
}

export type NoteLayer = 'bass' | 'bassS' | 'arp' | 'lead' | 'counter'

export type Ev =
  | { k: 'n'; l: NoteLayer; len: number; m: number; v: number; g?: number }
  | { k: 'p'; len: number; ms: number[]; v: number }
  | { k: 'd'; l: 'drums' | 'perc'; d: DrumName; v: number }

export interface Bar {
  name: string
  steps: Ev[][]
}

export interface Arrangement {
  bars: Bar[]
  loopFrom: number
  N: number
}

const clean = (s: string): string => s.replace(/\s/g, '')

function vel(c: string | undefined): number {
  if (c === 'x' || c === 'X') return 1
  if (c === 'o') return 0.7
  if (c === 'g') return 0.38
  if (c && c >= '1' && c <= '9') return (c.charCodeAt(0) - 48) / 10
  return 0
}

interface Onset { s: number; len: number; acc: boolean }

function onsets(r: string, N: number): Onset[] {
  const out: Onset[] = []
  for (let s = 0; s < N; s++) {
    const c = r[s]
    if (c !== 'x' && c !== 'X') continue
    let len = 1
    while (s + len < N && r[s + len] === '-') len++
    out.push({ s, len, acc: c === 'X' })
  }
  return out
}

function indexNear(list: number[], m: number): number {
  let best = 0
  for (let i = 0; i < list.length; i++) if (Math.abs(list[i] - m) < Math.abs(list[best] - m)) best = i
  return best
}

/** Nearest chord tone, but never against the direction of motion (keeps lines moving). */
function snapChord(m: number, pcs: number[], dir: number): number {
  if (dir === 0) return nearestPc(m, pcs)
  const step = dir > 0 ? 1 : -1
  for (let d = 0; d < 12; d++) if (pcs.includes((((m + d * step) % 12) + 12) % 12)) return m + d * step
  return m
}

interface Slot {
  name: string
  sec: SectionSpec
  bi: number
  occ: number
  chords: { s: number; c: Chord }[]
}

export function compose(spec: TrackSpec): Arrangement {
  const N = spec.steps ?? 16
  const key = spec.key
  const scale: number[] = SCALES[spec.scale].map((i) => (i + key) % 12)

  const slots: Slot[] = []
  const occ: Record<string, number> = {}
  let loopFrom = 0
  spec.form.forEach((name, fi) => {
    const sec = spec.sections[name]
    if (!sec) throw new Error(`unknown section ${name}`)
    if (fi === spec.loopFrom) loopFrom = slots.length
    const o = (occ[name] = (occ[name] ?? -1) + 1)
    sec.bars.forEach((sym, bi) => {
      const parts = sym.trim().split(/\s+/)
      const chords = parts.map((p, i) => ({ s: Math.round((i * N) / parts.length), c: parseChord(p, key) }))
      slots.push({ name, sec, bi, occ: o, chords })
    })
  })

  const chordAt = (slot: Slot, s: number): Chord => {
    let c = slot.chords[0].c
    for (const x of slot.chords) if (x.s <= s) c = x.c
    return c
  }
  const nextChord = (i: number, s: number): Chord => {
    const here = slots[i].chords.find((x) => x.s > s)
    if (here) return here.c
    return slots[i + 1 < slots.length ? i + 1 : loopFrom].chords[0].c
  }

  // Scale for melodic motion under a chord. Diatonic chords use the key's mode; borrowed chords
  // (bVI, bVII, V in natural minor...) get their own chord-scale so passing tones never fight them.
  const minorKey = scale.includes((key + 3) % 12)
  const chordScale = (c: Chord): number[] => {
    const rel = (c.root - key + 12) % 12
    const ints = c.ints
    let cs: number[]
    if (ints.includes(4)) {
      if (rel === 7 && minorKey) cs = [0, 1, 4, 5, 7, 8, 10]
      else if (ints.includes(10)) cs = [0, 2, 4, 5, 7, 9, 10]
      else if (rel === 8 || rel === 5) cs = [0, 2, 4, 6, 7, 9, 11]
      else cs = [0, 2, 4, 5, 7, 9, 11]
    } else if (ints.includes(3) && ints.includes(7)) cs = [0, 2, 3, 5, 7, 9, 10]
    else if (ints.includes(3)) cs = [0, 2, 3, 5, 6, 8, 9, 11]
    else cs = [0, 2, 4, 5, 7, 9, 10]
    return cs.map((i) => (c.root + i) % 12)
  }
  const scaleCache = new Map<string, number[]>()
  const scaleNotes = (c: Chord): number[] => {
    const k = chordKey(c)
    let l = scaleCache.get(k)
    if (!l) {
      const cp = chordPcs(c)
      const pcs = cp.every((q) => scale.includes(q)) ? scale : [...new Set([...chordScale(c), ...cp])]
      l = []
      for (let m = 12; m < 120; m++) if (pcs.includes(m % 12)) l.push(m)
      scaleCache.set(k, l)
    }
    return l
  }

  const contours = new Map<string, { start: number; deltas: number[] }>()
  const contour = (letter: string, count: number): { start: number; deltas: number[] } => {
    let c = contours.get(letter)
    if (!c) {
      const r = makeRng(spec.seed ^ hashStr('mel' + letter))
      const deltas = [0]
      let dir = r() < 0.5 ? 1 : -1
      let prev = 0
      for (let i = 1; i < count; i++) {
        if (Math.abs(prev) >= 3) dir = -Math.sign(prev)
        else if (r() < 0.3) dir = -dir
        const x = r()
        const size = x < 0.1 ? 0 : x < 0.6 ? 1 : x < 0.85 ? 2 : x < 0.95 ? 3 : 4
        prev = size * dir
        deltas.push(prev)
      }
      c = { start: Math.floor(r() * 3), deltas }
      contours.set(letter, c)
    }
    return c
  }

  const voice = (c: Chord, center: number): number[] => {
    let ints = c.ints
    if (ints.length > 4) ints = ints.filter((i) => i !== 7)
    return ints.map((i) => placeAbove((c.root + i) % 12, center - 6)).sort((a, b) => a - b)
  }

  let leadPrev = Math.round((spec.lead.lo + spec.lead.hi) / 2)
  let counterPrev = Math.round((spec.counter.lo + spec.counter.hi) / 2)
  const bars: Bar[] = []

  slots.forEach((slot, si) => {
    const { sec } = slot
    const steps: Ev[][] = Array.from({ length: N }, () => [])
    const push = (s: number, e: Ev): void => {
      if (s >= 0 && s < N) steps[s].push(e)
    }
    const isLast = slot.bi === sec.bars.length - 1

    // pad
    const padRhythm = sec.pad ?? spec.pad.rhythm
    if (padRhythm) {
      for (const n of onsets(clean(padRhythm), N)) push(n.s, { k: 'p', len: n.len, ms: voice(chordAt(slot, n.s), spec.pad.center), v: 0.8 })
    } else {
      slot.chords.forEach((x, ci) => {
        const end = slot.chords[ci + 1]?.s ?? N
        push(x.s, { k: 'p', len: end - x.s, ms: voice(x.c, spec.pad.center), v: 0.85 })
      })
    }

    // bass
    const bpats = clean(sec.bass).split('|')
    const bp = bpats[slot.bi % bpats.length]
    for (let s = 0; s < N; s++) {
      const c = bp[s]
      if (!c || c === '.' || c === '-') continue
      let len = 1
      while (s + len < N && bp[s + len] === '-') len++
      const ch = chordAt(slot, s)
      const root = placeAbove(ch.root, spec.bass.lo)
      let m = root
      switch (c.toUpperCase()) {
        case 'O': m = root + 12; break
        case '5': m = root + (ch.ints.includes(7) ? 7 : ch.ints[2] ?? 7); break
        case '3': m = root + (ch.ints[1] ?? 4); break
        case '7': m = root + (ch.ints[3] ?? 10); break
        case 'B': m = root - 2; break
        case 'A': m = placeAbove(nextChord(si, s).root, spec.bass.lo) - 1; break
      }
      const ghost = c === 'r' || c === 'o'
      push(s, { k: 'n', l: 'bass', len: len > 1 ? len - 0.1 : 0.55, m, v: ghost ? 0.5 : s === 0 ? 1 : 0.85 })
    }
    slot.chords.forEach((x, ci) => {
      const end = slot.chords[ci + 1]?.s ?? N
      push(x.s, { k: 'n', l: 'bassS', len: end - x.s - 0.2, m: placeAbove(x.c.root, spec.bass.lo), v: 0.8 })
    })

    // drums + fills + crash
    const addLanes = (p: DrumPattern, l: 'drums' | 'perc', keep: (s: number) => boolean): void => {
      for (const [d, str] of Object.entries(p) as [DrumName, string][]) {
        const rows = clean(str).split('|')
        const row = rows[slot.bi % rows.length]
        for (let s = 0; s < N; s++) {
          const v = vel(row[s])
          if (v > 0 && keep(s)) push(s, { k: 'd', l, d, v })
        }
      }
    }
    const pat = spec.drums[sec.drums] ?? {}
    const fill = isLast && sec.fill !== false && spec.fills.length > 0 && Object.keys(pat).length > 0
      ? spec.fills[(hashStr(slot.name) + slot.occ) % spec.fills.length]
      : undefined
    let fillFrom = N
    if (fill) {
      for (const str of Object.values(fill)) {
        const i = clean(str ?? '').search(/[^.]/)
        if (i >= 0) fillFrom = Math.min(fillFrom, i)
      }
      addLanes(fill, 'drums', (s) => s >= fillFrom)
    }
    addLanes(pat, 'drums', (s) => s < fillFrom)
    if (slot.bi === 0 && sec.crash !== false && Object.keys(pat).length > 0) push(0, { k: 'd', l: 'drums', d: 'x', v: 1 })
    const perc = spec.perc[sec.perc ?? 'main']
    if (perc) addLanes(perc, 'perc', () => true)

    // arp
    const a = sec.arp ?? spec.arp
    for (let s = 0, i = 0; s < N; s += a.rate, i++) {
      const idx = a.seq[i % a.seq.length]
      if (idx < 0) continue
      const ch = chordAt(slot, s)
      const n = ch.ints.length
      const base = placeAbove(ch.root, a.center - 7)
      push(s, { k: 'n', l: 'arp', len: a.rate * (a.gate ?? 0.6), m: base + ch.ints[idx % n] + 12 * Math.floor(idx / n), v: s % 4 === 0 ? 0.9 : 0.72 })
    }

    // lead
    const letters = (sec.mel ?? '_').trim().split(/\s+/)
    const L = letters[slot.bi % letters.length]
    const rhythm = spec.rhythms[L]
    if (L !== '_' && rhythm) {
      const on = onsets(clean(rhythm), N)
      const ct = contour(L, on.length)
      const shift = sec.melShift ?? 0
      const lo = spec.lead.lo + shift
      const hi = spec.lead.hi + shift
      const orn = makeRng(spec.seed ^ hashStr(`orn${slot.name}${slot.occ}${slot.bi}`))
      let cur = Math.max(lo, Math.min(hi, leadPrev))
      let prev2 = -1
      let prevEnd = -1
      on.forEach((n, j) => {
        const ch = chordAt(slot, n.s)
        // A note held across a chord change may only use tones common to every chord it spans.
        let pcs = chordPcs(ch)
        for (const x of slot.chords) {
          if (x.s <= n.s || x.s >= n.s + n.len) continue
          const common = pcs.filter((p) => chordPcs(x.c).includes(p))
          if (common.length) pcs = common
        }
        const list = scaleNotes(ch)
        let m: number
        const d = ct.deltas[j] ?? 0
        if (j === 0) {
          m = nearestPc(cur, [(ch.root + ch.ints[ct.start % ch.ints.length]) % 12])
        } else {
          const at = indexNear(list, cur)
          let idx = at + d
          if (list[idx] === undefined || list[idx] > hi || list[idx] < lo) idx = at - d
          m = list[Math.max(0, Math.min(list.length - 1, idx))]
          if (n.s % 4 === 0 || n.acc || n.len >= 4) m = snapChord(m, pcs, m - cur)
          // A third identical pitch in a row reads as a stuck motif: push it to the next chord tone.
          if (m === cur && cur === prev2) m = snapChord(m + (d >= 0 ? 1 : -1), pcs, d >= 0 ? 1 : -1)
        }
        const cadence = isLast && j === on.length - 1
        if (cadence) {
          const home = [ch.root, (ch.root + ch.ints[1]) % 12].filter((p) => pcs.includes(p))
          m = nearestPc(m, home.length ? home : pcs)
        }
        while (m > hi) m -= 12
        while (m < lo) m += 12
        const v = n.acc ? 1 : n.s === 0 ? 0.95 : n.s % 4 === 0 ? 0.85 : 0.72
        const g = prevEnd === n.s ? cur : undefined
        prev2 = cur
        if (slot.occ > 0 && n.len >= 4 && !cadence && orn() < 0.35) {
          const h = Math.floor(n.len / 2)
          push(n.s, { k: 'n', l: 'lead', len: h, m, v, g })
          let nb = list[Math.max(0, Math.min(list.length - 1, indexNear(list, m) + (orn() < 0.5 ? 1 : -1)))]
          if ((n.s + h) % 4 === 0) nb = nearestPc(nb, pcs)
          push(n.s + h, { k: 'n', l: 'lead', len: n.len - h, m: nb, v: v * 0.85, g: m })
          cur = nb
        } else {
          push(n.s, { k: 'n', l: 'lead', len: n.len, m, v, g })
          cur = m
        }
        prevEnd = n.s + n.len
      })
      leadPrev = cur
    }

    // counter-melody: smooth guide tones, avoids doubling the root
    for (const n of onsets(clean(sec.counter ?? spec.counter.rhythm), N)) {
      const ch = chordAt(slot, n.s)
      const pcs = chordPcs(ch)
      let best = counterPrev
      let score = Infinity
      for (let m = spec.counter.lo; m <= spec.counter.hi; m++) {
        const pc = m % 12
        if (!pcs.includes(pc)) continue
        const sc = Math.abs(m - counterPrev) + (pc === ch.root ? 2.5 : 0) + (m === counterPrev ? 1.5 : 0)
        if (sc < score) {
          score = sc
          best = m
        }
      }
      push(n.s, { k: 'n', l: 'counter', len: n.len - 0.15, m: best, v: 0.8 })
      counterPrev = best
    }

    bars.push({ name: slot.name, steps })
  })

  return { bars, loopFrom, N }
}
