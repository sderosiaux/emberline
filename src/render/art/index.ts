import { registerPlayer } from './player'
import { registerEnemies } from './enemies'
import { registerGround } from './ground'
import { registerShots, registerPickups } from './shots'

/** Define every procedural sprite. Call once before prewarmAll(). */
export function registerArt(): void {
  registerPlayer()
  registerEnemies()
  registerGround()
  registerShots()
  registerPickups()
}
