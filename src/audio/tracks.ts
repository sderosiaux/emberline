// The EMBERLINE soundtrack as data. Every track is original: chord plans, rhythms and patterns are
// written here; melodic pitches come from the composer's seeded motifs (see composer.ts).

import type { DrumPattern, TrackSpec } from './composer'
import { type PadPreset, type SynthPreset, kit } from './instruments'
import type { TrackId } from './types'

const with_ = <T extends object>(base: T, over: Partial<T>): T => ({ ...base, ...over })

// ---------------------------------------------------------------- instruments

const sawBass: SynthPreset = { osc: [{ w: 'sawtooth' }, { w: 'square', oct: -1, g: 0.45 }], vol: 0.3, a: 0.004, d: 0.18, s: 0.6, r: 0.06, lp: { f: 300, q: 4, env: 4, dec: 0.16, kt: 0.5 } }
const subBass: SynthPreset = { osc: [{ w: 'sine' }, { w: 'triangle', g: 0.35 }], vol: 0.24, a: 0.01, d: 0.3, s: 0.8, r: 0.1 }
const roundBass: SynthPreset = { osc: [{ w: 'triangle' }, { w: 'sine', g: 0.8 }], vol: 0.3, a: 0.006, d: 0.25, s: 0.6, r: 0.08, lp: { f: 900 } }
const slapBass: SynthPreset = { osc: [{ w: 'sine' }], fm: { ratio: 1, index: 3.2, dec: 0.12, sus: 0.15 }, vol: 0.46, a: 0.002, d: 0.25, s: 0.5, r: 0.06, lp: { f: 1600 } }
const rollBass: SynthPreset = { osc: [{ w: 'sawtooth', det: -6 }, { w: 'sawtooth', det: 6 }], vol: 0.24, a: 0.003, d: 0.12, s: 0.3, r: 0.05, lp: { f: 360, q: 3, env: 3, dec: 0.09, kt: 0.4 } }
const pulseBass: SynthPreset = { osc: [{ w: 'pulse' }, { w: 'sine', oct: -1, g: 0.6 }], vol: 0.3, a: 0.003, d: 0.2, s: 0.55, r: 0.05, lp: { f: 700, q: 2, env: 2, dec: 0.12 } }

const brassLead: SynthPreset = { osc: [{ w: 'sawtooth', det: -7 }, { w: 'sawtooth', det: 7 }], vol: 0.15, a: 0.03, d: 0.3, s: 0.75, r: 0.18, lp: { f: 1300, q: 1.5, env: 1.3, dec: 0.25, kt: 0.6 }, vib: { rate: 5.2, cents: 14, delay: 0.25 } }
const squareLead: SynthPreset = { osc: [{ w: 'square' }, { w: 'square', det: 9, g: 0.5 }], vol: 0.14, a: 0.008, d: 0.2, s: 0.7, r: 0.1, lp: { f: 2400, q: 1, kt: 0.5 }, vib: { rate: 5.5, cents: 18, delay: 0.2 }, glide: 0.03 }
const fluteLead: SynthPreset = { osc: [{ w: 'triangle' }, { w: 'sine', oct: 1, g: 0.2 }], vol: 0.15, a: 0.05, d: 0.2, s: 0.85, r: 0.2, vib: { rate: 4.8, cents: 16, delay: 0.3 } }
const glassLead: SynthPreset = { osc: [{ w: 'triangle' }, { w: 'sine', oct: 1, g: 0.3 }], vol: 0.22, a: 0.02, d: 0.6, s: 0.5, r: 0.4, vib: { rate: 4, cents: 8, delay: 0.4 } }
const thereminLead: SynthPreset = { osc: [{ w: 'sine' }, { w: 'triangle', g: 0.35 }], vol: 0.12, a: 0.08, d: 0.2, s: 0.9, r: 0.25, vib: { rate: 6, cents: 32, delay: 0.1 }, glide: 0.09 }
const sawLead: SynthPreset = { osc: [{ w: 'sawtooth' }, { w: 'pulse', det: -10, g: 0.6 }], vol: 0.17, a: 0.005, d: 0.25, s: 0.7, r: 0.12, lp: { f: 2000, q: 2, env: 1.5, dec: 0.2, kt: 0.5 }, vib: { rate: 5.6, cents: 15, delay: 0.18 }, glide: 0.04 }
const choirVoice: SynthPreset = { osc: [{ w: 'sawtooth', det: -5 }, { w: 'sawtooth', det: 6 }], vol: 0.16, a: 0.12, d: 0.4, s: 0.85, r: 0.35, vowel: ['o', 'a'], vib: { rate: 4.5, cents: 12, delay: 0.3 } }

const pluck: SynthPreset = { osc: [{ w: 'square' }], vol: 0.11, a: 0.002, d: 0.15, s: 0, r: 0.08, lp: { f: 900, q: 3, env: 3, dec: 0.08, kt: 0.5 } }
const glassPluck: SynthPreset = { osc: [{ w: 'triangle' }, { w: 'sine', oct: 1, g: 0.35 }], vol: 0.17, a: 0.002, d: 0.3, s: 0, r: 0.2 }
const sawPluck: SynthPreset = { osc: [{ w: 'sawtooth', det: -9 }, { w: 'sawtooth', det: 9 }], vol: 0.085, a: 0.002, d: 0.14, s: 0.1, r: 0.08, lp: { f: 1100, q: 4, env: 3.5, dec: 0.1, kt: 0.4 } }
const bell: SynthPreset = { osc: [{ w: 'sine' }], fm: { ratio: 3.5, index: 1.8, dec: 0.6, sus: 0.05 }, vol: 0.14, a: 0.002, d: 1.2, s: 0, r: 0.8 }
const vibes: SynthPreset = { osc: [{ w: 'sine' }], fm: { ratio: 4, index: 1.1, dec: 0.3, sus: 0.05 }, vol: 0.15, a: 0.002, d: 0.8, s: 0, r: 0.5 }
const ep: SynthPreset = { osc: [{ w: 'sine' }], fm: { ratio: 1, index: 1.3, dec: 0.6, sus: 0.25 }, vol: 0.085, a: 0.004, d: 1.2, s: 0.35, r: 0.4 }
const organStab: SynthPreset = { osc: [{ w: 'square' }, { w: 'sine', oct: 1, g: 0.3 }], vol: 0.08, a: 0.005, d: 0.2, s: 0.6, r: 0.08, lp: { f: 1500 } }

const warmPad: PadPreset = { osc: [{ w: 'sawtooth', det: -8 }, { w: 'sawtooth', det: 8 }], vol: 0.05, a: 0.4, r: 0.8, lp: 900, sweep: 1.6 }
const darkPad: PadPreset = { osc: [{ w: 'sawtooth', det: -10 }, { w: 'sawtooth', det: 10 }], vol: 0.05, a: 0.3, r: 0.7, lp: 600, sweep: 1.4 }
const glassPad: PadPreset = { osc: [{ w: 'triangle', det: -5 }, { w: 'sine', oct: 1, det: 5, g: 0.5 }], vol: 0.055, a: 0.6, r: 1.2, lp: 3000 }
const choirPad: PadPreset = { osc: [{ w: 'sawtooth', det: -6 }, { w: 'sawtooth', det: 7 }], vol: 0.075, a: 0.5, r: 1, vowel: ['a', 'o'] }
const supersaw: PadPreset = { osc: [{ w: 'sawtooth', det: -14 }, { w: 'sawtooth' }, { w: 'sawtooth', det: 14 }], vol: 0.032, a: 0.05, r: 0.4, lp: 2000, sweep: 1.3 }

// ---------------------------------------------------------------- drum fills

const FILLS: DrumPattern[] = [
  { k: '.... .... x... ..x.', s: '.... .... .... xxxx' },
  { k: '.... .... x... ....', n: '.... .... x.x. ....', m: '.... .... .... x.x.', t: '.... .... .... .x.x' },
  { k: '.... .... x..x ....', s: '.... .... x..x .x.x', o: '.... .... .... ..x.' },
  { k: '.... .... x... x...', s: '.... .... gogo xoxx' },
]

const FILLS14: DrumPattern[] = [
  { k: '.... .... x.....', s: '.... .... ..xxxx' },
  { k: '.... .... x.....', n: '.... .... x.x...', m: '.... .... ....x.', t: '.... .... .....x' },
]

// ---------------------------------------------------------------- tracks

const title: TrackSpec = {
  bpm: 112, key: 2, scale: 'major', seed: 101, intensity: 2,
  form: ['intro', 'A', 'B', 'A', 'C', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['I', 'bVII', 'IV', 'I'], bass: 'R--- ---- R--- ----', drums: 'intro' },
    A: { bars: ['I', 'iii', 'IV', 'V', 'vi', 'IV', 'bVII', 'V'], bass: 'R.R. R.R. R.R. 5.O.', drums: 'main', mel: 'a b a c a b f d' },
    B: { bars: ['bVI', 'bVII', 'I', 'I', 'bVI', 'bVII', 'IV', 'V'], bass: 'R--- --R. R--- --5.', drums: 'main', mel: 'e f e g e f c d', melShift: 3 },
    C: { bars: ['vi', 'IV', 'I', 'V', 'vi', 'IV', 'ii', 'Vsus4 V'], bass: 'R--- ---- R--- 5---', drums: 'half', mel: 'g b g b e f c d' },
  },
  rhythms: {
    a: 'x--- --x- x-x- x---', b: 'x--- x--- x--- --x-', c: 'x-x- x-x- x--- ----', d: 'x--- ---- ---- ----',
    e: 'x--- --x- x--- --x-', f: 'x-x- x--- x--- x---', g: 'x--- ---- ---- x-x-',
  },
  lead: { p: brassLead, lo: 62, hi: 81 },
  counter: { p: fluteLead, lo: 55, hi: 69, rhythm: 'x--- ---- x--- ----' },
  bass: { p: sawBass, lo: 33 },
  arp: { p: pluck, rate: 2, seq: [0, 2, 1, 3, 2, 4, 3, 1], center: 62 },
  pad: { p: warmPad, center: 60 },
  kit: kit({ kick: { f0: 140, f1: 48, dec: 0.35 } }),
  drums: {
    intro: { k: 'x... .... .... ....', t: '.... .... .... ..o.' },
    main: { k: 'x... .... x.x. ....', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
    half: { k: 'x... .... ..x. ....', s: '.... .... x... ....', h: 'x... x... x... x...' },
  },
  perc: { main: { t: 'x... .... .... ....', p: '..g. ..g. ..g. ..g.', o: '.... ..o. .... ..o.' } },
  fills: FILLS,
}

const hangar: TrackSpec = {
  bpm: 96, key: 5, scale: 'major', swing: 0.28, seed: 202, intensity: 2,
  form: ['A', 'A', 'B', 'A'], loopFrom: 0,
  sections: {
    A: { bars: ['IM7', 'vi7', 'ii7', 'V7', 'iii7', 'vi7', 'ii7', 'V7'], bass: 'R... 5... O.3. 5.A.', drums: 'main', mel: 'a b a d c b e d' },
    B: { bars: ['IVM7', 'iv7', 'iii7', 'vi7', 'ii7', 'bVII7', 'IM7', 'V7sus4 V7'], bass: 'R... R.5. 3... 5.A.', drums: 'main', mel: 'e f e d c f b d' },
  },
  rhythms: {
    a: '..x- x-x- x--- --..', b: 'x-.x --x- .... ....', c: '..x. x.x. x-x- x---', d: 'x--- ---- ---- ....',
    e: 'x-x- ..x- x-.. x---', f: '.... x-x- x-x- x---',
  },
  lead: { p: fluteLead, lo: 65, hi: 84 },
  counter: { p: vibes, lo: 60, hi: 74, rhythm: 'x--- ---- x--- ----' },
  bass: { p: roundBass, lo: 29 },
  arp: { p: vibes, rate: 2, seq: [-1, 0, -1, 2, -1, 1, -1, 3], center: 67 },
  pad: { poly: ep, center: 62, rhythm: 'x--- --.. x-.x ----' },
  kit: kit({ kick: { f0: 110, f1: 45, dec: 0.3, vol: 0.65 }, snare: { tone: 200, dec: 0.15, bp: 1500, vol: 0.26 }, hat: { vol: 0.055 } }),
  drums: { main: { k: 'x... ..x. ..x. ....', s: '.... x... .... x..g', h: 'x.xg x.x. x.xg x.xg' } },
  perc: { main: { p: 'g.g. g.g. g.g. g.g.', r: '..x. .... x.x. ....' } },
  fills: [FILLS[2], FILLS[3]],
  mix: { pad: 0.7, arp: 0.3 },
  rev: { pad: 0.3 },
}

const m1: TrackSpec = {
  bpm: 138, key: 4, scale: 'minor', seed: 301, intensity: 1,
  form: ['intro', 'A', 'A', 'B', 'C', 'A', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i5', 'i5', 'bVI5', 'bVII5'], bass: 'R.R. R.R. R.R. R.R.', drums: 'intro' },
    A: { bars: ['i', 'i', 'bVI', 'bVII', 'i', 'i', 'bVI', 'V'], bass: 'R.Rr .RR. R.Rr O.Rb', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['iv', 'iv', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], bass: 'R.R. O.R. R.R. O.RA', drums: 'main', mel: 'f g f h f g d e' },
    C: { bars: ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'bII', 'V'], bass: 'R--- ---- R--- R-R-', drums: 'half', mel: 'g _ g _ f _ h e' },
  },
  rhythms: {
    a: 'x-x- x-x. x-x- x---', b: 'x-x. x-x- x--- ----', c: 'x-x- x-x- x.x. x.x.', d: 'x--- x--- x--- x---',
    e: 'x--- ---- ---- ----', f: 'x--- --x- ---- x---', g: 'x-x- x--- --x- x---', h: 'x--- x-x- x--- x-x-',
  },
  lead: { p: sawLead, lo: 64, hi: 83 },
  counter: { p: brassLead, lo: 52, hi: 67, rhythm: 'x--- ---- x--- x---' },
  bass: { p: with_(sawBass, { lp: { f: 380, q: 5, env: 4, dec: 0.12, kt: 0.5 } }), lo: 28 },
  arp: { p: pluck, rate: 2, seq: [0, 2, 1, 2, 3, 2, 1, 2], center: 64 },
  pad: { p: darkPad, center: 57 },
  kit: kit({ kick: { f0: 160, f1: 42, dec: 0.3, sq: 0.22 }, snare: { tone: 180, dec: 0.18, bp: 2200, vol: 0.45 }, metal: { f: 420, vol: 0.07 } }),
  drums: {
    intro: { k: 'x... x... x... x...', b: '.... ..x. .... ..x.' },
    main: { k: 'x... ..x. x... ..x.', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
    half: { k: 'x... .... ..x. ....', s: '.... .... x... ....', h: 'x.x. x.x. x.x. x.x.' },
  },
  perc: { main: { b: '..x. .... ..x. ..x.', o: '.... ..o. .... ..o.' } },
  fills: FILLS,
}

const m2: TrackSpec = {
  bpm: 124, key: 7, scale: 'lydian', seed: 402, intensity: 1,
  form: ['intro', 'A', 'B', 'A', 'C', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['IM7', 'II', 'IM7', 'II'], bass: 'R--- ---- ---- ----', drums: 'none' },
    A: { bars: ['IM7', 'II', 'vi7', 'iii7', 'IVM7', 'II', 'Vsus4', 'V'], bass: 'R..R ..R. R..5 ..O.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['vi7', 'IVM7', 'IM7', 'V', 'vi7', 'IVM7', 'II', 'II'], bass: 'R..R ..R. R..5 ..O.', drums: 'main', mel: 'f g f h f g c e', melShift: 2 },
    C: { bars: ['IVM7', 'V', 'iii7', 'vi7', 'ii7', 'V', 'IM7', 'II'], bass: 'R--- ---- R..5 ..O.', drums: 'main', mel: 'd d f f a b c e' },
  },
  rhythms: {
    a: 'x--x --x- x--- ----', b: 'x-x- x--x --x- ----', c: 'x--x --x- x-x- x---', d: 'x--- --x- --x- x-x-',
    e: 'x--- ---- ---- ----', f: '..x- x-x- x--x ----', g: 'x-x- x-x- x--- ----', h: 'x--x --x- --x- x---',
  },
  lead: { p: fluteLead, lo: 67, hi: 86 },
  counter: { p: bell, lo: 60, hi: 74, rhythm: 'x--- ---- x--- ----' },
  bass: { p: with_(pulseBass, { vol: 0.26, lp: { f: 500, q: 1, env: 1.5, dec: 0.15 } }), lo: 31 },
  arp: { p: glassPluck, rate: 1, seq: [0, 1, 2, 3, 4, 3, 2, 1], center: 67, gate: 0.9 },
  pad: { p: glassPad, center: 64 },
  kit: kit({ kick: { f0: 130, f1: 48, dec: 0.28, vol: 0.65 }, snare: { vol: 0.3, dec: 0.14 } }),
  drums: {
    none: {},
    main: { k: 'x... ..x. ..x. ....', s: '.... x... .... x...', h: '..x. ..x. ..x. ..x.' },
  },
  perc: { main: { p: 'g.o. g.o. g.o. g.o.', r: '.... ..x. .... ..x.' } },
  fills: [FILLS[0], FILLS[1]],
  layerMin: { arp: 0 },
  mix: { arp: 0.3 },
  dly: { arp: 0.28, lead: 0.2 },
}

const m3: TrackSpec = {
  bpm: 88, key: 1, scale: 'harmonic', seed: 503, intensity: 1,
  form: ['intro', 'A', 'B', 'A', 'C', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i', 'i', 'bVI', 'bVI'], bass: 'R--- ---- ---- ----', drums: 'none' },
    A: { bars: ['i', 'i', 'bVI', 'V', 'iv', 'iv', 'bVI', 'V'], bass: 'R--- ---- ..5- ----', drums: 'main', mel: 'a _ b c a _ d e' },
    B: { bars: ['iv', 'bII', 'V', 'i', 'iv', 'bII', 'V', 'V'], bass: 'R--- --R. R--- ----', drums: 'main', mel: 'f g f h f g d e' },
    C: { bars: ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V7', 'V7'], bass: 'R--- ---- R--- 5---', drums: 'main', mel: 'g _ h _ f _ d e' },
  },
  rhythms: {
    a: 'x--- --x- ---- ----', b: 'x--- x--- ---- ----', c: '.... ..x- x-x- ----', d: 'x--- ---- x--- ----',
    e: 'x--- ---- ---- ----', f: 'x-x- ---- x--- ----', g: '.... x--- x--- x---', h: 'x--- --x- ---- x---',
  },
  lead: { p: glassLead, lo: 68, hi: 85 },
  counter: { p: fluteLead, lo: 56, hi: 70, rhythm: 'x--- ---- ---- ----' },
  bass: { p: subBass, lo: 25 },
  arp: { p: bell, rate: 2, seq: [0, -1, 2, -1, 4, -1, 3, -1], center: 72 },
  pad: { p: with_(glassPad, { lp: 1800 }), center: 61 },
  kit: kit({ kick: { f0: 120, f1: 40, dec: 0.4, vol: 0.7 }, rim: { f: 900 }, metal: { f: 800, vol: 0.05 } }),
  drums: {
    none: {},
    main: { k: 'x... .... ..x. ....', r: '.... x... .... x...', h: '..g. ..g. ..g. ..g.' },
  },
  perc: { main: { p: '..g. ..g. ..g. g.g.', b: '.... .... x... ....' } },
  fills: [{ k: '.... .... x... ....', r: '.... .... ..x. x.xx' }],
  layerMin: { arp: 0 },
  mix: { arp: 0.35 },
  rev: { arp: 0.5, lead: 0.5 },
  delayBeats: 1.5,
  dly: { arp: 0.25, lead: 0.25 },
}

const m4: TrackSpec = {
  bpm: 108, key: 7, scale: 'dorian', swing: 0.12, seed: 604, intensity: 1,
  form: ['intro', 'A', 'B', 'A', 'C', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i7', 'i7', 'IV7', 'IV7'], bass: 'R..R .O.r ..5. bR.o | R..R .O.r ..R. 5.A.', drums: 'intro' },
    A: { bars: ['i7', 'i7', 'IV7', 'IV7', 'i7', 'i7', 'IV7', 'bVII7'], bass: 'R..R .O.r ..5. bR.o | R..R .O.r ..R. 5.A.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['bVIIM7', 'bVIIM7', 'bVIM7', 'v7', 'bIIIM7', 'IV7', 'v7', 'v7 bVII7'], bass: 'R.R. .O.. R..5 .R.A', drums: 'main', mel: 'f g f h f g c e' },
    C: { bars: ['i7', 'i7', 'i7', 'i7'], bass: 'R..R .O.r .R5. bR.o | R.rR .O.. R.5. OA.b', drums: 'break' },
  },
  rhythms: {
    a: '..x- .x.. x-.x ....', b: 'x..x ..x. .... x-..', c: '..x. x.x. .x.x .x--', d: 'x-.x ..x- x--- ....',
    e: 'x--- ---- .... ....', f: 'x.x. ..x. x.x. ..x-', g: '..x. x.x- ..x. x---', h: 'x..x ..x. .x.. x---',
  },
  lead: { p: squareLead, lo: 67, hi: 84 },
  counter: { p: brassLead, lo: 58, hi: 72, rhythm: 'x--- .... x--- ....' },
  bass: { p: slapBass, lo: 31 },
  arp: { p: with_(pluck, { lp: { f: 1400, q: 2, env: 2, dec: 0.06, kt: 0.5 } }), rate: 1, seq: [0, -1, -1, 2, -1, -1, 1, -1, -1, -1, 3, -1, -1, 2, -1, -1], center: 67 },
  pad: { poly: organStab, center: 62, rhythm: '..x. .... x.x. ....' },
  kit: kit({ kick: { f0: 130, f1: 50, dec: 0.25 }, snare: { tone: 210, dec: 0.14, bp: 2000 } }),
  drums: {
    intro: { k: 'x..x .... ..x. .x..', h: 'x.xg x.xg x.xg x.xg' },
    main: { k: 'x..x .... ..x. .x..', s: '.... x..g .g.. x..g', h: 'x.xg x.xg x.xg x.xg' },
    break: { k: 'x... .... ..x. ....', h: 'x.x. x.x. x.x. x.x.' },
  },
  perc: { main: { c: '.... x... .... x...', p: '.g.g .g.g .g.g .g.g', n: '.... .... ..x. .x..' } },
  fills: [FILLS[0], FILLS[2]],
  mix: { pad: 0.5, arp: 0.35 },
  rev: { pad: 0.2 },
}

const m5: TrackSpec = {
  bpm: 142, key: 5, scale: 'minor', seed: 705, intensity: 1,
  form: ['intro', 'A', 'B', 'C', 'A', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i', 'bVI', 'bIII', 'bVII'], bass: '.RRR .RRR .RRR .ROR', drums: 'intro' },
    A: { bars: ['i', 'bVI', 'bIII', 'bVII', 'i', 'bVI', 'bIII', 'bVII'], bass: '.RRR .RRR .RRR .ROR', drums: 'main', mel: 'a b a c a b a d' },
    B: { bars: ['iv', 'bVI', 'bVII', 'i', 'iv', 'bVI', 'bVII', 'V'], bass: '.RRR .RRR .RRR .ROR', drums: 'main', mel: 'e f e g e f h d', melShift: 3 },
    C: { bars: ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], bass: 'R--- ---- ---- ----', drums: 'break', mel: 'e _ e _ f _ g d' },
  },
  rhythms: {
    a: 'x.x. x-x. x.x- x-x-', b: 'x.x. x-x. x-x- x---', c: 'x-x- x-x- x-x- x-x-', d: 'x--- --x- ---- x---',
    e: 'x--- --x- ---- x-x-', f: 'x-x- x-x- x--- ----', g: 'x--- x--- x--- x---', h: 'x.x. x.x. x.x. x.x.',
  },
  lead: { p: with_(sawLead, { osc: [{ w: 'sawtooth', det: -10 }, { w: 'sawtooth', det: 10 }, { w: 'pulse', oct: -1, g: 0.4 }] }), lo: 65, hi: 84 },
  counter: { p: brassLead, lo: 60, hi: 72, rhythm: 'x--- ---- x--- ----' },
  bass: { p: rollBass, lo: 29 },
  arp: { p: sawPluck, rate: 1, seq: [0, 1, 2, 1, 3, 1, 2, 1], center: 65, gate: 0.7 },
  pad: { p: supersaw, center: 60 },
  kit: kit({ kick: { f0: 170, f1: 45, dec: 0.3, vol: 0.8 }, clap: { vol: 0.35 } }),
  drums: {
    intro: { k: 'x... x... x... x...', h: '..x. ..x. ..x. ..x.' },
    main: { k: 'x... x... x... x...', c: '.... x... .... x...', o: '..x. ..x. ..x. ..x.', h: 'xgxg xgxg xgxg xgxg' },
    break: { h: '..x. ..x. ..x. ..x.', s: '.... .... .... .... | .... .... .... .... | .... .... .... .... | x... x... x... x... | .... .... .... .... | .... .... .... .... | x... x... x... x... | x.x. x.x. xxxx xxxx' },
  },
  perc: { main: { p: 'gxgx gxgx gxgx gxgx', r: '...x ..x. ...x ..x.' } },
  fills: [FILLS[0], FILLS[3]],
  mix: { pad: 0.5, arp: 0.35, lead: 0.55 },
  dly: { arp: 0.22, lead: 0.2 },
}

const m6: TrackSpec = {
  bpm: 100, key: 11, scale: 'phrygian', seed: 806, intensity: 1,
  form: ['intro', 'A', 'B', 'C', 'A', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i', 'i', 'bII', 'bII'], bass: 'R--- ---- ---- ----', drums: 'none' },
    A: { bars: ['i', 'i', 'bII', 'bII', 'iv', 'iv', 'bVI', 'V'], bass: 'R--- ---- R--- --R-', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['bVI', 'bVI', 'bII', 'bII', 'iv', 'bVII', 'V', 'V'], bass: 'R--- ---- R--- --R-', drums: 'main', mel: 'f g f h f g d e' },
    C: { bars: ['i', 'bII', 'i', 'bII', 'iv', 'bII', 'V', 'V'], bass: 'R-.R -.R- R-.R -.O-', drums: 'build', mel: 'a a b b f f d e' },
  },
  rhythms: {
    a: 'x--- ---- x--- x---', b: 'x--- --x- x--- ----', c: 'x--- x--- x--- x---', d: 'x--- ---- x--- ----',
    e: 'x--- ---- ---- ----', f: '.... x--- x-x- x---', g: 'x-x- x--- ---- ....', h: 'x--- ---- --x- x---',
  },
  lead: { p: thereminLead, lo: 66, hi: 83 },
  counter: { p: with_(squareLead, { vol: 0.07, lp: { f: 1200 } }), lo: 54, hi: 68, rhythm: 'x--- ---- x--- ----' },
  bass: { p: with_(sawBass, { lp: { f: 220, q: 3, env: 2, dec: 0.3 } }), lo: 35 },
  arp: { p: glassPluck, rate: 2, seq: [0, 2, 4, 2, 1, 3, 5, 3], center: 72 },
  pad: { p: with_(choirPad, { vowel: ['u', 'o'] }), center: 59 },
  kit: kit({ kick: { f0: 120, f1: 38, dec: 0.5 }, snare: { tone: 160, dec: 0.3, bp: 1200 } }),
  drums: {
    none: {},
    main: { k: 'x... .... x..x ....', s: '.... .... x... ....', h: '..g. ..g. ..g. ..g.' },
    build: { k: 'x... x... x... x...', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
  },
  perc: { main: { t: 'x... .... ..x. ....', m: '.... .... .... ..x.', b: '.... ..x. .... ....' } },
  fills: [FILLS[1]],
  mix: { arp: 0.3 },
  rev: { arp: 0.5, lead: 0.45, pad: 0.6 },
  delayBeats: 1,
  dly: { arp: 0.3, lead: 0.2 },
}

const m7: TrackSpec = {
  bpm: 150, key: 2, scale: 'harmonic', seed: 907, intensity: 1,
  form: ['intro', 'A', 'B', 'A', 'C', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i', 'i', 'bVI', 'V'], bass: 'R.O. R.O. R.O. R.O.', drums: 'intro' },
    A: { bars: ['i', 'bVI', 'bIII', 'V', 'i', 'bVI', 'iv', 'V'], bass: 'R.O. R.O. R.O. R.O.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['iv', 'bVII', 'bIII', 'bVI', 'iv', 'bII', 'V', 'V'], bass: 'R.O. R.O. R.O. R.OA', drums: 'main', mel: 'f g f h f g c e', melShift: 2 },
    C: { bars: ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], bass: 'R-.R -.R- R-.R -.O-', drums: 'toms', mel: 'g g h h f f d e' },
  },
  rhythms: {
    a: 'x-x- x-x- x--- x---', b: 'x--- x-x- x-x- x---', c: 'x-x- x-x- x-x- x-x-', d: 'x--- --x- ---- x---',
    e: 'x--- ---- ---- ----', f: 'x--- ---- x-x- x---', g: 'x--- x--- x--- x-x-', h: 'x-x- x--- x-x- x---',
  },
  lead: { p: with_(brassLead, { lp: { f: 1800, q: 1.5, env: 1.2, dec: 0.2, kt: 0.6 } }), lo: 62, hi: 84 },
  counter: { p: choirVoice, lo: 57, hi: 72, rhythm: 'x--- ---- x--- ----' },
  bass: { p: sawBass, lo: 26 },
  arp: { p: sawPluck, rate: 2, seq: [0, 1, 2, 3, 4, 3, 2, 1], center: 62 },
  pad: { p: choirPad, center: 62 },
  kit: kit({ kick: { f0: 150, f1: 40, dec: 0.45 }, tom: { f: 90, vol: 0.35 } }),
  drums: {
    intro: { k: 'x... .... x... ....', t: 'x..x ..x. .... ....', m: '.... .... ..x. .x..' },
    main: { k: 'x..x ..x. x..x ..x.', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
    toms: { k: 'x... x... x... x...', t: 'x..x ..x. x..x ..x.', s: '.... x... .... x...' },
  },
  perc: { main: { m: '.... ..x. .... ..x.', n: '.... .... .... ..x.', p: 'g.g. g.g. g.g. g.g.' } },
  fills: FILLS,
  mix: { pad: 0.6 },
}

const secret: TrackSpec = {
  bpm: 132, key: 4, scale: 'lydian', steps: 14, seed: 1009, intensity: 2,
  form: ['A', 'B', 'A', 'B'], loopFrom: 0,
  sections: {
    A: { bars: ['I', 'II', 'I', 'II', 'IVM7', 'bVII', 'I', 'V'], bass: 'R... O... 5.O. R.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['bVI', 'bVII', 'I', 'I', 'bIII', 'IV', 'II', 'V'], bass: 'R.5. O.5. R.5. O.', drums: 'main', mel: 'f g f h f g d e' },
  },
  rhythms: {
    a: 'x-x- x-x- x-x- x-', b: 'x--- x.x. x--- --', c: 'x.x. x.x. x.x. x.', d: 'x--- x--- x--- --',
    e: 'x--- ---- ---- --', f: '..x- x-.. x-x- x-', g: 'x-x- --x- --x- --', h: 'x.x. x-x. x.x- --',
  },
  lead: { p: with_(squareLead, { vol: 0.12 }), lo: 68, hi: 88 },
  counter: { p: bell, lo: 60, hi: 76, rhythm: 'x--- ---- x--- --' },
  bass: { p: pulseBass, lo: 28 },
  arp: { p: vibes, rate: 2, seq: [0, 2, 4, 1, 3, 5, 2], center: 72 },
  pad: { p: glassPad, center: 64 },
  kit: kit({ kick: { f0: 150, f1: 55, dec: 0.22, vol: 0.65 } }),
  drums: { main: { k: 'x... .... x... ..', s: '.... x... ..x. ..', h: 'x.x. x.x. x.x. x.' } },
  perc: { main: { r: '..x. ..x. ..x. x.', b: '.... .... .... x.' } },
  fills: FILLS14,
  mix: { arp: 0.3 },
}

const boss: TrackSpec = {
  bpm: 164, key: 0, scale: 'phrygian', seed: 1111, intensity: 2,
  form: ['A', 'B', 'A', 'C'], loopFrom: 0,
  sections: {
    A: { bars: ['i5', 'i5', 'bII5', 'i5', 'i5', 'i5', 'bVI5', 'V5'], bass: 'R.RR .RR. R.RR .RO.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['iv', 'bII', 'iv', 'V', 'iv', 'bII', 'bVII', 'V'], bass: 'R.R. O.R. R.R. O.RA', drums: 'main', mel: 'f g f h f g c e' },
    C: { bars: ['i', 'bII', 'bIII', 'bII', 'i', 'bII', 'V', 'V'], bass: 'RRRR RRRR RRRR ROOR', drums: 'blast', mel: 'c c h h c c d e' },
  },
  rhythms: {
    a: 'x-x- x.x. x-x- x-x-', b: 'x.x. x-x- x.x. x---', c: 'x.x. x.x. x.x. x.x.', d: 'x-x- x-x- x--- ----',
    e: 'x--- ---- x--- ----', f: 'x--- x--- x-x- x-x-', g: 'x-x- x-x- x--- x---', h: 'x.x. x.x- x-x- x---',
  },
  lead: { p: sawLead, lo: 60, hi: 84 },
  counter: { p: brassLead, lo: 55, hi: 70, rhythm: 'x--- ---- x--- x---' },
  bass: { p: with_(sawBass, { vol: 0.26, lp: { f: 420, q: 5, env: 3, dec: 0.08, kt: 0.5 } }), lo: 24 },
  arp: { p: sawPluck, rate: 1, seq: [0, 1, 2, 0, 1, 2, 3, 2], center: 60, gate: 0.7 },
  pad: { p: darkPad, center: 58 },
  kit: kit({ kick: { f0: 165, f1: 45, dec: 0.25, sq: 0.18 }, snare: { tone: 200, dec: 0.16, bp: 2400, vol: 0.45 }, metal: { f: 380 } }),
  drums: {
    main: { k: 'x.x. ..x. x.x. ..x.', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
    blast: { k: 'x.x. x.x. x.x. x.x.', s: '.... x... .... x...', h: 'xgxg xgxg xgxg xgxg' },
  },
  perc: { main: { b: '..x. ..x. ..x. ..x.', t: '.... .... .... ..xx' } },
  fills: FILLS,
  mix: { arp: 0.3, lead: 0.55 },
}

const finalBoss: TrackSpec = {
  bpm: 156, key: 10, scale: 'harmonic', seed: 1213, intensity: 2,
  form: ['intro', 'A', 'B', 'C', 'A', 'B'], loopFrom: 1,
  sections: {
    intro: { bars: ['i', 'i', 'bVI', 'V'], bass: 'R--- ---- R--- ----', drums: 'toms' },
    A: { bars: ['i', 'bVI', 'iv', 'V', 'i', 'bVI', 'bII', 'V'], bass: 'R.O. R.O. R.O. R.O.', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['bVI', 'bVII', 'i', 'i', 'bVI', 'bVII', 'V', 'V'], bass: 'R.R. O.R. R.R. O.RA', drums: 'main', mel: 'f g f h f g c e', melShift: 3 },
    C: { bars: ['iv', 'i', 'bII', 'V', 'iv', 'i', 'bVI', 'V'], bass: 'R--- ---- R--- --O-', drums: 'half', mel: 'a a f f h h d e' },
  },
  rhythms: {
    a: 'x--- x-x- x--- x-x-', b: 'x-x- x--- x--- ----', c: 'x.x. x.x. x-x- x-x-', d: 'x--- --x- ---- x---',
    e: 'x--- ---- ---- ----', f: 'x--- --x- x--- --x-', g: 'x-x- x-x- x-x- x---', h: 'x--- x--- x-x- x-x-',
  },
  lead: { p: brassLead, lo: 63, hi: 84 },
  counter: { p: with_(choirVoice, { vowel: ['a', 'o'] }), lo: 58, hi: 74, rhythm: 'x--- ---- x--- ----' },
  bass: { p: sawBass, lo: 34 },
  arp: { p: sawPluck, rate: 1, seq: [0, 1, 2, 1, 3, 2, 1, 2], center: 62, gate: 0.7 },
  pad: { p: with_(choirPad, { vowel: ['o', 'a'] }), center: 60 },
  kit: kit({ kick: { f0: 150, f1: 40, dec: 0.4, sq: 0.12 }, tom: { f: 85, vol: 0.35 } }),
  drums: {
    toms: { k: 'x... .... x... ....', t: 'x..x ..x. .... ....', m: '.... .... x..x ..x.' },
    main: { k: 'x..x ..x. x.x. .x..', s: '.... x... .... x...', h: 'x.x. x.x. x.x. x.x.' },
    half: { k: 'x... .... ..x. ....', s: '.... .... x... ....', h: 'x.x. x.x. x.x. x.x.' },
  },
  perc: { main: { t: '..x. .... ..x. ....', n: '.... .... .... x.x.', p: 'g.g. g.g. g.g. g.g.' } },
  fills: FILLS,
  mix: { pad: 0.6, arp: 0.28 },
}

const ending: TrackSpec = {
  bpm: 84, key: 3, scale: 'major', seed: 1315, intensity: 2,
  form: ['A', 'B', 'A', 'C', 'B'], loopFrom: 0,
  sections: {
    A: { bars: ['IM7', 'iii7', 'IVM7', 'V', 'vi7', 'IVM7', 'ii7', 'Vsus4 V'], bass: 'R--- ---- R--- 5---', drums: 'main', mel: 'a b a c a b d e' },
    B: { bars: ['IVM7', 'V', 'iii7', 'vi7', 'ii7', 'V', 'IM7', 'IM7'], bass: 'R--- ---- R--- 5---', drums: 'main', mel: 'f g f h f g d e' },
    C: { bars: ['bVIM7', 'bVII', 'IM7', 'IM7', 'bVIM7', 'bVII', 'Vsus4', 'V'], bass: 'R--- ---- ---- ----', drums: 'main', mel: 'g _ h _ f _ d e' },
  },
  rhythms: {
    a: 'x--- --x- x-x- x---', b: 'x--- x--- x--- ----', c: '..x- x-x- x--- --..', d: 'x--- --x- ---- x---',
    e: 'x--- ---- ---- ----', f: 'x-x- x--- x--- x---', g: 'x--- ---- x-x- x---', h: '.... x-x- x--- ----',
  },
  lead: { p: fluteLead, lo: 63, hi: 82 },
  counter: { p: vibes, lo: 58, hi: 72, rhythm: 'x--- ---- x--- ----' },
  bass: { p: subBass, lo: 27 },
  arp: { p: glassPluck, rate: 2, seq: [0, 1, 2, 3, 2, 1, 2, 3], center: 63 },
  pad: { poly: with_(ep, { vol: 0.07 }), center: 60 },
  kit: kit({ kick: { f0: 100, f1: 42, dec: 0.3, vol: 0.55, click: 0.05 }, rim: { vol: 0.12 } }),
  drums: { main: { k: 'x... .... x.x. ....', r: '.... x... .... x...', p: 'g.g. g.g. g.g. g.g.' } },
  perc: { main: { h: '..g. ..g. ..g. ..g.' } },
  fills: [{ k: '.... .... x... ....', r: '.... .... .... x.xx' }],
  mix: { pad: 0.8, arp: 0.3 },
  rev: { lead: 0.45 },
}

export const TRACKS: Record<TrackId, TrackSpec> = {
  title, hangar, m1, m2, m3, m4, m5, m6, m7, secret, boss, final_boss: finalBoss, ending,
}
