# EMBERLINE

A vertical shoot'em up in the Tyrian tradition: arcade combat, credits, a quartermaster between missions, and a ship that ends the campaign carrying far more guns than a salvage courier should. Original game, original universe. Every sprite, background and sound effect is generated in code. The soundtrack (13 instrumental tracks) was generated with Google's Lyria 3 model from written music briefs; it's the only asset in the repository.

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
| Special | X / K | X / Y |
| Precision (slow move) | Shift / L | LB / LT |
| Pause | Esc / P | Start |
| Menus | Arrows, Enter, Esc; Q/E switch hangar slots | Stick, A, B, LB/RB |

"Always fire" is in Settings if you'd rather not hold the button. The white dot in the middle of the ship is your whole hitbox.

## How the game fits together

Each mission pays credits: what you pick up in flight, a mission fee, and bonuses (ground targets destroyed, no hull damage, accuracy, long kill chains, secrets). Dying costs you the credits collected on that attempt, never your equipment.

In Dasha's hangar you fit eight slots: front gun, rear gun, two pods, reactor, shield, hull plating and a special. Upgrades change how a weapon fires, not only how hard, and the shop shows each level's change plus a live test range. Everything runs on reactor power. The power bar in the hangar tells you when your guns and shield regen draw more than the reactor produces; in flight that means stuttering fire once the reserve drains. Buying a new item trades in the old one at 80% of what you spent on it, and "Undo visit" reverts every change made since you entered the hangar.

Some gear never shows up in the shop until you find its data core. The secrets are in the missions. The game doesn't point at them.

Difficulty modes change behaviour as well as numbers: Warhawk enemies lead their shots and elites show up more often, and on Emberline (unlocked by finishing a campaign) destroyed Choir craft fire back as they die.

Progress, settings and records save to the browser's localStorage. Settings has an "Erase save data" button.

## Debug mode

Add `?debug` to the URL.

| Key | Effect |
|---|---|
| F1 | God mode |
| F2 | +10,000 credits |
| F3 | Destroy everything on screen |
| F4 | Skip to the boss |
| F6 | Slow motion |
| F7 | Hitboxes |
| F8 | FPS and entity counts |
| F9 | Front gun +1 level |
| F10 | Win the mission |

Debug mode also exposes `window.__emb` for automated playtesting: `start(missionId, {loadout, difficulty})`, `autopilot(true)`, `god(true)`, `simulate(seconds)` (headless fast-forward), `state()`, `skipToBoss()`.

## Tests

```sh
pnpm test         # shop, economy, save/load, combat rules, every weapon level, every mission simulated to completion
pnpm typecheck
BALANCE=1 npx vitest run tests/balance.sim.test.ts   # whole-campaign simulation with a greedy shopper
BOSS=m6 npx vitest run tests/boss.sim.test.ts        # boss time-to-kill for one mission, three builds
```

The balance simulation flies the full campaign three times, once per build style (pulse, spread, heavy), with the autopilot and no god mode, and prints what each run earned and bought along the way. The economy was tuned against those numbers rather than hand estimates.

The soundtrack lives in `public/music/`. `tools/generate-music.py` holds the prompt for every track and regenerates any of them (needs `GEMINI_API_KEY`); `tools/music-loops.py` finds each track's loop points, since generated songs end with a fade rather than looping. The synth score in `src/audio/` is still there as a fallback if a file fails to load.

`tools/` also holds the developer pages (`gallery.html` for sprites, `bg-lab.html` for biomes, `audio-lab.html` to audition every sound and track) and the Playwright scripts used for screenshots.

## Layout

- `src/game`: simulation (world, player, weapons, enemies' movement, level scripting, bosses, campaign/shop rules)
- `src/data`: content (items, enemy definitions, mission scripts)
- `src/render`: procedural art, biomes, particles, HUD
- `src/audio`: WebAudio synthesis, sound effects and the procedural composer
- `src/ui`: menus, hangar, briefing and results screens
