import type { EnemyDef } from '../game/enemy-def'
import type { Enemy } from '../game/entities'
import { BulletKind, PickupKind } from '../game/entities'
import type { World } from '../game/world'
import { aimed, canFire, fan, ring, shell, missile, spiral, onScreen, enemySfx } from '../game/patterns'
import { SeekMover, LineMover, PathMover } from '../game/movers'
import { chainExplosion, explode, sfxAt } from '../game/fx'
import { rand, TAU, angleDiff, clamp, chance } from '../core/math'
import { PW, PH } from '../game/consts'
import { P, C } from '../render/particles'

const defs: EnemyDef[] = []
const def = (d: EnemyDef) => { defs.push(d); return d }

/** Fire timer: counts down per enemy+key, returns true when it fires (then re-arms with jitter). */
function every(e: Enemy, w: World, key: string, period: number, jitter = 0.25): boolean {
  if (e.s[key] === undefined) e.s[key] = period * rand(0.35, 0.9)
  e.s[key] -= w.frameDt * w.diff.fireRate
  if (e.s[key] > 0) return false
  e.s[key] = period * rand(1 - jitter, 1 + jitter)
  return true
}

const aimAt = (e: Enemy, w: World) => Math.atan2(w.player.y - e.y, w.player.x - e.x)

// ═══════════════════════════ AIR ═══════════════════════════

def({
  id: 'dart', hp: 10, r: 11, sprite: 'dart', layer: 'air', score: 50, credits: 8, charge: 2, explode: 'small', contact: 15,
  init(e) { e.s.shooter = chance(0.35) ? 1 : 0 },
  update(e, w) {
    if ((e.s.shooter || e.elite) && canFire(w, e) && every(e, w, 'f', e.elite ? 1.2 : 2.2)) aimed(w, e.x, e.y + 8, 190, e.elite ? 3 : 1, 0.2)
  },
})

def({
  id: 'wasp', hp: 32, r: 14, sprite: 'wasp', layer: 'air', score: 100, credits: 18, charge: 3, explode: 'small',
  update(e, w) {
    if (!canFire(w, e)) return
    if (every(e, w, 'f', 2.1)) {
      e.s.burst = e.elite ? 4 : 2
      e.s.bt = 0
    }
    if (e.s.burst > 0) {
      e.s.bt -= w.frameDt
      if (e.s.bt <= 0) { e.s.burst--; e.s.bt = 0.12; aimed(w, e.x, e.y + 10, 210) }
    }
  },
})

/** Interceptor: arrives, telegraphs, then dashes through your position. */
def({
  id: 'lancer', hp: 26, r: 13, sprite: 'lancer', layer: 'air', score: 120, credits: 20, charge: 3, explode: 'small', contact: 25,
  init(e) { e.s.stopY = rand(90, 200); e.s.state = 0 },
  update(e, w, dt) {
    if (e.mover) return
    if (e.s.state === 0) {
      e.y += (e.s.stopY - e.y) * Math.min(1, dt * 3)
      e.rot = angleDiff(0, aimAt(e, w) - Math.PI / 2) * 0.8
      if (Math.abs(e.y - e.s.stopY) < 4) { e.s.state = 1; e.s.t = 0.55 }
    } else if (e.s.state === 1) {
      e.s.t -= dt
      e.rot = aimAt(e, w) - Math.PI / 2
      e.x += Math.sin(w.time * 60) * 0.6
      if (e.s.t <= 0) {
        e.s.state = 2
        const a = aimAt(e, w)
        const sp = 520
        e.mover = new LineMover(Math.cos(a) * sp, Math.sin(a) * sp, true)
        sfxAt('shot_missile', e.x, 0.25, 1.6)
        if (e.elite) fan(w, e.x, e.y, a, 3, 0.5, 200)
      }
    }
  },
  draw(ctx, e) {
    if (e.s.state === 1) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.5 + 0.5 * Math.sin(e.age * 40)
      ctx.fillStyle = '#ff2e88'
      ctx.beginPath(); ctx.arc(e.x, e.y, 6, 0, TAU); ctx.fill()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  },
})

def({
  id: 'weaver', hp: 40, r: 14, sprite: 'weaver', layer: 'air', score: 110, credits: 22, charge: 3, explode: 'small',
  update(e, w) {
    if (canFire(w, e) && every(e, w, 'f', 2.3)) fan(w, e.x, e.y + 10, Math.PI / 2, e.elite ? 5 : 3, 0.7, 170)
  },
})

def({
  id: 'bomber', hp: 150, r: 26, sprite: 'bomber', layer: 'air', score: 400, credits: 60, charge: 8, explode: 'medium', contact: 30,
  update(e, w) {
    if (!canFire(w, e)) return
    if (every(e, w, 'f', 2.4)) {
      for (const dx of [-14, 14]) {
        const b = w.fire(e.x + dx, e.y + 10, Math.PI / 2 + dx * 0.004, 110, BulletKind.Bomb, 14)
        if (!b) continue
        b.ttl = rand(1.1, 1.5)
        b.popOnExpire = true
        b.onPop = (ww, bb) => ring(ww, bb.x, bb.y, e.elite ? 12 : 8, 140, Math.random())
      }
      enemySfx(w, e.x, true)
    }
  },
})

def({
  id: 'missileer', hp: 95, r: 20, sprite: 'missileer', layer: 'air', score: 300, credits: 45, charge: 6, explode: 'medium',
  update(e, w) {
    if (canFire(w, e) && every(e, w, 'f', 3.2)) {
      missile(w, e.x - 12, e.y, Math.PI / 2 + 0.6, 150, 1.5)
      missile(w, e.x + 12, e.y, Math.PI / 2 - 0.6, 150, 1.5)
      if (e.elite) missile(w, e.x, e.y + 10, Math.PI / 2, 170, 1.8)
    }
  },
})

/** Sniper: paints you with a sight line, then fires a fast needle burst down it. */
def({
  id: 'sniper', hp: 60, r: 15, sprite: 'sniper', layer: 'air', score: 250, credits: 40, charge: 5, explode: 'small',
  update(e, w, dt) {
    if (!canFire(w, e)) { e.s.aimT = 0; return }
    if (!e.s.aimT && every(e, w, 'f', 2.8)) e.s.aimT = 1.1
    if (e.s.aimT > 0) {
      e.s.aimT -= dt
      if (e.s.aimT > 0.25) e.s.ang = w.aim(e.x, e.y, 520)
      e.rot = e.s.ang - Math.PI / 2
      if (e.s.aimT <= 0) {
        e.s.aimT = 0
        for (let i = 0; i < (e.elite ? 5 : 3); i++) w.after(i * 0.07, () => { if (!e.dead) w.fire(e.x, e.y, e.s.ang, 520, BulletKind.Needle, 12) })
        enemySfx(w, e.x, true)
      }
    }
  },
  draw(ctx, e) {
    if (!(e.s.aimT > 0)) return
    const a = e.s.ang, locked = e.s.aimT < 0.25
    ctx.strokeStyle = locked ? 'rgba(255,60,140,0.9)' : 'rgba(255,60,140,0.35)'
    ctx.lineWidth = locked ? 2 : 1
    ctx.setLineDash(locked ? [] : [6, 6])
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(e.x + Math.cos(a) * 900, e.y + Math.sin(a) * 900); ctx.stroke()
    ctx.setLineDash([])
  },
})

def({
  id: 'gunship', hp: 520, r: 34, sprite: 'gunship', layer: 'air', score: 1200, credits: 180, charge: 15, explode: 'large', contact: 40,
  update(e, w, dt) {
    if (!canFire(w, e)) return
    e.s.cyc = (e.s.cyc ?? 0) + dt
    const c = e.s.cyc % 6
    if (c < 2.2) spiral(w, e, dt, 12, e.elite ? 4 : 3, 2.2, 150)
    else if (c > 3 && c < 3.05 + dt) { aimed(w, e.x - 20, e.y + 20, 200, 5, 0.16); aimed(w, e.x + 20, e.y + 20, 200, 5, 0.16) }
    else if (c > 4.4 && c < 4.45 + dt) ring(w, e.x, e.y, 16, 130, Math.random())
  },
  onDeath(e, w) { chainExplosion(w, e.x, e.y, 30, 5, 0.4, 'large') },
})

/** Carrier: lumbering mothership, launches fighters from its bay, has two gun turrets. */
def({
  id: 'carrier', hp: 1800, r: 58, sprite: 'carrier', layer: 'air', score: 4000, credits: 500, charge: 25, explode: 'large', contact: 50,
  init(e, w) {
    e.noCull = true
    for (const ox of [-40, 40]) w.spawn('carrier_turret', e.x + ox, e.y + 28, { parent: e, ox, oy: 28 })
  },
  update(e, w) {
    if (onScreen(e, 20) && every(e, w, 'launch', e.elite ? 0.8 : 1.3, 0.1)) {
      const d = w.spawn('dart', e.x, e.y + 40, { mover: new SeekMover(230, 2.2, 2.2) })
      d.vy = 200; d.vx = rand(-60, 60)
      d.s.shooter = 1
    }
    if (e.y > PH + 200) e.gone = true
  },
  onDeath(e, w) { chainExplosion(w, e.x, e.y, 60, 12, 1.1, 'large') },
})

def({
  id: 'carrier_turret', hp: 160, r: 12, sprite: 'turret_small', layer: 'air', score: 200, credits: 30, charge: 4, explode: 'small', contact: 0, noShadow: true,
  update(e, w) {
    e.s.aim = aimAt(e, w)
    if (canFire(w, e) && every(e, w, 'f', 1.6)) aimed(w, e.x, e.y, 200, 2, 0.12)
  },
  drawBody(ctx, e) { drawTurret(ctx, e, 'turret_small', 'barrel_small') },
})

/** Shield unit: projects a bubble that makes nearby allies immune. Kill it first. */
def({
  id: 'warden', hp: 180, r: 18, sprite: 'warden', layer: 'air', score: 500, credits: 70, charge: 7, explode: 'medium',
  update(e, w) {
    for (const o of w.enemies) {
      if (o === e || o.dead || o.def.id === 'warden' || o.bossPart) continue
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 120 * 120) o.shieldedBy = e
    }
    if (e.elite && canFire(w, e) && every(e, w, 'f', 2.5)) ring(w, e.x, e.y, 10, 120)
  },
  draw(ctx, e) {
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = `rgba(90,220,255,${0.25 + 0.1 * Math.sin(e.age * 5)})`
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.arc(e.x, e.y, 120, 0, TAU); ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
  },
})

def({
  id: 'mender', hp: 85, r: 14, sprite: 'mender', layer: 'air', score: 350, credits: 50, charge: 6, explode: 'small',
  update(e, w) {
    e.s.healT = (e.s.healT ?? 0) - w.frameDt
    if (e.s.healT > 0) return
    e.s.healT = 0.25
    let n = 0
    for (const o of w.enemies) {
      if (o === e || o.dead || o.hp >= o.maxHp || n >= 3) continue
      if ((o.x - e.x) ** 2 + (o.y - e.y) ** 2 < 150 * 150) {
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * 0.05)
        w.line([e.x, e.y, o.x, o.y], '#e8ffe0', '#5dff7a', 1.5, 0.2)
        n++
      }
    }
  },
})

def({
  id: 'mine', hp: 24, r: 12, sprite: 'mine', layer: 'air', score: 60, credits: 5, charge: 2, explode: 'small', contact: 25,
  update(e, w) {
    e.rot += w.frameDt * 1.5
    if (w.player.alive && (e.x - w.player.x) ** 2 + (e.y - w.player.y) ** 2 < 75 * 75 && !e.s.armed) {
      e.s.armed = 1; e.s.t = 0.45
    }
    if (e.s.armed) { e.s.t -= w.frameDt; e.flash = Math.sin(e.age * 50) > 0 ? 0.8 : 0; if (e.s.t <= 0) w.kill(e, false) }
  },
  onDeath(e, w) { if (onScreen(e)) ring(w, e.x, e.y, e.elite ? 14 : 10, 160, Math.random()) },
})

def({
  id: 'seeker', hp: 14, r: 10, sprite: 'seeker', layer: 'air', score: 60, credits: 10, charge: 2, explode: 'small', contact: 22,
  init(e) { if (!e.mover) e.mover = new SeekMover(240, 2.6, 3.5) },
})

/** Stealth: nearly invisible, auto-targeting ignores it until it decloaks to fire. */
def({
  id: 'phantom', hp: 60, r: 16, sprite: 'phantom', layer: 'air', score: 400, credits: 50, charge: 5, explode: 'small',
  init(e) { e.visibleAlpha = 0.1; e.s.cloak = 1 },
  update(e, w, dt) {
    if (canFire(w, e) && every(e, w, 'f', 2.6)) e.s.reveal = 0.9
    if (e.s.reveal > 0) {
      e.s.reveal -= dt
      e.visibleAlpha = Math.min(1, e.visibleAlpha + dt * 4)
      if (e.s.reveal < 0.3 && !e.s.shot) { e.s.shot = 1; aimed(w, e.x, e.y, 200, e.elite ? 5 : 3, 0.25) }
    } else {
      e.s.shot = 0
      e.visibleAlpha = Math.max(e.hitThisFrame ? 0.6 : 0.08, e.visibleAlpha - dt * 1.5)
    }
    e.s.cloak = e.visibleAlpha < 0.5 ? 1 : 0
  },
})

def({
  id: 'splitter', hp: 80, r: 18, sprite: 'splitter', layer: 'air', score: 250, credits: 30, charge: 5, explode: 'medium',
  update(e, w) { if (canFire(w, e) && every(e, w, 'f', 2.6)) aimed(w, e.x, e.y, 180) },
  onDeath(e, w) {
    for (let i = 0; i < 3; i++) {
      const d = w.spawn('dart', e.x, e.y, { mover: new SeekMover(200, 1.8, 1.4) })
      const a = Math.PI / 2 + (i - 1) * 0.9
      d.vx = Math.cos(a) * 200; d.vy = Math.sin(a) * 200
    }
  },
})

/** Fleeing courier: runs for the edge. Kill it before it escapes for something special. */
def({
  id: 'escapee', hp: 260, r: 14, sprite: 'escapee', layer: 'air', score: 2000, credits: 100, charge: 10, explode: 'medium', contact: 0,
  init(e) { e.noCull = true },
  update(e, w, dt) {
    e.s.t = (e.s.t ?? 0) + dt
    const dx = e.x - w.player.x
    e.vx = clamp(e.vx + Math.sign(dx || 1) * 300 * dt, -220, 220)
    e.vy = -40 - e.s.t * 30
    e.x = clamp(e.x + e.vx * dt, 10, PW - 10)
    e.y += e.vy * dt
    e.rot = Math.PI
    if (Math.random() < 0.5) w.parts.spawn(P.Glow, e.x, e.y + 12, 0, 80, 0.2, 6, 1, C.violet)
    if (e.y < -40) {
      e.gone = true
      if (!w.preview) w.emit({ type: 'radio', who: 'HALLORAN', text: 'It got away. Whatever it was carrying, the Choir has it back.' })
    }
  },
})

// Asteroids: drift, rotate, split.
for (const [id, hp, r, cr, next] of [['rock_l', 140, 30, 4, 'rock_m'], ['rock_m', 55, 18, 2, 'rock_s'], ['rock_s', 18, 10, 1, '']] as const) {
  def({
    id, hp, r, sprite: id, layer: 'air', score: 30, credits: cr, charge: 1, explode: 'tiny', contact: id === 'rock_l' ? 35 : 20, noShadow: true,
    init(e) { e.s.spin = rand(-1.2, 1.2); e.rot = rand(0, TAU) },
    update(e, w) { e.rot += e.s.spin * w.frameDt },
    onDeath(e, w) {
      for (let i = 0; i < 10; i++) w.parts.spawn(P.Debris, e.x, e.y, rand(-200, 200), rand(-200, 200), rand(0.5, 1), rand(3, 7), 1, C.smokeLight, 2)
      if (!next) return
      for (let i = 0; i < 2; i++) {
        const a = rand(0, TAU)
        w.spawn(next, e.x + Math.cos(a) * 8, e.y + Math.sin(a) * 8, { mover: new LineMover(e.vx * 0.6 + Math.cos(a) * 60, Math.max(40, e.vy * 0.8 + Math.sin(a) * 60)) })
      }
    },
  })
}

def({
  id: 'ore_rock', hp: 90, r: 20, sprite: 'ore_rock', layer: 'air', score: 200, credits: 70, charge: 4, explode: 'small', contact: 25, noShadow: true,
  init(e) { e.s.spin = rand(-1, 1) },
  update(e, w) { e.rot += e.s.spin * w.frameDt },
})

// ═══════════════════════════ GROUND ═══════════════════════════

function drawTurret(ctx: CanvasRenderingContext2D, e: Enemy, base: string, barrel: string) {
  drawRef.sprite(ctx, base, e.x, e.y, 0, e.scale, 1, e.flash)
  drawRef.sprite(ctx, barrel, e.x, e.y, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, e.scale, 1, e.flash)
}

/** Injected by the renderer to avoid a data → render import cycle. */
export const drawRef = {
  sprite: (_ctx: CanvasRenderingContext2D, _key: string, _x: number, _y: number, _rot: number, _scale: number, _alpha: number, _flash: number) => {},
}

const turnToward = (e: Enemy, w: World, rate: number) => {
  const want = aimAt(e, w)
  const cur = e.s.aim ?? Math.PI / 2
  e.s.aim = cur + clamp(angleDiff(cur, want), -rate * w.frameDt, rate * w.frameDt)
  return Math.abs(angleDiff(e.s.aim, want)) < 0.15
}

def({
  id: 'turret', hp: 70, r: 15, sprite: 'turret_base', layer: 'ground', score: 150, credits: 25, charge: 3, explode: 'small', target: true,
  update(e, w) {
    const ready = turnToward(e, w, 2.5)
    if (ready && canFire(w, e) && every(e, w, 'f', 1.8)) {
      const bx = e.x + Math.cos(e.s.aim) * 14, by = e.y + Math.sin(e.s.aim) * 14
      if (e.elite) fan(w, bx, by, e.s.aim, 3, 0.3, 190)
      else w.fire(bx, by, e.s.aim, 190), enemySfx(w, e.x)
    }
  },
  drawBody(ctx, e) { drawTurret(ctx, e, 'turret_base', 'turret_barrel') },
})

def({
  id: 'flak', hp: 150, r: 19, sprite: 'flak_base', layer: 'ground', score: 300, credits: 45, charge: 5, explode: 'medium', target: true,
  update(e, w) {
    e.s.aim = (e.s.aim ?? 0) + w.frameDt * 0.9
    if (canFire(w, e) && every(e, w, 'f', 1.5)) {
      for (let k = 0; k < 4; k++) fan(w, e.x, e.y, e.s.aim + (k * TAU) / 4, 2, 0.14, 150)
    }
  },
  drawBody(ctx, e) { drawTurret(ctx, e, 'flak_base', 'flak_barrel') },
})

def({
  id: 'tank', hp: 95, r: 16, sprite: 'tank_body', layer: 'ground', score: 200, credits: 35, charge: 4, explode: 'small', target: true,
  update(e, w) {
    if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x - Math.sin(e.rot) * 14, e.y + Math.cos(e.rot) * 14, 0, 0, 0.6, 3, 7, C.smokeLight, 0, true)
    const ready = turnToward(e, w, 2)
    if (ready && canFire(w, e) && every(e, w, 'f', 2.2)) aimed(w, e.x, e.y, 180, e.elite ? 3 : 1, 0.18, BulletKind.Orb, 12)
  },
  drawBody(ctx, e) {
    drawRef.sprite(ctx, 'tank_body', e.x, e.y, e.rot, 1, 1, e.flash)
    drawRef.sprite(ctx, 'tank_turret', e.x, e.y, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, 1, 1, e.flash)
  },
})

def({
  id: 'artillery', hp: 170, r: 20, sprite: 'artillery', layer: 'ground', score: 350, credits: 55, charge: 6, explode: 'medium', target: true,
  update(e, w) {
    turnToward(e, w, 1)
    if (canFire(w, e) && every(e, w, 'f', 3.2)) shell(w, e.x, e.y, w.player.x + rand(-20, 20), w.player.y - rand(20, 90), 170, e.elite ? 12 : 8)
  },
  drawBody(ctx, e) { drawTurret(ctx, e, 'artillery', 'artillery_barrel') },
})

def({
  id: 'silo', hp: 230, r: 22, sprite: 'silo', layer: 'ground', score: 500, credits: 80, charge: 8, explode: 'medium', target: true,
  update(e, w) {
    e.s.open = Math.max(0, (e.s.open ?? 0) - w.frameDt)
    if (canFire(w, e) && every(e, w, 'f', 3.6)) {
      e.s.open = 0.6
      missile(w, e.x, e.y, -Math.PI / 2, 120, 2.2, 8)
    }
  },
  draw(ctx, e) {
    if (e.s.open > 0) {
      ctx.globalCompositeOperation = 'lighter'
      ctx.fillStyle = `rgba(255,120,40,${e.s.open})`
      ctx.beginPath(); ctx.arc(e.x, e.y, 9, 0, TAU); ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
    }
  },
})

/** Shield generator: protects every structure linked to it. */
def({
  id: 'generator', hp: 260, r: 24, sprite: 'generator', layer: 'ground', score: 800, credits: 90, charge: 8, explode: 'large', target: true,
  onDeath(e, w) {
    sfxAt('shield_gen_down', e.x, 0.9)
    for (const o of w.enemies) if (o.shieldedBy === e) { o.s.permShield = 0; o.shieldedBy = null; w.parts.spawn(P.Ring, o.x, o.y, 0, 0, 0.4, o.r, o.r * 2.5, C.cyan) }
    w.flags.add(`gen:${e.tag}`)
  },
  draw(ctx, e, w) {
    ctx.globalCompositeOperation = 'lighter'
    for (const o of w.enemies) {
      if (o.shieldedBy !== e || o.dead) continue
      ctx.strokeStyle = `rgba(90,220,255,${0.18 + 0.08 * Math.sin(w.time * 6 + o.id)})`
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(o.x, o.y); ctx.stroke()
    }
    ctx.globalCompositeOperation = 'source-over'
  },
})

def({
  id: 'fuel', hp: 40, r: 16, sprite: 'fuel', layer: 'ground', score: 100, credits: 15, charge: 2, explode: 'medium', target: true,
  onDeath(e, w) {
    w.after(0.08, () => {
      explode(w, e.x, e.y, 'large', true)
      w.splash(e.x, e.y, 95, 220)
      if (!w.preview) sfxAt('chain_reaction', e.x, 0.6)
    })
  },
})

def({
  id: 'radar', hp: 120, r: 18, sprite: 'radar', layer: 'ground', score: 400, credits: 50, charge: 5, explode: 'medium', target: true,
  update(e, w) {
    e.s.spin = (e.s.spin ?? 0) + w.frameDt * 2
    if (onScreen(e, 40) && every(e, w, 'call', 5.5, 0.1)) {
      if (!w.preview && !e.s.called) { e.s.called = 1; w.emit({ type: 'radio', who: 'KESTREL', text: "Radar's painting me. Incoming interceptors!" }) }
      for (let i = 0; i < 3; i++) w.spawn('lancer', rand(60, PW - 60), -30 - i * 30)
    }
  },
  drawBody(ctx, e) {
    drawRef.sprite(ctx, 'radar', e.x, e.y, 0, 1, 1, e.flash)
    drawRef.sprite(ctx, 'radar_dish', e.x, e.y, e.s.spin ?? 0, 1, 1, e.flash)
  },
})

def({
  id: 'bunker', hp: 420, r: 28, sprite: 'bunker', layer: 'ground', score: 900, credits: 140, charge: 10, explode: 'large', target: true,
  update(e, w) {
    if (canFire(w, e) && every(e, w, 'f', 2.6)) {
      e.s.alt = (e.s.alt ?? 0) ^ 1
      if (e.s.alt) ring(w, e.x, e.y, 12, 130, Math.random())
      else aimed(w, e.x, e.y, 200, 5, 0.12)
    }
  },
})

def({
  id: 'cache', hp: 60, r: 16, sprite: 'cache', layer: 'ground', score: 250, credits: 140, charge: 4, explode: 'small', target: true,
})

def({
  id: 'repair_cache', hp: 60, r: 16, sprite: 'repair_cache', layer: 'ground', score: 250, credits: 20, charge: 4, explode: 'small', target: true,
  onDeath(e, w) { w.pickup(PickupKind.Repair, e.x, e.y, 35) },
})

// Train: engine pulls cars across the map along a track (horizontal movement).
def({
  id: 'train_engine', hp: 360, r: 22, sprite: 'train_engine', layer: 'ground', score: 800, credits: 100, charge: 8, explode: 'large', target: true, z: -1,
  update(e) { e.rot = e.vx >= 0 ? -Math.PI / 2 : Math.PI / 2 },
})
def({ id: 'train_cargo', hp: 150, r: 20, sprite: 'train_cargo', layer: 'ground', score: 300, credits: 110, charge: 4, explode: 'medium', target: true, z: -1,
  update(e) { e.rot = Math.PI / 2 } })
def({ id: 'train_fuel', hp: 90, r: 20, sprite: 'train_fuel', layer: 'ground', score: 300, credits: 30, charge: 4, explode: 'large', target: true, z: -1,
  update(e) { e.rot = Math.PI / 2 },
  onDeath(e, w) { w.splash(e.x, e.y, 80, 200); if (!w.preview) sfxAt('chain_reaction', e.x, 0.6) } })
def({
  id: 'train_gun', hp: 200, r: 20, sprite: 'train_flat', layer: 'ground', score: 400, credits: 50, charge: 5, explode: 'medium', target: true, z: -1,
  update(e, w) {
    const ready = turnToward(e, w, 2)
    if (ready && canFire(w, e) && every(e, w, 'f', 1.6)) aimed(w, e.x, e.y, 200, 3, 0.15)
  },
  drawBody(ctx, e) {
    drawRef.sprite(ctx, 'train_flat', e.x, e.y, Math.PI / 2, 1, 1, e.flash)
    drawRef.sprite(ctx, 'turret_barrel', e.x, e.y, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, 1, 1, e.flash)
  },
})

// Naval
def({
  id: 'gunboat', hp: 130, r: 18, sprite: 'gunboat', layer: 'ground', score: 300, credits: 40, charge: 5, explode: 'medium', target: true,
  update(e, w) {
    if (Math.random() < 0.5) w.parts.spawn(P.Smoke, e.x + rand(-6, 6), e.y + 20, 0, 30, 0.8, 3, 9, C.ice, 0, true)
    const ready = turnToward(e, w, 2)
    if (ready && canFire(w, e) && every(e, w, 'f', 1.9)) aimed(w, e.x, e.y - 4, 190, 2, 0.1)
  },
  draw(ctx, e) { drawRef.sprite(ctx, 'turret_barrel', e.x, e.y - 4, (e.s.aim ?? Math.PI / 2) - Math.PI / 2, 0.8, 1, e.flash) },
})

/** Submarine: invulnerable underwater, surfaces to fire. */
def({
  id: 'sub', hp: 170, r: 20, sprite: 'sub', layer: 'ground', score: 500, credits: 60, charge: 6, explode: 'medium', target: true,
  init(e) { e.armor = 0; e.visibleAlpha = 0.25; e.s.phase = 0; e.s.t = rand(0.5, 1.5) },
  update(e, w, dt) {
    e.s.t -= dt
    if (e.s.phase === 0 && e.s.t <= 0 && onScreen(e, 60)) { e.s.phase = 1; e.s.t = 0.8 }
    else if (e.s.phase === 1) {
      e.visibleAlpha = Math.min(1, e.visibleAlpha + dt * 1.2)
      if (Math.random() < 0.6) w.parts.spawn(P.Smoke, e.x + rand(-20, 20), e.y + rand(-10, 10), 0, 0, 0.6, 4, 10, C.ice, 0, true)
      if (e.s.t <= 0) { e.s.phase = 2; e.s.t = 2.6; e.armor = 1 }
    } else if (e.s.phase === 2) {
      if (canFire(w, e) && every(e, w, 'f', 1.2)) ring(w, e.x, e.y, e.elite ? 14 : 10, 130, e.age)
      if (e.s.t <= 0) { e.s.phase = 3; e.s.t = 0.8; e.armor = 0 }
    } else if (e.s.phase === 3) {
      e.visibleAlpha = Math.max(0.25, e.visibleAlpha - dt * 1.2)
      if (e.s.t <= 0) { e.s.phase = 0; e.s.t = 2 }
    }
  },
})

def({
  id: 'destroyer', hp: 900, r: 34, sprite: 'destroyer', layer: 'ground', score: 2000, credits: 260, charge: 15, explode: 'large', target: true,
  init(e, w) {
    for (const oy of [-38, 34]) w.spawn('turret', e.x, e.y + oy, { parent: e, ox: 0, oy })
    e.s.permShield = 0
  },
  update(e, w) {
    if (Math.random() < 0.6) w.parts.spawn(P.Smoke, e.x + rand(-14, 14), e.y + 70, 0, 20, 1.2, 5, 14, C.ice, 0, true)
    if (canFire(w, e) && every(e, w, 'f', 3)) {
      missile(w, e.x - 10, e.y, Math.PI, 140, 1.4)
      missile(w, e.x + 10, e.y, 0, 140, 1.4)
    }
  },
  onDeath(e, w) { chainExplosion(w, e.x, e.y, 50, 8, 0.8, 'large') },
})

/** Civilians. Shooting them has consequences. */
def({
  id: 'trawler', hp: 40, r: 16, sprite: 'trawler', layer: 'ground', score: 0, credits: 0, charge: 0, explode: 'medium', contact: 0,
  init(e) { e.s.civilian = 1 },
  update(e, w) { if (Math.random() < 0.3) w.parts.spawn(P.Smoke, e.x, e.y + 18, 0, 20, 0.8, 3, 8, C.ice, 0, true) },
  onDeath(_e, w) { w.flags.add('civilian_hit'); if (!w.preview) w.emit({ type: 'radio', who: 'TRAWLER', text: 'MAYDAY! We are civilians! Stop shooting!', tone: 'odd' }) },
})

// Station
def({
  id: 'hangar', hp: 480, r: 30, sprite: 'hangar', layer: 'ground', score: 1000, credits: 120, charge: 10, explode: 'large', target: true,
  update(e, w) {
    if (onScreen(e, 40) && e.y < PH * 0.7 && every(e, w, 'launch', 1.6, 0.1)) {
      const side = chance(0.5) ? -1 : 1
      w.spawn('wasp', e.x, e.y, {
        mover: new PathMover([[e.x, e.y], [e.x + side * 80, e.y - 60], [e.x + side * 200, e.y + 80], [e.x + side * 260, PH + 80]], 200),
      })
    }
  },
})

/** Laser gate pylon: paired pylons project a beam between them until one dies. */
def({
  id: 'pylon', hp: 200, r: 16, sprite: 'pylon', layer: 'ground', score: 400, credits: 40, charge: 5, explode: 'medium', target: true,
  update(e, w) {
    const mate = e.data as Enemy | null
    if (!mate || mate.dead || e.x > mate.x) return
    const on = Math.sin(w.time * 1.4 + e.id) > -0.35
    e.s.on = on ? 1 : 0
    if (!on || !w.player.alive || w.player.phased) return
    const p = w.player
    if (p.x > e.x && p.x < mate.x && Math.abs(p.y - e.y) < 6 + p.hitR) p.hurt(40 * w.frameDt * 3, p.x, p.y, true)
  },
  draw(ctx, e, w) {
    const mate = e.data as Enemy | null
    if (!mate || mate.dead || e.x > mate.x) return
    const on = e.s.on
    ctx.globalCompositeOperation = 'lighter'
    ctx.strokeStyle = on ? '#ff2e88' : 'rgba(255,46,136,0.25)'
    ctx.lineWidth = on ? 6 + Math.sin(w.time * 40) * 1.5 : 1
    ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(mate.x, mate.y); ctx.stroke()
    if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke() }
    ctx.globalCompositeOperation = 'source-over'
  },
})

// Final citadel organics
def({
  id: 'cantor', hp: 240, r: 22, sprite: 'cantor', layer: 'air', score: 700, credits: 80, charge: 8, explode: 'medium',
  update(e, w, dt) {
    if (!canFire(w, e)) return
    e.s.sing = (e.s.sing ?? 0) + dt
    if (e.s.sing % 3 < 1.2) {
      if (every(e, w, 'f', 0.12, 0)) {
        const a = Math.PI / 2 + Math.sin(e.s.sing * 4) * 0.9
        const b = w.fire(e.x, e.y + 10, a, 170, BulletKind.Wave, 10)
        if (b) b.curve = Math.sin(e.s.sing * 2) * 0.6
      }
    }
  },
})

def({
  id: 'node', hp: 300, r: 22, sprite: 'node', layer: 'ground', score: 600, credits: 70, charge: 6, explode: 'large', target: true,
  update(e, w) {
    if (canFire(w, e) && every(e, w, 'f', 2.2)) ring(w, e.x, e.y, e.elite ? 16 : 12, 120, e.age * 0.7, BulletKind.Shard)
  },
})

export const ENEMIES: Record<string, EnemyDef> = Object.fromEntries(defs.map((d) => [d.id, d]))

export function registerEnemy(d: EnemyDef) { ENEMIES[d.id] = d }

