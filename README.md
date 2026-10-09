# EMBERLINE

A vertical shoot'em up in the Tyrian tradition: arcade combat, credits, a quartermaster between missions, and a ship that ends the campaign carrying far more guns than a salvage courier should. Original game, original universe. Every sprite and background is generated in code. Sound effects are designed offline in Python (`tools/generate-sfx.py`, layered synthesis exported as WAV samples), and the soundtrack (13 instrumental tracks) was generated with Google's Lyria 3 model from written music briefs.

You fly the Kestrel against the Choir, a mining-consortium intelligence that turned the Verge colonies' machines into a fleet. Seven missions, one hidden detour, eight bosses.

Play it in the browser: https://sderosiaux.github.io/emberline/

## Run it

Requires Node 20+ and pnpm (npm works too).

```sh
pnpm install
pnpm dev          # http://127.0.0.1:5180
```

Production build (static files in `dist/`, open with any static server):

```sh
pnpm build
pnpm preview
```

The build uses relative paths, so `dist/` can be dropped into any folder or itch.io-style host.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | Arrows / WASD | Left stick / d-pad |
| Fire (hold) | Space / Z / J | A / RT / RB |
| Special (campaign) / Bomb (arcade) | X / K | X |
| Flip into the Rift (arcade) | C / V | Y |
| Precision (slow move) | Shift / L | LB / LT |
| Pause | Esc / P | Start |
| Menus | Arrows, Enter, Esc; Q/E switch hangar slots | Stick, A, B, LB/RB |

"Always fire" is in Settings if you'd rather not hold the button. The white dot in the middle of the ship is your whole hitbox.

## Arcade mode

A separate danmaku-flavoured run picked from the title screen: five stages back to back, no hangar. One hit costs a life, X bombs the screen clear, enemies drop red power items (they grow your gun and add drones) and blue point items (worth full value above the collection line near the top, which also pulls every item to you). Holding Shift focuses: the ship slows and the gun tightens into a stronger stream. Kills and grazes fill an XP bar; each level freezes the run and offers three upgrade cards (ricochet, pierce, exploding kills, arc relays, graze sparks, orbit blades, bomb echo, longer Rift stays…) whose ranks stack into a build for that run. Big ships and bosses drop weapon capsules that cycle between Vulcan, Spread, Laser and Homing; you get whichever one it shows when you touch it. Every boss phase is a timed spell card; clear it without dying or bombing for a capture bonus.

Grazing bullets fills the Rift gauge. With one full segment, C flips you into the Rift, a negative-red copy of the same stage: only the bullets of the layer you're in can hit you, so flipping doubles as an escape, and everything scores ×3 with stronger shots. The scroll speeds up, the enemies fire harder and the gauge drains until you're thrown back out. The Rift has its own track and sound set (Lyria, ElevenLabs).

## How the game fits together

Each mission pays credits: what you pick up in flight, a mission fee, and bonuses (ground targets destroyed, no hull damage, accuracy, long kill chains, secrets). Dying costs you the credits collected on that attempt, never your equipment.

In Dasha's hangar you fit eight slots: front gun, rear gun, two pods, reactor, shield, hull plating and a special. Upgrades change how a weapon fires, not only how hard, and the shop shows each level's change plus a live test range. Everything runs on reactor power. The power bar in the hangar tells you when your guns and shield regen draw more than the reactor produces; in flight that means stuttering fire once the reserve drains. Buying a new item trades in the old one at 80% of what you spent on it, and "Undo visit" reverts every change made since you entered the hangar.

Some gear never shows up in the shop until you find its data core. The secrets are in the missions. The game doesn't point at them.

Every mission has one moment where the camera pulls back, Supreme Commander style, to show a swarm massing above the field. For the next seven seconds the whole wide view is playable: fly into the open ground, flank the formation, get above it. Then the camera dives back in and herds the ship home (it's invulnerable while that happens). Bosses get a shorter cinematic pull-back on arrival, so you see the whole thing before it fills the screen. Above the field you see the real ground still to come. To each side, the biome paints another strip of its own tiles, in a different order, and the edges blend into the field. It's new terrain, not a copy of the screen.

Difficulty modes change behaviour as well as numbers: Warhawk enemies lead their shots and elites show up more often, and on Emberline (unlocked by finishing a campaign) destroyed Choir craft fire back as they die.

Progress, settings and records save to the browser's localStorage. Settings has an "Erase save data" button.

## Debug mode

Add `?debug` to the URL.

| Key | Effect |
|---|---|
| F1 | God mode |
| F2 | +10,000 credits (campaign) · 99 lives and bombs (arcade) |
| F3 | Destroy everything on screen |
| F4 | Skip to the boss |
| F5 | Skip to the next camera pull-back |
| F6 | Slow motion |
| F7 | Hitboxes |
| F8 | FPS and entity counts |
| F9 | Front gun +1 level (campaign) · next weapon (arcade) |
| F10 | Win the mission |

Debug mode also exposes `window.__emb` for automated playtesting: `start(missionId, {loadout, difficulty})`, `autopilot(true)`, `god(true)`, `simulate(seconds)` (headless fast-forward), `state()`, `skipToBoss()`, `skipToReveal()`, `reveal(zoom, hold)`.

## Tests

```sh
pnpm test         # shop, economy, save/load, combat rules, every weapon level, every mission simulated to completion
pnpm typecheck
BALANCE=1 npx vitest run tests/balance.sim.test.ts   # whole-campaign simulation with a greedy shopper
BOSS=m6 npx vitest run tests/boss.sim.test.ts        # boss time-to-kill for one mission, three builds
```

The balance simulation flies the full campaign three times, once per build style (pulse, spread, heavy), with the autopilot and no god mode, and prints what each run earned and bought along the way. The economy was tuned against those numbers rather than hand estimates.

The soundtrack lives in `public/music/`. `tools/generate-music.py` holds the prompt for every track and regenerates any of them (needs `GEMINI_API_KEY`); `tools/music-loops.py` finds each track's loop points, since generated songs end with a fade rather than looping. The synth score in `src/audio/` is still there as a fallback if a file fails to load.

`tools/` also holds the developer pages (`gallery.html` for sprites, `bg-lab.html` for biomes, `audio-lab.html` to audition every sound effect and its variants) and the Playwright scripts used for screenshots.

## Layout

- `src/game`: simulation (world, player, weapons, enemies' movement, level scripting, bosses, campaign/shop rules)
- `src/data`: content (items, enemy definitions, mission scripts)
- `src/render`: procedural art, biomes, particles, HUD
- `src/audio`: WebAudio synthesis, sound effects and the procedural composer
- `src/ui`: menus, hangar, briefing and results screens
