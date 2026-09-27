import type { Background, BiomeId } from './kit'
import { createCinder } from './cinder'
import { createGarden } from './garden'
import { createGlasswater } from './glasswater'
import { createGraveyard } from './graveyard'
import { createHalo } from './halo'
import { createHeart } from './heart'
import { createRime } from './rime'
import { createShoals } from './shoals'

export type { Background, BiomeId } from './kit'

export const BIOMES: readonly BiomeId[] = ['cinder', 'glasswater', 'rime', 'shoals', 'halo', 'graveyard', 'heart', 'garden']

const MAKERS: Record<BiomeId, (seed: number) => Background> = {
  cinder: createCinder,
  glasswater: createGlasswater,
  rime: createRime,
  shoals: createShoals,
  halo: createHalo,
  graveyard: createGraveyard,
  heart: createHeart,
  garden: createGarden,
}

/**
 * Terrain tiles are cached per (biome, seed): the first call pays ~50–100 ms,
 * later calls are near free. Extra tile variants finish baking in ~1 ms slices
 * during the first seconds of update().
 */
export function createBackground(id: BiomeId, seed = 1): Background {
  return guarded(MAKERS[id](seed))
}

/**
 * Hardening shared by every biome:
 * - a NaN/Infinity dt or scroll would poison positions and gradient colours for
 *   the rest of the session (blank base layer), so inputs are sanitised (dt is
 *   not clamped: the ground must stay locked to the world's scroll);
 * - canvas state is always restored, even if a draw throws, so one bad frame
 *   can't leave a clip/alpha/composite behind for the rest of the renderer.
 */
function guarded(bg: Background): Background {
  return {
    update(dt, scroll) {
      const d = Number.isFinite(dt) && dt > 0 ? dt : 0
      bg.update(d, Number.isFinite(scroll) ? scroll : 0)
    },
    drawBase(ctx) {
      ctx.save()
      try { bg.drawBase(ctx) } finally { ctx.restore() }
    },
    drawOver(ctx) {
      ctx.save()
      try { bg.drawOver(ctx) } finally { ctx.restore() }
    },
    setPhase(name) { bg.setPhase(name) },
  }
}
