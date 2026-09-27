export const TAU = Math.PI * 2

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => (v - a) / (b - a)
export const smoothstep = (t: number) => t * t * (3 - 2 * t)
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (ax - bx) ** 2 + (ay - by) ** 2
export const angleTo = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax)

/** Shortest signed difference between two angles. */
export const angleDiff = (a: number, b: number) => {
  let d = (b - a) % TAU
  if (d > Math.PI) d -= TAU
  if (d < -Math.PI) d += TAU
  return d
}

export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target)

/** Mulberry32: tiny deterministic PRNG, used for procedural art/music/terrain so they are stable across runs. */
export function rng(seed: number) {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    range: (a: number, b: number) => a + (b - a) * next(),
    int: (a: number, b: number) => Math.floor(a + (b - a + 1) * next()),
    pick: <T>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  }
}
export type Rng = ReturnType<typeof rng>

/** Non-deterministic helpers for gameplay jitter. */
export const rand = (a: number, b: number) => a + (b - a) * Math.random()
export const randInt = (a: number, b: number) => Math.floor(a + (b - a + 1) * Math.random())
export const chance = (p: number) => Math.random() < p
export const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)]

/** Cheap 1D value noise, deterministic. */
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x)
  const f = x - i
  const h = (n: number) => {
    let t = (n * 374761393 + seed * 668265263) | 0
    t = Math.imul(t ^ (t >>> 13), 1274126177)
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296
  }
  return lerp(h(i), h(i + 1), smoothstep(f))
}

/** 2D value noise in [0,1]. */
export function noise2(x: number, y: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y)
  const xf = x - xi, yf = y - yi
  const h = (a: number, b: number) => {
    let t = (a * 374761393 + b * 668265263 + seed * 2147483647) | 0
    t = Math.imul(t ^ (t >>> 13), 1274126177)
    return ((t ^ (t >>> 16)) >>> 0) / 4294967296
  }
  const u = smoothstep(xf), v = smoothstep(yf)
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v)
}

export function fbm2(x: number, y: number, seed = 0, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0
  for (let i = 0; i < oct; i++) {
    s += a * noise2(x * f, y * f, seed + i * 17)
    n += a
    a *= 0.5
    f *= 2
  }
  return s / n
}
