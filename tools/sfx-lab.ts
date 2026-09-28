// Audition every sound effect: each recorded variant, the random pick the game makes, and the synth fallback,
// all through the game's own mixer and voice routing (so levels and reverb match the game).

import { createMixer, type Mixer } from '../src/audio/core'
import { startLoop, type LoopVoice } from '../src/audio/loops'
import { SampleBank } from '../src/audio/samples'
import { SFX, spawnSample, spawnSfx } from '../src/audio/sfx'
import type { LoopName, SfxName } from '../src/audio/types'

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text) e.textContent = text
  return e
}

let ctx: AudioContext | null = null
let mx: Mixer | null = null
let bank: SampleBank | null = null
document.addEventListener('pointerdown', () => {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' })
    mx = createMixer(ctx, ctx.destination)
    bank = new SampleBank(ctx)
    $('status').textContent = 'loading samples…'
    void bank.ready.then(() => ($('status').textContent = 'ready'))
  }
  void ctx.resume()
})

const opt = (id: string): number => Number($<HTMLInputElement>(id).value)
for (const id of ['o-vol', 'o-pitch', 'o-pan']) {
  $<HTMLInputElement>(id).addEventListener('input', () => ($(`${id}-v`).textContent = $<HTMLInputElement>(id).value))
}

function play(name: SfxName, which: number | 'random' | 'synth'): void {
  if (!ctx || !mx || !bank) return
  const t = ctx.currentTime + 0.01
  const vol = opt('o-vol')
  const pitch = opt('o-pitch')
  const pan = opt('o-pan')
  const sample = which === 'synth' ? null : which === 'random' ? bank.pick(name, Math.random) : bank.variants(name)[which]
  if (which !== 'synth' && !sample) return
  const v = sample ? spawnSample(mx, name, sample, t, vol, pitch, pan) : spawnSfx(mx, name, t, vol, pitch, pan, Math.random)
  setTimeout(() => v.tail.disconnect(), (v.dur + 3) * 1000)
}

const groups: [string, RegExp][] = [
  ['Player weapons', /^shot_/], ['Enemy', /^enemy_/], ['Hits & explosions', /^(hit|expl|chain)/],
  ['Shield & hull', /^(shield|hull|low_hull|player_death)/], ['Pickups', /^pickup_/], ['Specials', /^(special|energy)/],
  ['Boss & events', /^(boss|secret|radio|mission|game_over)/], ['UI', /^ui_/],
]

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', cls, label)
  b.addEventListener('click', onClick)
  return b
}

async function build(): Promise<void> {
  const man = await fetch(`${import.meta.env.BASE_URL}sfx/manifest.json`).then((r) => r.json()) as {
    sfx: Record<string, { files: string[]; gain: number }>
    loops: Record<string, { file: string; gain: number; loopStart: number; loopEnd: number }>
  }
  const all = Object.keys(SFX) as SfxName[]
  const used = new Set<SfxName>()
  const addGroup = (title: string, names: SfxName[]): void => {
    if (!names.length) return
    const sec = el('section')
    sec.append(el('h2', '', title))
    for (const n of names) {
      used.add(n)
      const e = man.sfx[n]
      const row = el('div', 'snd')
      const label = el('div', 'name', n)
      label.append(el('small', '', e ? `${e.files.length} variant${e.files.length > 1 ? 's' : ''} · gain ${e.gain.toFixed(2)}` : 'no sample: synth only'))
      const btns = el('div', 'btns')
      btns.append(button('▶', 'play', () => play(n, 'random')))
      for (let i = 0; i < (e?.files.length ?? 0); i++) if (e.files.length > 1) btns.append(button(`v${i + 1}`, '', () => play(n, i)))
      btns.append(button('synth', 'synth', () => play(n, 'synth')))
      row.append(label, btns)
      sec.append(row)
    }
    $('groups').append(sec)
  }
  for (const [title, re] of groups) addGroup(title, all.filter((n) => re.test(n) && !used.has(n)))
  addGroup('Other', all.filter((n) => !used.has(n)))

  // loops: sample vs synth, with a live pitch control (the beam's pitch follows its power level in game)
  const sec = el('section')
  sec.append(el('h2', '', 'Loops'))
  const live = new Map<string, LoopVoice>()
  for (const name of Object.keys(man.loops) as LoopName[]) {
    const row = el('div', 'snd')
    row.append(el('div', 'name', name))
    const btns = el('div', 'btns')
    for (const kind of ['sample', 'synth'] as const) {
      const key = `${name}:${kind}`
      const b = button(kind === 'sample' ? '▶ loop' : 'synth', kind === 'sample' ? 'play' : 'synth', () => {
        const v = live.get(key)
        if (v) {
          v.stop()
          live.delete(key)
        } else if (ctx && mx && bank) {
          live.set(key, startLoop(ctx, mx.sfxIn, name, opt('o-vol'), opt('o-pitch'), kind === 'sample' ? bank.loop(name) : null))
        }
        b.classList.toggle('on', live.has(key))
      })
      btns.append(b)
    }
    row.append(btns)
    sec.append(row)
  }
  $<HTMLInputElement>('o-pitch').addEventListener('input', () => {
    for (const v of live.values()) v.set(undefined, opt('o-pitch'))
  })
  // stress: what the game does in a firefight, with the sample bank
  const stress = el('div', 'btns')
  const every = (ms: number, times: number, fn: (i: number) => void): void => {
    let i = 0
    const id = setInterval(() => { fn(i++); if (i >= times) clearInterval(id) }, ms)
  }
  stress.append(
    button('fire 15/s', '', () => every(66, 45, () => play('shot_pulse', 'random'))),
    button('credit streak', '', () => every(90, 12, (i) => {
      if (!ctx || !mx || !bank) return
      const s = bank.pick('pickup_credit', Math.random)
      if (!s) return
      const v = spawnSample(mx, 'pickup_credit', s, ctx.currentTime + 0.01, opt('o-vol'), 1 + i * 0.12, 0)
      setTimeout(() => v.tail.disconnect(), (v.dur + 3) * 1000)
    })),
  )
  sec.append(el('h2', '', 'Stress'), stress)
  $('groups').prepend(sec)
}

void build()
