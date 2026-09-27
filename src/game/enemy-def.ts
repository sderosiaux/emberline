import type { Enemy, Layer } from './entities'
import type { World } from './world'

export type ExplosionSize = 'tiny' | 'small' | 'medium' | 'large' | 'huge'

export interface EnemyDef {
  id: string
  hp: number
  /** Hit radius. */
  r: number
  sprite: string
  layer: Layer
  score: number
  credits: number
  /** Special-meter gain on kill. */
  charge: number
  explode: ExplosionSize
  /** Contact damage to the player (air units only). */
  contact?: number
  armor?: number
  /** Counts toward "ground targets destroyed" stat. */
  target?: boolean
  noShadow?: boolean
  /** Scale sprite (elite variants are drawn slightly larger). */
  scale?: number
  init?(e: Enemy, w: World): void
  /** Behaviour: attacks and anything the mover doesn't do. */
  update?(e: Enemy, w: World, dt: number): void
  /** Extra drawing on top of the body sprite (turret barrels, glows). */
  draw?(ctx: CanvasRenderingContext2D, e: Enemy, w: World): void
  /** Custom full drawing instead of the sprite. */
  drawBody?(ctx: CanvasRenderingContext2D, e: Enemy, w: World): void
  onDeath?(e: Enemy, w: World): void
  /** Boss parts keep their designed hp (no mission-tier scaling). */
  boss?: boolean
  /** Drawn before ground/air sorting — used for big props like trains. */
  z?: number
}
