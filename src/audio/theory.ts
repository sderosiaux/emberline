export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  harmonic: [0, 2, 3, 5, 7, 8, 11],
} as const

export type ScaleName = keyof typeof SCALES

export interface Chord {
  /** absolute pitch class */
  root: number
  /** ascending intervals from root */
  ints: number[]
}

const DEG: Record<string, number> = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 }
const RE = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/

/**
 * Roman numerals relative to the major scale of `key` (so minor keys write bIII, bVI, bVII).
 * Case = triad quality. Suffixes: o (dim), + (aug), 5 (power), sus2, sus4, 7, M7, add9.
 */
export function parseChord(sym: string, key: number): Chord {
  const m = RE.exec(sym)
  if (!m) throw new Error(`bad chord symbol: ${sym}`)
  const acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0
  const upper = m[2] === m[2].toUpperCase()
  const suf = m[3]
  let ints: number[] = upper ? [0, 4, 7] : [0, 3, 7]
  if (suf.startsWith('o')) ints = [0, 3, 6]
  else if (suf.startsWith('+')) ints = [0, 4, 8]
  else if (suf === '5') ints = [0, 7]
  if (suf.includes('sus2')) ints = [0, 2, 7]
  if (suf.includes('sus4')) ints = [0, 5, 7]
  if (suf.includes('M7')) ints = [...ints, 11]
  else if (suf.includes('7')) ints = [...ints, 10]
  if (suf.includes('add9')) ints = [...ints, 14]
  return { root: (key + DEG[m[2].toUpperCase()] + acc + 24) % 12, ints }
}

export const chordPcs = (c: Chord): number[] => c.ints.map((i) => (c.root + i) % 12)

export const chordKey = (c: Chord): string => `${c.root}:${c.ints.join(',')}`

/** Place pitch class `pc` in [lo, lo+12). */
export const placeAbove = (pc: number, lo: number): number => lo + ((((pc - lo) % 12) + 12) % 12)

/** Nearest midi note with pitch class in `pcs` to `target`; ties resolved toward `dir`. */
export function nearestPc(target: number, pcs: number[], dir = 1): number {
  for (let d = 0; d < 12; d++) {
    const a = target + d * (dir >= 0 ? 1 : -1)
    const b = target - d * (dir >= 0 ? 1 : -1)
    if (pcs.includes(((a % 12) + 12) % 12)) return a
    if (pcs.includes(((b % 12) + 12) % 12)) return b
  }
  return target
}
