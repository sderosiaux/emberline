/**
 * Unified keyboard + gamepad input. Gameplay reads continuous state (move, fire),
 * menus read edge-triggered "pressed" actions with key-repeat for navigation.
 */
export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back' | 'tabPrev' | 'tabNext'

const MOVE_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
}
const FIRE_KEYS = new Set(['Space', 'KeyZ', 'KeyJ'])
const SPECIAL_KEYS = new Set(['KeyX', 'KeyK'])
const PRECISION_KEYS = new Set(['ShiftLeft', 'ShiftRight', 'KeyL'])
const PAUSE_KEYS = new Set(['Escape', 'KeyP'])
const RIFT_KEYS = new Set(['KeyC', 'KeyV'])

class Input {
  private down = new Set<string>()
  private pressedQ = new Set<string>()
  private menuQ: MenuAction[] = []
  private padPrev: boolean[] = []
  private padRepeat = new Map<MenuAction, number>()
  /** Typed characters since last poll — used for cheat codes / secrets. */
  typed = ''
  moveX = 0
  moveY = 0
  fire = false
  precision = false
  special = false
  /** Arcade: flip into / out of the Rift (edge-triggered). */
  rift = false
  private padRift = false
  pause = false
  usingPad = false
  alwaysFire = false
  private padFire = false
  private padPrecision = false
  private padSpecial = false
  private padPause = false

  constructor() {
    if (typeof window === 'undefined') return
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault()
      if (!e.repeat) this.pressedQ.add(e.code)
      this.down.add(e.code)
      this.usingPad = false
      const m = keyToMenu(e.code)
      // held Space/Enter must not machine-gun purchases: only directions auto-repeat
      if (m && !(e.repeat && (m === 'confirm' || m === 'back'))) this.menuQ.push(m)
      if (e.key.length === 1) this.typed = (this.typed + e.key.toUpperCase()).slice(-16)
    })
    window.addEventListener('keyup', (e) => this.down.delete(e.code))
    window.addEventListener('blur', () => this.down.clear())
  }

  /** Call once per frame before gameplay/menus read state. */
  poll(dt: number) {
    let mx = 0, my = 0
    for (const [k, [x, y]] of Object.entries(MOVE_KEYS)) if (this.down.has(k)) { mx += x; my += y }
    const anyDown = (s: Set<string>) => { for (const k of s) if (this.down.has(k)) return true; return false }
    const anyPressed = (s: Set<string>) => { for (const k of s) if (this.pressedQ.has(k)) return true; return false }
    this.pollPad(dt)
    const pad = this.readPadAxes()
    if (Math.abs(pad[0]) > 0 || Math.abs(pad[1]) > 0) { mx = pad[0]; my = pad[1] }
    const len = Math.hypot(mx, my)
    if (len > 1) { mx /= len; my /= len }
    this.moveX = mx
    this.moveY = my
    this.fire = this.alwaysFire || anyDown(FIRE_KEYS) || this.padFire
    this.precision = anyDown(PRECISION_KEYS) || this.padPrecision
    this.special = anyPressed(SPECIAL_KEYS) || this.padSpecial
    this.rift = anyPressed(RIFT_KEYS) || this.padRift
    this.padRift = false
    this.pause = anyPressed(PAUSE_KEYS) || this.padPause
    this.padSpecial = false
    this.padPause = false
    this.pressedQ.clear()
  }

  isDown(code: string) { return this.down.has(code) }

  /** Drain queued menu actions (keyboard auto-repeat + gamepad repeat). */
  takeMenu(): MenuAction[] {
    const q = this.menuQ
    this.menuQ = []
    return q
  }

  clearMenu() { this.menuQ = [] }

  private readPadAxes(): [number, number] {
    const gp = firstPad()
    if (!gp) return [0, 0]
    let x = gp.axes[0] ?? 0, y = gp.axes[1] ?? 0
    const dz = 0.18
    const mag = Math.hypot(x, y)
    if (mag < dz) { x = 0; y = 0 } else {
      const s = Math.min(1, (mag - dz) / (1 - dz)) / mag
      x *= s; y *= s
    }
    if (gp.buttons[12]?.pressed) y = -1
    if (gp.buttons[13]?.pressed) y = 1
    if (gp.buttons[14]?.pressed) x = -1
    if (gp.buttons[15]?.pressed) x = 1
    return [x, y]
  }

  private pollPad(dt: number) {
    const gp = firstPad()
    if (!gp) { this.padFire = false; this.padPrecision = false; return }
    const b = gp.buttons.map((x) => x.pressed)
    const edge = (i: number) => b[i] && !this.padPrev[i]
    if (b.some(Boolean) || Math.hypot(gp.axes[0] ?? 0, gp.axes[1] ?? 0) > 0.5) this.usingPad = true
    this.padFire = !!(b[0] || b[7] || b[5])
    this.padPrecision = !!(b[4] || b[6])
    if (edge(2)) this.padSpecial = true
    if (edge(3)) this.padRift = true
    if (edge(9)) { this.padPause = true; this.menuQ.push('back') }
    if (edge(0)) this.menuQ.push('confirm')
    if (edge(1)) this.menuQ.push('back')
    if (edge(4)) this.menuQ.push('tabPrev')
    if (edge(5)) this.menuQ.push('tabNext')
    const [ax, ay] = [gp.axes[0] ?? 0, gp.axes[1] ?? 0]
    const dirs: [MenuAction, boolean][] = [
      ['up', !!b[12] || ay < -0.6], ['down', !!b[13] || ay > 0.6],
      ['left', !!b[14] || ax < -0.6], ['right', !!b[15] || ax > 0.6],
    ]
    for (const [a, held] of dirs) {
      if (!held) { this.padRepeat.delete(a); continue }
      const t = this.padRepeat.get(a)
      if (t === undefined) { this.menuQ.push(a); this.padRepeat.set(a, 0.38) }
      else if (t - dt <= 0) { this.menuQ.push(a); this.padRepeat.set(a, 0.09) }
      else this.padRepeat.set(a, t - dt)
    }
    this.padPrev = b
  }
}

function firstPad(): Gamepad | null {
  if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
  for (const g of navigator.getGamepads()) if (g && g.connected) return g
  return null
}

function keyToMenu(code: string): MenuAction | null {
  switch (code) {
    case 'ArrowUp': case 'KeyW': return 'up'
    case 'ArrowDown': case 'KeyS': return 'down'
    case 'ArrowLeft': case 'KeyA': return 'left'
    case 'ArrowRight': case 'KeyD': return 'right'
    case 'Enter': case 'Space': case 'KeyZ': return 'confirm'
    case 'Escape': case 'Backspace': case 'KeyX': return 'back'
    case 'KeyQ': return 'tabPrev'
    case 'KeyE': case 'Tab': return 'tabNext'
    default: return null
  }
}

export const input = new Input()
