// Manual audition page: drives the real `audio` facade exactly as the game would.

import { audio, type Intensity, type LoopHandle, type LoopName, type SfxName, type TrackId } from '../src/audio/audio'
import { SFX } from '../src/audio/sfx'
import { TRACKS } from '../src/audio/tracks'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const btn = (label: string, onClick: () => void, extra = ''): HTMLButtonElement => {
  const b = document.createElement('button')
  b.innerHTML = extra ? `<span>${label}</span><small>${extra}</small>` : label
  b.addEventListener('click', onClick)
  return b
}

document.addEventListener('pointerdown', () => {
  audio.unlock()
  $('status').textContent = 'unlocked'
})

// ---------------------------------------------------------------- music
const trackButtons = new Map<TrackId, HTMLButtonElement>()
const refreshTracks = (): void => {
  for (const [id, b] of trackButtons) b.classList.toggle('on', audio.music.current() === id)
  for (const [lvl, b] of intensityButtons) b.classList.toggle('on', lvl === currentLevel)
}
for (const id of Object.keys(TRACKS) as TrackId[]) {
  const t = TRACKS[id]
  const b = btn(id, () => {
    audio.music.play(id, { fade: 1.2 })
    currentLevel = t.intensity
    refreshTracks()
  }, `${t.bpm} bpm · ${t.steps === 14 ? '7/8' : '4/4'}`)
  trackButtons.set(id, b)
  $('tracks').appendChild(b)
}

let currentLevel: Intensity = 1
const intensityButtons = new Map<Intensity, HTMLButtonElement>()
for (const lvl of [0, 1, 2, 3] as Intensity[]) {
  const b = btn(['0 ambient', '1 combat', '2 intense', '3 climax'][lvl], () => {
    currentLevel = lvl
    audio.music.setIntensity(lvl)
    refreshTracks()
  })
  intensityButtons.set(lvl, b)
  $('intensity').appendChild(b)
}

$('stop').addEventListener('click', () => {
  audio.music.stop(1.5)
  refreshTracks()
})
let paused = false
$('pause').addEventListener('click', () => {
  paused = !paused
  audio.setPaused(paused)
  $('pause').classList.toggle('on', paused)
  audio.sfx('ui_select')
})
$('duck').addEventListener('click', () => {
  audio.duck(0.35, 3)
  audio.sfx('radio')
})

// ---------------------------------------------------------------- mix
for (const k of ['master', 'music', 'sfx'] as const) {
  $<HTMLInputElement>(`v-${k}`).addEventListener('input', (e) => audio.setVolumes({ [k]: Number((e.target as HTMLInputElement).value) }))
}
const opts = (): { pan: number; pitch: number } => ({
  pan: Number($<HTMLInputElement>('o-pan').value),
  pitch: Number($<HTMLInputElement>('o-pitch').value),
})

// ---------------------------------------------------------------- loops
const loops = new Map<LoopName, LoopHandle>()
for (const name of ['beam', 'charge', 'alarm'] as LoopName[]) {
  const b = btn(name, () => {
    const h = loops.get(name)
    if (h) {
      h.stop()
      loops.delete(name)
    } else loops.set(name, audio.loop(name, { pitch: Number($<HTMLInputElement>('l-pitch').value) }))
    b.classList.toggle('on', loops.has(name))
  })
  $('loops').appendChild(b)
}
$<HTMLInputElement>('l-pitch').addEventListener('input', (e) => {
  for (const h of loops.values()) h.set({ pitch: Number((e.target as HTMLInputElement).value) })
})

// ---------------------------------------------------------------- stress
const every = (ms: number, times: number, fn: (i: number) => void): void => {
  let i = 0
  const id = setInterval(() => {
    fn(i++)
    if (i >= times) clearInterval(id)
  }, ms)
}
$('stress-hits').addEventListener('click', () => {
  for (let i = 0; i < 60; i++) audio.sfx('hit_small', { pan: Math.random() * 2 - 1 })
})
$('stress-fire').addEventListener('click', () => every(66, 45, () => audio.sfx('shot_pulse', { pan: -0.1 })))
$('stress-war').addEventListener('click', () => {
  const pool: SfxName[] = ['shot_pulse', 'shot_scatter', 'hit_small', 'hit_small', 'enemy_shot', 'expl_small', 'shot_missile', 'hit_armor', 'expl_medium', 'pickup_credit']
  every(16, 300, (i) => {
    audio.sfx(pool[i % pool.length], { pan: Math.random() * 2 - 1 })
    if (i % 3 === 0) audio.sfx('hit_small', { pan: Math.random() * 2 - 1 })
  })
})
$('credits').addEventListener('click', () => every(90, 12, (i) => audio.sfx('pickup_credit', { pitch: 1 + i / 11 })))

// ---------------------------------------------------------------- sfx grid
const groups: [string, RegExp][] = [
  ['Player weapons', /^shot_/], ['Enemy', /^enemy_/], ['Hits & explosions', /^(hit|expl|chain)/],
  ['Shield & hull', /^(shield|hull|low_hull|player_death)/], ['Pickups', /^pickup_/], ['Specials', /^(special|energy)/],
  ['Boss & events', /^(boss|secret|radio|mission|game_over)/], ['UI', /^ui_/],
]
const all = Object.keys(SFX) as SfxName[]
const used = new Set<SfxName>()
for (const [title, re] of groups) {
  const names = all.filter((n) => re.test(n) && !used.has(n))
  if (!names.length) continue
  const h = document.createElement('h3')
  h.textContent = title
  const g = document.createElement('div')
  g.className = 'grid'
  for (const n of names) {
    used.add(n)
    g.appendChild(btn(n, () => audio.sfx(n, opts())))
  }
  $('sfx').append(h, g)
}
const rest = all.filter((n) => !used.has(n))
if (rest.length) {
  const g = document.createElement('div')
  g.className = 'grid'
  for (const n of rest) g.appendChild(btn(n, () => audio.sfx(n, opts())))
  $('sfx').append(g)
}
refreshTracks()
