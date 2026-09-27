import { input, type MenuAction } from '../core/input'
import { audio } from '../audio/audio'

/**
 * Spatial keyboard/gamepad navigation over elements marked `.nav` inside a
 * root. Arrow keys move focus to the nearest element in that direction;
 * confirm clicks; back calls the screen's handler.
 */
export class Nav {
  focused: HTMLElement | null = null
  onBack: (() => void) | null = null
  onTab: ((dir: -1 | 1) => void) | null = null
  /** Custom per-action hook; return true to consume. */
  onAction: ((a: MenuAction) => boolean) | null = null

  constructor(public root: HTMLElement) {
    root.addEventListener('mousemove', (e) => {
      const t = (e.target as HTMLElement).closest('.nav') as HTMLElement | null
      if (t && t !== this.focused && root.contains(t)) this.focus(t, false)
    })
  }

  items(): HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>('.nav')].filter((e) => !e.hasAttribute('disabled-nav') && e.offsetParent !== null)
  }

  focus(el: HTMLElement | null, sound = true) {
    if (this.focused === el) return
    this.focused?.classList.remove('focus')
    this.focused = el
    if (el) {
      el.classList.add('focus')
      el.scrollIntoView({ block: 'nearest' })
      el.dispatchEvent(new CustomEvent('navfocus'))
      if (sound) audio.sfx('ui_move', { vol: 0.5 })
    }
  }

  first() {
    const it = this.items()
    const pref = it.find((e) => e.hasAttribute('data-default')) ?? it[0] ?? null
    this.focus(pref, false)
  }

  update() {
    for (const a of input.takeMenu()) {
      if (this.onAction?.(a)) continue
      if (!this.focused || !this.root.contains(this.focused)) this.first()
      switch (a) {
        case 'up': case 'down': case 'left': case 'right': this.move(a); break
        case 'confirm':
          if (this.focused) { this.focused.click() }
          break
        case 'back':
          if (this.onBack) { audio.sfx('ui_back'); this.onBack() }
          break
        case 'tabPrev': this.onTab?.(-1); break
        case 'tabNext': this.onTab?.(1); break
      }
    }
  }

  private move(dir: 'up' | 'down' | 'left' | 'right') {
    const items = this.items()
    if (!items.length) return
    const cur = this.focused
    if (!cur) { this.focus(items[0]); return }
    const r = cur.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    let best: HTMLElement | null = null, bd = Infinity
    for (const el of items) {
      if (el === cur) continue
      const q = el.getBoundingClientRect()
      const x = q.left + q.width / 2, y = q.top + q.height / 2
      const dx = x - cx, dy = y - cy
      let primary: number, secondary: number
      if (dir === 'up') { if (dy >= -2) continue; primary = -dy; secondary = Math.abs(dx) }
      else if (dir === 'down') { if (dy <= 2) continue; primary = dy; secondary = Math.abs(dx) }
      else if (dir === 'left') { if (dx >= -2) continue; primary = -dx; secondary = Math.abs(dy) }
      else { if (dx <= 2) continue; primary = dx; secondary = Math.abs(dy) }
      const d = primary + secondary * 2.5
      if (d < bd) { bd = d; best = el }
    }
    if (best) this.focus(best)
  }
}
