import type { World } from '../world'
import type { Enemy } from '../entities'
import { BulletKind } from '../entities'
import { registerEnemy } from '../../data/enemies'
import { bossDef, startBoss, partDown, phaseShift, alive } from './common'
import { ring, spiral, canFire, enemySfx } from '../patterns'
import { explode, sparks } from '../fx'
import { HoverMover, LineMover } from '../movers'
import { PW, PH } from '../consts'
import { rand, TAU, clamp } from '../../core/math'
import { P, C } from '../../render/particles'
import { drawSprite, getSprite } from '../../render/sprites'
import { audio } from '../../audio/audio'
import { spawnFx } from './revenant'

/**
 * THE CHOIR — the network's heart, the final fight.
 *  P1 "The Wall": a fortified organ front spans the sky. Six pipe cannons play
 *     chords of bullet columns and beams (lanes between pipes stay safe), two
 *     voices sing curving choruses. The heart sits armoured behind an iris.
 *  P2 "The Heart": the wall splits, the heart descends inside a ring of
 *     rotating bone petals that physically block shots; it sings spirals and
 *     sweeping streams and calls cantors.
 *  P3 "Crescendo": the citadel collapses, scroll resumes fast through falling
 *     debris, the heart chases you with a rose of bullets that always leaves a
 *     door, and scissor beams that never fully close.
 */
const WALL_Y = 52
const HEART_Y = 175
/** Boss scale for the wide field (art is painted at 1×). Below Smelter's 1.3: the pipes already reach half-way down. */
const S = 1.15

const PIPES: [number, number][] = [[-230, 128], [-165, 128], [-100, 128], [100, 128], [165, 128], [230, 128]].map(([x, y]) => [x * S, y * S])
const VOICES: [number, number][] = [[-56, 86], [56, 86]].map(([x, y]) => [x * S, y * S])

bossDef({
  id: 'm7_choir', hp: 24000, r: 48, sprite: 'm7_heart', explode: 'huge', score: 100000,
  update(e, w, dt) { choirUpdate(e, w, dt) },
  drawBody(ctx, e, w) { drawChoir(ctx, e, w) },
})

bossDef({
  id: 'm7_pipe', hp: 1600, r: 23, scale: S, sprite: 'm7_pipe', explode: 'large', score: 5000,
  update(e, w, dt) { pipeUpdate(e, w, dt) },
  drawBody(ctx, e) {
    drawSprite(ctx, getSprite('m7_pipe'), e.x, e.y, 0, S, 1, e.flash)
    const k = e.s.tell ?? 0
    if (k <= 0) return
    // the pipe draws breath: its mouth brightens before it plays
    ctx.globalCompositeOperation = 'lighter'
    const my = e.y + 60 * S
    const g = ctx.createRadialGradient(e.x, my, 0, e.x, my, (10 + k * 14) * S)
    g.addColorStop(0, `rgba(255,255,255,${0.4 + 0.5 * k})`)
    g.addColorStop(0.4, `rgba(196,155,255,${0.5 * k})`)
    g.addColorStop(1, 'rgba(196,155,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(e.x, my, (10 + k * 14) * S, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'

  },
  onDeath(e, w) { partDown(w, e); sparks(w, e.x, e.y + 50 * S, 20, C.gold, 260, 0.5) },
})

bossDef({
  id: 'm7_voice', hp: 2600, r: 32, scale: S, sprite: 'm7_voice', explode: 'large', score: 6000,
  update(e, w) {
    const root = e.parent!
    if (root.s.intro || root.s.phase !== 1 || w.raid.stunT > 0) return
    e.rot = Math.sin(w.time * 1.3 + e.ox) * 0.12
    if (!canFire(w, e)) return
    const side = e.ox < 0 ? -1 : 1
    e.s.t = (e.s.t ?? (side < 0 ? 1.5 : 3.2)) - w.frameDt * w.diff.fireRate * w.raid.rate
    if (e.s.t <= 0) {
      e.s.t = 2.7
      e.s.n = (e.s.n ?? 0) + 1
      if (e.s.n % 3 === 0) ring(w, e.x, e.y, 16, 105, rand(0, TAU), BulletKind.Orb, 11)
      else {
        // chorus: a fan of wave notes that bends back across the field
        const bend = side * (e.s.n % 2 ? 0.5 : -0.5)
        for (let i = 0; i < 11; i++) {
          const b = w.fire(e.x, e.y + 20 * S, Math.PI / 2 + (i - 5) * 0.17 - bend * 0.8, 150, BulletKind.Wave, 11)
          if (b) b.curve = bend
        }
        enemySfx(w, e.x, true)
      }
    }
  },
  onDeath(e, w) { partDown(w, e); w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.5, 20, 140, C.violet) },
})

bossDef({
  id: 'm7_petal', hp: 1500, r: 25, scale: S, sprite: 'm7_petal', explode: 'medium', score: 2000,
  init(e) { e.hidden = true; e.armor = 0 },
  update(e, w) {
    const root = e.parent!
    if (e.hidden || root.s.dying || !canFire(w, e)) return
    const a = e.rot + Math.PI / 2
    if (Math.sin(a) < 0.25) return
    e.s.t = (e.s.t ?? rand(0.5, 2.2)) - w.frameDt * w.diff.fireRate * w.raid.rate
    if (e.s.t <= 0) { e.s.t = root.s.phase === 3 ? 1.9 : 2.4; w.fire(e.x, e.y, a, 130, BulletKind.Shard, 10) }
  },
  onDeath(e, w) { partDown(w, e, 'medium') },
})

registerEnemy({
  id: 'm7_debris', hp: 45, r: 16, sprite: 'm7_debris', layer: 'air', score: 40, credits: 4, charge: 1, explode: 'small', contact: 22,
  init(e) { e.s.spin = rand(-2, 2); e.rot = rand(0, TAU); e.s.ignoreGate = 1 },
  update(e, w) { e.rot += e.s.spin * w.frameDt; if (e.y > PH + 50) e.gone = true },
})

// ───────────────────────── behaviour ─────────────────────────

function pipeUpdate(e: Enemy, w: World, dt: number) {
  const root = e.parent!
  e.s.tell = Math.max(0, (e.s.tell ?? 0) - dt * 0.5)
  if (root.s.intro || root.s.phase !== 1 || w.raid.stunT > 0) return
  if (e.s.play > 0) {
    // column: a vertical stream of notes, slightly wavering
    e.s.play -= dt
    e.s.nt = (e.s.nt ?? 0) - dt * w.diff.fireRate
    if (e.s.nt <= 0 && canFire(w, e)) {
      e.s.nt = 0.09
      w.fire(e.x + Math.sin(w.time * 9) * 5, e.y + 62 * S, Math.PI / 2, 235, BulletKind.Orb, 11)
      enemySfx(w, e.x)
    }
  }
}

/** Ask a pipe to play: 'column' (bullet stream) or 'beam' (telegraphed laser). */
function playPipe(w: World, p: Enemy, beam: boolean) {
  p.s.tell = 1
  if (beam) {
    w.laser(p.x, p.y + 64 * S, Math.PI / 2, 900, 25, 1.15, 1.2, p)
  } else {
    w.after(0.65, () => { if (!p.dead) p.s.play = 1.5 })
  }
}

function choirUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.time = (s.time ?? 0) + dt
  const parts = w.bossParts

  if (s.intro) {
    e.y += (WALL_Y - e.y) * Math.min(1, dt * 0.8)
    w.addShake(0.8)
    if (Math.random() < 0.6) w.parts.spawn(P.Smoke, rand(0, PW), e.y + rand(40, 90) * S, rand(-20, 20), 20, 1.2, 10, 30, C.smokeDark, 0.5)
    if (Math.abs(e.y - WALL_Y) < 3) {
      s.intro = 0
      w.emit({ type: 'radio', who: 'CHOIR', text: 'WE ARE THE CHOIR. WE HAVE ALWAYS BEEN SINGING. NOW LISTEN.', tone: 'enemy' })
    }
    return
  }
  if (s.dying) { dyingUpdate(e, w, dt); return }

  // collapse scroll: fast during the crescendo, easing off as it dies
  if (s.phase === 3) w.scroll += (170 - w.scroll) * Math.min(1, dt * 0.7)

  const pipes = alive(parts, 'pipe'), voices = alive(parts, 'voice'), petals = alive(parts, 'petal')
  const raid = w.raid
  if (raid.stunT > 0) {
    if (Math.random() < 0.6) w.parts.spawn(P.Spark, e.x + rand(-60, 60) * S, e.y + rand(-40, 60) * S, rand(-120, 120), rand(-160, 40), 0.4, 2, 0.5, C.cyan, 3)
    return
  }
  const rate = w.diff.fireRate * raid.rate
  const tick = (k: string, first: number) => (s[k] = (s[k] ?? first) - dt * rate)

  if (s.phase === 1) {
    if (voices.length && tick('requiemT', 6) <= 0 && raid.ready()) {
      s.requiemT = 15
      const v = voices[Math.floor(Math.random() * voices.length)]
      raid.begin(w, 'Requiem', 3.6, (ww) => requiem(ww), { kick: { target: v }, warn: 'Interrupt — silence the marked voice!' })
    }
    if (tick('resT', 10) <= 0 && raid.ready()) {
      s.resT = 18
      const x = clamp(w.player.x + rand(-230, 230), 100, PW - 100), y = rand(PH * 0.6, PH * 0.82)
      raid.begin(w, 'Resonance', 0.8, (ww) => ww.raid.zone({ x, y, r: 78, kind: 'soak', delay: 3.4, dmg: 46 }), { warn: 'Resonance — soak it!' })
    }
    // chords: one or two pipes at a time, alternating streams and beams. The pipe right
    // above the player is skipped once in a while so there is always a window to hit it.
    s.chord = (s.chord ?? 1.5) - dt * rate
    if (s.chord <= 0 && pipes.length) {
      s.n = (s.n ?? 0) + 1
      s.chord = pipes.length > 3 ? 2.1 : 1.7
      const near = [...pipes].sort((a, b) => Math.abs(a.x - w.player.x) - Math.abs(b.x - w.player.x))
      const pool = (s.n % 3 === 0 ? near : near.slice(1)).sort(() => Math.random() - 0.5)
      if (!pool.length) pool.push(near[0])
      const count = Math.min(pool.length, pipes.length > 3 ? 2 : 1)
      pool.slice(0, count).forEach((p, i) => playPipe(w, p, (s.n + i) % 2 === 0))
    }
    // the heart hums through the iris: slow rings, quicker as the wall loses its voices
    s.humT = (s.humT ?? 2.5) - dt * rate
    if (s.humT <= 0 && w.player.alive) {
      s.humT = 2.2 + (pipes.length + voices.length) * 0.25
      ring(w, e.x, e.y + 40 * S, 22, 105, s.time * 0.7, BulletKind.Wave, 11)
    }
    if (pipes.length === 0 && voices.length === 0) {
      s.phase = 2
      s.trans = 0
      e.armor = 0
      w.clearBullets(PW / 2, PH / 2, 2000)
      w.lasers.length = 0
      phaseShift(w, 'THEN HEAR US WITHOUT WALLS.')
      w.addShake(20)
      if (!w.preview) audio.sfx('expl_huge')
      w.after(2, () => w.emit({ type: 'radio', who: 'HALLORAN', text: "There's the heart. The petals are shielding it. Shoot through the gaps." }))
    }
    return
  }

  // ── P2/P3: the heart ──
  if (s.trans < 1) {
    s.trans = Math.min(1, s.trans + dt / 3)
    const k = s.trans
    e.y = WALL_Y + (HEART_Y - WALL_Y) * (k * k * (3 - 2 * k))
    if (Math.random() < 0.8) w.parts.spawn(P.Debris, PW / 2 + rand(-60, 60) * S, WALL_Y + rand(-40, 60) * S, rand(-200, 200), rand(-50, 150), 1, rand(3, 7), 1, C.smokeDark, 1)
    if (k >= 1) {
      e.armor = 1
      for (const p of petals) { p.hidden = false; p.armor = 1 }
      ring(w, e.x, e.y, 20, 110, 0, BulletKind.Wave, 11)
    }
    placePetals(e, parts, s.time, 0.8)
    return
  }

  if (s.phase === 2 && e.hp < e.maxHp * 0.5) {
    s.phase = 3
    phaseShift(w, 'CRESCENDO.')
    w.events.push({ type: 'phase', name: 'collapse' })
    w.addShake(24)
    w.flashScreen = 0.6
    w.after(1.5, () => w.emit({ type: 'radio', who: 'HALLORAN', text: 'The whole citadel is coming down around you. Keep moving, keep firing.' }))
    w.after(4, () => w.emit({ type: 'radio', who: 'KESTREL', text: "It's following me. Good. Come on then." }))
  }
  if (s.phase === 3 && e.hp < e.maxHp * 0.012) { startDying(e, w); return }

  // movement
  if (s.phase === 2) {
    const tx = PW / 2 + Math.sin(s.time * 0.4) * 164
    e.x += clamp(tx - e.x, -70 * dt, 70 * dt)
    e.y += (HEART_Y + Math.sin(s.time * 0.7) * 12 - e.y) * Math.min(1, dt * 2)
  } else {
    const tx = clamp(w.player.x, 120, PW - 120)
    e.x += clamp(tx - e.x, -82 * dt, 82 * dt)
    e.y += (200 + Math.sin(s.time * 0.9) * 19 - e.y) * Math.min(1, dt * 1.5)
    s.fall = (s.fall ?? 0) + dt
  }
  placePetals(e, parts, s.time, s.phase === 3 ? 1.5 : 0.8)

  if (tick('hymnT', 5) <= 0 && raid.ready()) {
    s.hymnT = s.phase === 3 ? 12 : 15
    raid.begin(w, s.phase === 3 ? 'Final Verse' : 'Hymn of Unmaking', 3.6, (ww) => unmaking(ww, e), { kick: { target: e, seconds: 0.55 }, warn: 'Interrupt — shoot the heart between the petals!' })
  }
  if (s.phase === 2 && tick('beatT', 9) <= 0 && raid.ready()) {
    s.beatT = 16
    raid.begin(w, 'Heartbeat', 1.2, (ww) => {
      ww.raid.pull(e.x, e.y, 110, 4)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + rand(0, 0.3)
        ww.raid.zone({ x: e.x + Math.cos(a) * 150, y: e.y + Math.sin(a) * 150, r: 46, kind: 'pool', delay: 0.5, linger: 4, dmg: 36 })
      }
    }, { warn: 'Heartbeat — pull against it!' })
  }
  if (s.phase === 3 && tick('fallT', 4) <= 0 && raid.ready()) {
    s.fallT = 7
    raid.begin(w, 'Collapse', 0.8, (ww) => {
      for (let i = 0; i < 6; i++) ww.raid.zone({ x: rand(50, PW - 50), y: rand(PH * 0.45, PH - 40), r: 56, kind: 'blast', delay: 1.4 + i * 0.1, dmg: 22 })
    }, { warn: 'Collapse' })
  }
  if (!canFire(w, e)) return
  const fr = rate
  if (s.phase === 2) {
    spiral(w, e, dt, 9, 3, 1.3, 145, BulletKind.Wave)
    s.streamT = (s.streamT ?? 3) - dt * fr
    if (s.streamT <= 0) { s.streamT = 3.6; streams(w, e) }
    s.callT = (s.callT ?? 6) - dt
    if (s.callT <= 0) {
      s.callT = 13
      const cantors = w.enemies.filter((o) => !o.dead && o.def.id === 'cantor').length
      for (let i = cantors; i < 2; i++) {
        const tx = i === 0 ? PW * 0.18 : PW * 0.82
        const c = w.spawn('cantor', e.x, e.y, { mover: new HoverMover(tx, 102, 1.5, 9) })
        w.parts.spawn(P.Ring, c.x, c.y, 0, 0, 0.5, 10, 70, C.violet)
      }
      w.emit({ type: 'radio', who: 'CHOIR', text: 'SING WITH US.', tone: 'enemy' })
    }
  } else {
    // debris rain: visible from the top, straight lines, shootable
    s.debT = (s.debT ?? 0.5) - dt
    if (s.debT <= 0) {
      s.debT = rand(0.42, 0.7)
      const x = rand(30, PW - 30)
      if (Math.abs(x - w.player.x) > 40 || Math.random() < 0.4) w.spawn('m7_debris', x, -30, { mover: new LineMover(rand(-20, 20), rand(190, 250)) })
    }
    s.cyc = (s.cyc ?? 0) + dt * fr
    const c = s.cyc % 9
    if (c < 5.2) {
      spiral(w, e, dt, 8, 4, -0.8, 130, BulletKind.Orb)
      s.roseT = (s.roseT ?? 0.8) - dt * fr
      if (s.roseT <= 0) { s.roseT = 1.35; rose(w, e) }
    } else {
      const idx = Math.floor(s.cyc / 9)
      if (s.sciIdx !== idx) { s.sciIdx = idx; scissors(w, e) }
    }
  }
}

function placePetals(e: Enemy, parts: Enemy[], t: number, speed: number) {
  const petals = parts.filter((p) => p.tag === 'petal')
  petals.forEach((p, i) => {
    const a = t * speed + (i / petals.length) * TAU
    p.ox = Math.cos(a) * 86 * S; p.oy = Math.sin(a) * 86 * S
    p.x = e.x + p.ox; p.y = e.y + p.oy
    p.rot = a - Math.PI / 2
  })
}

/** Two sweeping streams that bend inward across the field. */
function streams(w: World, e: Enemy) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      w.after(i * 0.09, () => {
        if (e.dead || e.s.dying) return
        const b = w.fire(e.x + side * 30 * S, e.y + 20 * S, Math.PI / 2 + side * 0.95, 170, BulletKind.Wave, 11)
        if (b) b.curve = -side * 0.62
      })
    }
  }
  enemySfx(w, e.x, true)
}

/** A slowly turning ring of notes with a door facing the player when it is sung. */
function rose(w: World, e: Enemy) {
  const toP = Math.atan2(w.player.y - e.y, w.player.x - e.x)
  const n = 32
  const turn = (e.s.roseDir = -(e.s.roseDir || 1))
  for (let i = 0; i < n; i++) {
    const a = toP + (i / n) * TAU
    if (Math.abs(Math.atan2(Math.sin(a - toP), Math.cos(a - toP))) < 0.5) continue
    const b = w.fire(e.x, e.y, a, 125, BulletKind.Wave, 11)
    if (b) b.curve = turn * 0.18
  }
  w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.35, 20, 90 * S, C.violet)
  enemySfx(w, e.x, true)
}

/** Two beams sweeping inward from wide angles (the sweep also runs during the telegraph); they stop ~0.4 rad either side of straight down. */
function scissors(w: World, e: Enemy) {
  for (const side of [-1, 1]) w.laser(e.x, e.y + 20 * S, Math.PI / 2 + side * 1.05, 1100, 23, 1.1, 1.7, e, -side * 0.22)
}

/** Failed Requiem: every pipe left plays a beam at once, except the one nearest beside the player. */
function requiem(w: World) {
  const pipes = alive(w.bossParts, 'pipe')
  const spare = [...pipes].sort((a, b) => Math.abs(a.x - w.player.x) - Math.abs(b.x - w.player.x))[1]
  for (const p of pipes) if (p !== spare) w.laser(p.x, p.y + 64 * S, Math.PI / 2, 900, 25, 0.9, 1.4, p)
  w.player.hurt(12, w.player.x, w.player.y)
  w.flashScreen = Math.max(w.flashScreen, 0.35)
  w.addShake(12)
}

/** Failed Hymn: three roses in quick succession, each with its door. */
function unmaking(w: World, e: Enemy) {
  w.player.hurt(14, w.player.x, w.player.y)
  w.flashScreen = Math.max(w.flashScreen, 0.45)
  w.addShake(16)
  for (let k = 0; k < 3; k++) w.after(k * 0.45, () => { if (!e.dead && !e.s.dying) rose(w, e) })
}

function startDying(e: Enemy, w: World) {
  const s = e.s
  s.dying = 1
  s.dieT = 0
  e.armor = 0
  w.clearBullets(PW / 2, PH / 2, 2000)
  w.lasers.length = 0
  for (const o of w.enemies) if (!o.bossPart && !o.dead && o.layer === 'air' && o.def.id !== 'm6_fx') w.kill(o, false)
  w.emit({ type: 'radio', who: 'CHOIR', text: 'NO. NO. THE SONG IS NOT FINISHED. THE SONG IS NOT', tone: 'enemy' })
  if (!w.preview) audio.sfx('boss_phase')
}

function dyingUpdate(e: Enemy, w: World, dt: number) {
  const s = e.s
  s.dieT += dt
  w.scroll += (25 - w.scroll) * Math.min(1, dt * 0.8)
  const k = s.dieT / 4.8
  e.x += Math.sin(s.dieT * 40) * k * 2.5
  placePetals(e, w.bossParts, s.time += dt * (1 + k * 6), 0.8)
  w.addShake(0.8 + k * 3)
  s.boomT = (s.boomT ?? 0) - dt
  if (s.boomT <= 0) {
    s.boomT = 0.3 - k * 0.2
    const a = rand(0, TAU), r = rand(20, 90) * S
    explode(w, e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, k > 0.6 ? 'large' : 'medium', false, C.magenta)
    w.parts.spawn(P.Ring, e.x, e.y, 0, 0, 0.6, 30, (160 + k * 200) * S, k > 0.5 ? C.white : C.violet)
  }
  // petals tear off one by one
  const petals = alive(w.bossParts, 'petal')
  if (petals.length && s.dieT > 0.6 * (7 - petals.length)) w.kill(petals[0], false)
  if (s.dieT > 1.6 && !s.flash1) { s.flash1 = 1; w.flashScreen = 0.5 }
  if (s.dieT > 3.2 && !s.flash2) { s.flash2 = 1; w.flashScreen = 0.7 }
  if (s.dieT >= 4.8) {
    e.armor = 1
    const x = e.x, y = e.y
    w.kill(e)
    // the husk lingers, cracking and dimming, while the final chain rips through it
    const t0 = w.time
    spawnFx(w, {
      update(ww, _dt, fx) { if (ww.time - t0 > 3.6) fx.gone = true },
      draw(ctx, ww) {
        const k = (ww.time - t0) / 3.6
        ctx.save()
        ctx.filter = `brightness(${1.6 - k * 1.3}) saturate(${1 - k * 0.8})`
        drawSprite(ctx, getSprite('m7_heart'), x + Math.sin(ww.time * 50) * 3 * (1 - k), y + k * 30, k * 0.4, (1 - k * 0.35) * S, 1 - k * k, 0)
        ctx.restore()
      },
    })
    // after the standard final chain: one last white-out and the song dissolving
    w.after(3.7, () => {
      w.flashScreen = 1
      w.addShake(24)
      for (let i = 0; i < 5; i++) w.parts.spawn(P.Ring, x, y, 0, 0, 1 + i * 0.3, 30, 500 + i * 160, i % 2 ? C.violet : C.white)
      for (let i = 0; i < 60; i++) {
        const a = rand(0, TAU), sp = rand(60, 320)
        w.parts.spawn(P.Ember, x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.5, 3), 3, 1, i % 3 ? C.violet : C.magenta, 1)
      }
    })
  }
}

// ───────────────────────── drawing ─────────────────────────

function drawChoir(ctx: CanvasRenderingContext2D, e: Enemy, w: World) {
  const s = e.s
  const tr = s.phase >= 2 ? (s.trans ?? 0) : 0
  const split = tr * tr * (3 - 2 * tr)
  const fall = s.fall ?? 0
  const wy = (s.phase >= 2 ? WALL_Y : e.y) + split * 14 * S + fall * fall * 30
  const wa = clamp(1 - fall / 3, 0, 1)
  if (wa > 0) {
    for (const side of [-1, 1]) {
      ctx.save()
      ctx.globalAlpha = wa
      ctx.translate(PW / 2 + side * (150 * S + split * 260), wy)
      ctx.rotate(side * (split * 0.06 + fall * 0.1))
      drawSprite(ctx, getSprite(side < 0 ? 'm7_wall_l' : 'm7_wall_r'), 0, 0, 0, S, wa, s.phase === 1 ? e.flash * 0.4 : 0)
      ctx.restore()
    }
  }
  if (s.phase === 1 || s.intro) {
    // the heart glimpsed through the iris seam
    const k = 0.35 + 0.25 * Math.sin(w.time * 5)
    ctx.globalCompositeOperation = 'lighter'
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 30 * S)
    g.addColorStop(0, `rgba(255,220,240,${k})`)
    g.addColorStop(1, 'rgba(196,155,255,0)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(e.x, e.y, 30 * S, 0, TAU); ctx.fill()
    ctx.globalCompositeOperation = 'source-over'
    return
  }
  // heartbeat
  const beat = Math.max(0, Math.sin(w.time * (s.phase === 3 ? 9 : 6))) ** 4
  const sc = (1 + beat * 0.05 - (s.dying ? (s.dieT ?? 0) * 0.04 : 0)) * S
  drawSprite(ctx, getSprite('m7_heart'), e.x, e.y, 0, sc, 1, e.flash)
  ctx.globalCompositeOperation = 'lighter'
  const r = (14 + beat * 8 + (s.dying ? s.dieT * 10 : 0)) * S
  const g = ctx.createRadialGradient(e.x, e.y + 6 * S, 0, e.x, e.y + 6 * S, r)
  g.addColorStop(0, 'rgba(255,255,255,0.95)')
  g.addColorStop(0.35, 'rgba(210,170,255,0.7)')
  g.addColorStop(1, 'rgba(196,155,255,0)')
  ctx.fillStyle = g
  ctx.beginPath(); ctx.arc(e.x, e.y + 6 * S, r, 0, TAU); ctx.fill()
  ctx.globalCompositeOperation = 'source-over'
}

export function spawnChoir(w: World) {
  const e = w.spawn('m7_choir', PW / 2, -120)
  e.s.intro = 1
  e.s.phase = 1
  e.s.trans = 0
  e.armor = 0
  const parts: Enemy[] = []
  for (const [ox, oy] of PIPES) parts.push(w.spawn('m7_pipe', e.x + ox, e.y + oy, { parent: e, ox, oy, tag: 'pipe' }))
  for (const [ox, oy] of VOICES) parts.push(w.spawn('m7_voice', e.x + ox, e.y + oy, { parent: e, ox, oy, tag: 'voice' }))
  for (let i = 0; i < 6; i++) parts.push(w.spawn('m7_petal', e.x, e.y, { parent: e, ox: 0, oy: 0, tag: 'petal' }))
  startBoss(w, e, 'The Choir', parts, true, 330)
  return e
}
