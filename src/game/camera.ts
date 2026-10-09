import { PW, PH } from './consts'
import { clamp, smoothstep } from '../core/math'

export interface RevealOpts {
  /** Target zoom (1 = normal framing, 0.5 = twice the width and height). */
  zoom?: number
  /** Seconds pulling back, holding wide, and pushing back in. */
  out?: number
  hold?: number
  back?: number
  /** Wide phase is playable: the whole view becomes the playfield until the push back in. */
  play?: boolean
}

export type CamPhase = 'idle' | 'out' | 'hold' | 'back'

/**
 * Strategic pull-back (Supreme Commander style): the view widens to show what is
 * massing above the playfield, holds, then pushes back in. The view stays anchored
 * on the playfield's bottom edge so the player's ship never leaves the frame.
 *
 * Two flavours: a cinematic one (boss entrances: enemies hold fire, the field stays
 * the field) and a playable one (hordes: while wide, the whole view is the playfield,
 * and it shrinks back with the camera, herding the ship home).
 */
export class Camera {
  zoom = 1
  phase: CamPhase = 'idle'
  play = false
  private from = 1
  private to = 1
  private t = 0
  private out = 0
  private hold = 0
  private back = 0

  reveal(o: RevealOpts = {}) {
    this.from = this.zoom
    this.to = clamp(o.zoom ?? 0.55, 0.3, 1)
    this.out = o.out ?? 0.9
    this.hold = o.hold ?? 2
    this.back = o.back ?? (o.play ? 1.2 : 0.8)
    this.play = o.play ?? false
    this.t = 0
    this.phase = 'out'
  }

  get busy() { return this.phase !== 'idle' }
  /** Wide view is the playfield right now (playable reveal, any phase). */
  get playing() { return this.play && this.busy }
  /** Enemies hold fire during a cinematic pull-back, and while a playable one is still opening. */
  get calm() { return this.play ? this.phase === 'out' : this.zoom < 0.92 }
  /** 0 at normal framing → 1 at a wide pull-back; drives the tactical overlay. */
  get wide() { return clamp((1 - this.zoom) / 0.35, 0, 1) }
  /** Seconds since the hold started (0 outside it). */
  get holdT() { return this.phase === 'hold' ? this.t - this.out : 0 }
  /** Fraction of the wide hold left (1 while pulling back, 0 once heading back in). */
  get holdLeft() { return this.phase === 'out' ? 1 : this.phase === 'hold' ? 1 - (this.t - this.out) / this.hold : 0 }

  /** Returns the phase entered this frame, if any. */
  update(dt: number): CamPhase | null {
    if (this.phase === 'idle') return null
    this.t += dt
    const { out, hold, back } = this
    const before = this.phase
    // interpolate in log space so the pull-back feels like constant camera speed
    const lerp = (a: number, b: number, k: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * smoothstep(k))
    if (this.t < out) { this.zoom = lerp(this.from, this.to, this.t / out); this.phase = 'out' }
    else if (this.t < out + hold) { this.zoom = this.to; this.phase = 'hold' }
    else if (this.t < out + hold + back) { this.zoom = lerp(this.to, 1, (this.t - out - hold) / back); this.phase = 'back' }
    else { this.zoom = 1; this.phase = 'idle' }
    return this.phase !== before ? this.phase : null
  }

  /** World point at the centre of the view. */
  get cx() { return PW / 2 }
  get cy() { return PH - PH / (2 * this.zoom) }
  /** Visible world rectangle. */
  view() {
    const w = PW / this.zoom, h = PH / this.zoom
    return { x: this.cx - w / 2, y: this.cy - h / 2, w, h }
  }
}
