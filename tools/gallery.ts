/** Dev-only contact sheet: every sprite at 2× over sand / ocean / snow / space. */
import { registerArt } from '../src/render/art'
import { getSprite, hasSprite } from '../src/render/sprites'

const params = new URLSearchParams(location.search)
const ZOOM = Number(params.get('zoom') ?? 2)
const ONLY = params.get('only')?.split(',')
const BGS = ['#d9b78a', '#1f7f8f', '#e9f0f5', '#141425']
/** The spec'd key list, so a missing sprite shows up as a red cell. */
const GROUPS: [string, string[]][] = [
  ['Player & pods', ['player', 'player_bank', 'pod_wasp', 'pod_viper', 'pod_aegis', 'pod_spark', 'pod_lantern', 'pod_mirror']],
  ['Shots', ['shot_pulse', 'shot_pulse_heavy', 'shot_lance', 'shot_pellet', 'shot_slug', 'shot_missile', 'shot_viper', 'shot_bloom', 'shot_shard', 'shot_helix', 'shot_mine', 'shot_drone', 'shot_lantern', 'shot_chorus', 'shot_flame']],
  ['Pickups', ['pk_credit', 'pk_credit_big', 'pk_repair', 'pk_special', 'pk_core', 'pk_shield']],
  ['Air', ['dart', 'wasp', 'lancer', 'weaver', 'seeker', 'mine', 'sniper', 'mender', 'phantom', 'escapee', 'splitter', 'warden', 'missileer', 'bomber', 'cantor', 'gunship', 'turret_small', 'barrel_small', 'rock_s', 'rock_m', 'ore_rock', 'rock_l', 'carrier']],
  ['Ground', ['turret_base', 'turret_barrel', 'flak_base', 'flak_barrel', 'tank_body', 'tank_turret', 'artillery', 'artillery_barrel', 'silo', 'generator', 'fuel', 'radar', 'radar_dish', 'bunker', 'cache', 'repair_cache', 'pylon', 'node', 'hangar', 'train_engine', 'train_cargo', 'train_fuel', 'train_flat', 'gunboat', 'trawler', 'sub', 'destroyer']],
  ['Composites', ['@turret_base+turret_barrel', '@flak_base+flak_barrel', '@tank_body+tank_turret', '@artillery+artillery_barrel', '@radar+radar_dish', '@turret_small+barrel_small', '@train_flat+turret_barrel']],
]

registerArt()

const root = document.getElementById('root')!
for (const [title, all] of GROUPS) {
  const ks = ONLY ? all.filter(k => ONLY.includes(k)) : all
  if (!ks.length) continue
  const h = document.createElement('h2'); h.textContent = `${title} (${ks.length})`; root.appendChild(h)
  const grid = document.createElement('div'); grid.className = 'grid'; root.appendChild(grid)
  for (const k of ks) grid.appendChild(cell(k))
}

function cell(key: string) {
  const d = document.createElement('div'); d.className = 'cell'
  const label = document.createElement('div'); label.className = 'k'
  d.appendChild(label)
  const layers = key.startsWith('@') ? key.slice(1).split('+') : [key]
  const missing = layers.filter(k => !hasSprite(k))
  if (missing.length) {
    label.innerHTML = `<b style="color:#ff5a5a">MISSING ${missing.join(', ')}</b>`
    return d
  }
  const sps = layers.map(getSprite)
  const sp = sps[0]
  label.innerHTML = `${key} <span>${sp.w}×${sp.h}</span>`
  const pad = 6
  const w = sp.w * ZOOM, h = sp.h * ZOOM
  const cv = document.createElement('canvas')
  cv.width = (w + pad * 2) * BGS.length
  cv.height = h + pad * 2
  const x = cv.getContext('2d')!
  BGS.forEach((bg, i) => {
    const ox = i * (w + pad * 2)
    x.fillStyle = bg
    x.fillRect(ox, 0, w + pad * 2, h + pad * 2)
    if (sp.shadow !== sp.img) {
      const sw = sp.w * ZOOM * 0.9 + 16 * ZOOM, sh = sp.h * ZOOM * 0.9 + 16 * ZOOM
      x.drawImage(sp.shadow, ox + pad + w / 2 - sw / 2 + 8, pad + h / 2 - sh / 2 + 12, sw, sh)
    }
    for (const [j, s] of sps.entries()) {
      // Composite preview: second layer rotated a bit to show the pivot works.
      const rot = j === 0 ? 0 : 0.5
      x.save()
      x.translate(ox + pad + w / 2, pad + h / 2)
      x.rotate(rot)
      x.drawImage(s.img, -s.w * ZOOM / 2, -s.h * ZOOM / 2, s.w * ZOOM, s.h * ZOOM)
      x.restore()
    }
  })
  d.appendChild(cv)
  return d
}
