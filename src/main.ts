import '@fontsource/chakra-petch/500.css'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource/jetbrains-mono/500.css'
import '@fontsource/jetbrains-mono/600.css'
import '@fontsource/jetbrains-mono/700.css'
import './ui/style.css'
import { applyCssTokens } from './ui/theme'
import { registerArt } from './render/art'
import { registerProps } from './render/props'
import { registerBossArt } from './render/boss-art'
import { registerArt_m2 } from './render/art-m2'
import { registerArt_m3 } from './render/art-m3'
import { registerArt_m4 } from './render/art-m4'
import { registerArt_garden } from './render/art-garden'
import { registerArt_m5 } from './render/art-m5'
import { registerArt_m6 } from './render/art-m6'
import { registerArt_m7 } from './render/art-m7'
import { initBulletTextures, initLaserTextures } from './render/bullets'
import { registerFxArt } from './render/fx-art'
import { drawRef } from './data/enemies'
import { getSprite, drawSprite } from './render/sprites'
import { App } from './app'
import { loadPaintedArt } from './render/painted-art'

applyCssTokens(document.documentElement)
registerArt()
registerProps()
registerBossArt()
registerArt_m2(); registerArt_m3(); registerArt_m4(); registerArt_garden(); registerArt_m5(); registerArt_m6(); registerArt_m7()
initBulletTextures()
initLaserTextures()
registerFxArt()
drawRef.sprite = (ctx, key, x, y, rot, scale, alpha, flash) => drawSprite(ctx, getSprite(key), x, y, rot, scale, alpha, flash)

// painted boss art streams in behind the title screen; bosses use procedural art until it lands
void loadPaintedArt()
document.fonts.ready.then(() => new App())
