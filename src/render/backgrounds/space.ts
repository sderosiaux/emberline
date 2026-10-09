/** Shared pieces for the space biomes (shoals, graveyard, halo's far layer). */
import { clamp, smoothstep } from '../../core/math'
import { H, SeamNoise, area, TILE_H, W, cMix, cMul, cOut, cSet, drain, field, hash3, upscale, type Ctx } from './kit'

export interface NebulaStyle {
  base: Uint8Array
  /** gas glow colour, dust-lane colour */
  gas: [number, number, number]
  lane: [number, number, number]
  gasAmt: number
  laneAmt: number
}

/** Fully periodic nebula tile (seed == seam seed ⇒ every lattice row repeats with the period). */
export function nebulaTile(seed: number, st: NebulaStyle, h = TILE_H) {
  const fw = W / 4, fh = h / 4
  const n = new SeamNoise(fh, seed, seed)
  const low = drain(field(fw, fh, (x, y, o, i) => {
    // fully periodic noise tolerates y-warps too
    const wx = x + (n.fbm(x, y, 32, 32, 3, 1) - 0.5) * 70
    const wy = y + (n.fbm(x, y, 32, 32, 3, 5) - 0.5) * 70
    const b = n.fbm(wx, wy, 64, 64, 4, 2)
    cSet(st.base, b)
    const gas = smoothstep(clamp((n.fbm(wx, wy, 64, 64, 4, 3) - 0.5) * 3, 0, 1))
    cMix(st.gas[0], st.gas[1], st.gas[2], gas * st.gasAmt)
    const lane = n.ridge(wx, wy, 64, 64, 4, 4)
    cMix(st.lane[0], st.lane[1], st.lane[2], smoothstep(clamp((lane - 0.7) * 4, 0, 1)) * st.laneAmt)
    cMul(0.97 + hash3(x, y, 9) * 0.06)
    cOut(o, i)
  }))
  return upscale(low, W, h)[0]
}

/** A vertically repeating layer moving at `factor` × ground speed. */
export class Parallax {
  pos = 0
  constructor(readonly img: HTMLCanvasElement, readonly factor: number, readonly drift = 0) {}
  update(dt: number, scroll: number) { this.pos += (scroll * this.factor + this.drift) * dt }
  draw(ctx: Ctx, alpha = 1) {
    const h = this.img.height
    // side columns of a wide view get their own phase (kit `area`), so a flipped column doesn't mirror the sky
    let y = Math.round((this.pos + area.shift) % h) - h
    while (y > -area.top) y -= h
    ctx.globalAlpha = alpha
    for (; y < H; y += h) ctx.drawImage(this.img, 0, y)
    ctx.globalAlpha = 1
  }
}
