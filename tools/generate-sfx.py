"""Design EMBERLINE's sound effects offline and export them as WAV samples.

usage: python3 tools/generate-sfx.py [name ...]      (no args = everything)
Writes public/sfx/<name>[_vN].wav (16-bit 44.1 kHz) and merges public/sfx/manifest.json.
Per-sound `gain` in the manifest is owned by tools/sfx-calibrate.py and survives regeneration.

Every sound is layered like a sound designer would: transient (click/crack) + body (tone or filtered
noise with pitch/filter motion) + weight (sub thump) + colour (saturation) + space (room/reverb).
Frequent sounds get several randomized variants so repetition doesn't grate. Recipes are tuned so
that playbackRate 1 matches the pitch the game was balanced against (game code passes pitch
multipliers such as 0.7 or 1.5).
"""
import json
import os
import sys

import numpy as np
from scipy.signal import lfilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sfxdsp import (SR, at, bp, brown, comp, crush, dust, env, expdec, finalize, fit, fm, formant, glide,  # noqa: E402
                    hp, loudness, lp, mix, ns, osc, pan, partials, pink, reverb, room, sat, shelf, stereo, transient, tt,
                    white, widen)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sfx')


def mtof(m):
    return 440 * 2 ** ((m - 69) / 12)


# ================================================================== building blocks

def click(r, dur=0.004, f=3500, q=0.8):
    return bp(white(dur + 0.002, r), f, q)[: ns(dur)] * env(dur, 0.0002, curve=6)


def thump(f0, f1, dur, drop=None, curve=5.0):
    """Kick-drum style sine with a fast pitch drop."""
    f = glide(f0, f1, drop or dur * 0.6, dur, curve=curve)
    return osc('sine', f) * env(dur, 0.0006, curve=4)


def comb(x, freq, g=0.8):
    """Feedback comb: gives a hollow tube resonance at `freq`."""
    d = max(1, int(round(SR / freq)))
    a = np.zeros(d + 1)
    a[0], a[-1] = 1, -g
    return lfilter([1 - g], a, x, axis=-1)


def bell(f, dur, r=None, ratio=3.5, index=2.2, tau=None, bright=1.0):
    """FM bell/chime: metallic attack that mellows as the index decays."""
    tau = tau or dur / 4
    idx = index * bright * expdec(dur, tau * 0.35)
    body = fm(f, ratio, idx, dur) * expdec(dur, tau, a=0.0008)
    shim = 0.18 * np.sin(2 * np.pi * f * 2.005 * tt(dur)) * expdec(dur, tau * 0.3)
    return body + shim


def brass(f, dur, r, bright=1.0, n=3):
    """Detuned saw ensemble with a filter envelope and delayed vibrato."""
    t = tt(dur + 0.25)
    vib = 1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.18) / 0.2, 0, 1)
    x = sum(osc('saw', f * vib * (1 + d), phase=r.random()) for d in np.linspace(-0.006, 0.006, n)) / n
    fenv = env(dur + 0.25, 0.03, curve=2.5)
    x = lp(x, 400 + 2600 * bright * fenv + f * 1.2, 1.1)
    amp = np.minimum(1, t / 0.02) * np.where(t < dur, 1.0, np.exp(-(t - dur) / 0.08))
    return x * amp


def buzz(f, r, width=0.16, breath=0.18, growl=0.0, growl_hz=38.0):
    """Glottal-ish pulse source for the Choir's 'vocal machine' voices."""
    n = len(f)
    t = np.arange(n) / SR
    jitter = 1 + 0.006 * lp(r.standard_normal(n), 30) * 20
    src = osc('pulse', f * jitter, width=width) + breath * white(n / SR, r)
    if growl:
        src *= 1 + growl * np.sin(2 * np.pi * growl_hz * t)
    return src


def spark_bed(dur, rate, r, lo=2500, density=None, decay=0.0004):
    return hp(dust(dur, rate, r, decay=decay, density=density), lo)


def blast(r, size, pitch=1.0, width=0.7, crackle=1.0):
    """Explosion core, size 0 (pop) .. 1 (big). Returns stereo, no reverb."""
    dur = 0.3 + 1.5 * size
    p = pitch
    # 1) crack: broadband transient
    crack = hp(white(0.02, r), 700) * env(0.02, 0.0002, curve=7)
    # 2) boom: sub sine with a pitch drop
    sub = thump((95 + 70 * (1 - size)) * p, (30 + 14 * (1 - size)) * p, 0.25 + 0.7 * size, drop=0.08 + 0.3 * size, curve=4)
    sub = sat(sub * 1.6, 1.4)
    # 3) body: brown+pink noise through a closing low-pass, per channel for width
    body = []
    for _ in range(2):
        nz = brown(dur, r) * 0.8 + pink(dur, r) * 0.35
        fc = glide(4200 * p, (160 + 120 * (1 - size)) * p, dur * 0.75, dur, curve=3.2)
        body.append(lp(nz, fc, 0.9) * env(dur, 0.002, curve=3.2 + 1.5 * (1 - size)))
    body = np.stack(body)
    body = sat(body * 2.2, 2.0)
    # 4) debris: crackle that lingers after the blast
    deb_dur = dur * 1.1
    dens = np.clip(1 - tt(deb_dur) / deb_dur, 0, 1) ** 1.5
    deb = np.stack([bp(dust(deb_dur, 120 + 260 * size, r, decay=0.0007, density=dens), r.uniform(1800, 3200), 0.7)
                    for _ in range(2)]) * crackle
    x = mix(1.0 * crack, 1.1 * sub, 0.9 * body, 0.35 * at(deb, 0.03 + 0.05 * size))
    mid = x.mean(axis=0)
    side = (x[0] - x[1]) / 2 * width
    return np.stack([mid + side, mid - side])


def glue(x, drive=2.0):
    """Soft-clip a big sound so its body sits close to its transient peak (crest factor ~6.5 -> ~4.8 dB):
    explosions then reach their loudness without slamming the game's master limiter. Adds some crunch too."""
    return np.tanh(drive * x / (np.max(np.abs(x)) + 1e-12))


def metal_hit(f0, dur, r, bright=1.0, taus=None):
    ratios = [1, 1.47, 2.09, 2.56, 3.18, 4.07]
    amps = [1, 0.8, 0.6, 0.45 * bright, 0.3 * bright, 0.2 * bright]
    taus = taus or [0.35, 0.25, 0.18, 0.12, 0.08, 0.05]
    ring = partials(f0, ratios, amps, [t * dur / 0.5 for t in taus], dur, r, detune=0.01)
    knock = mix(1.5 * click(r, 0.008, 2200, 0.7), 0.8 * thump(f0 * 1.5, f0 * 0.7, 0.06))
    return mix(sat(ring * 1.4, 1.5), knock)


# ================================================================== player weapons (mono, short)

def shot_pulse(r):
    p = r.uniform(0.95, 1.05)
    dur = 0.15
    f = glide(1900 * p, 330 * p, 0.11, dur)
    body = 0.55 * osc('saw', f) + 0.45 * osc('pulse', f * 1.006, width=0.3)
    body = lp(body, glide(8000, 1400, 0.12, dur), 1.6) * env(dur, 0.0008, curve=4)
    zap = fm(glide(2800 * p, 600 * p, 0.07, dur), 1.41, 2.5 * expdec(dur, 0.02)) * expdec(dur, 0.025) * 0.35
    tsch = hp(white(0.06, r), 3000) * env(0.06, 0.0005, curve=5) * 0.3
    x = mix(body, zap, tsch, 0.5 * click(r, 0.004, 4800, 0.7), 0.35 * thump(170 * p, 80, 0.04))
    x = hp(sat(x * 1.7, 1.8), 120)
    return room(x, r, 0.05)


def shot_scatter(r):
    dur = 0.2
    p = r.uniform(0.93, 1.07)
    blast_ = bp(white(0.05, r), 1800, 0.6) * env(0.05, 0.0004, curve=4)
    body = bp(pink(dur, r), glide(1500 * p, 320 * p, 0.14, dur), 0.6) * env(dur, 0.001, curve=3.6)
    boom = thump(130 * p, 50 * p, 0.14, drop=0.05)
    pellets = mix(*[at(click(r, 0.004, r.uniform(2500, 5000), 0.9), r.uniform(0.004, 0.02)) for _ in range(4)])
    x = mix(1.0 * blast_, 1.8 * body, 1.0 * boom, 0.25 * pellets)
    x = sat(x * 3.0, 2.8)  # hard-driven: chunky, compressed "bwahm"
    x = shelf(hp(x, 60), 5000, -4)
    return room(x, r, 0.08)


def shot_arc(r):
    dur = 0.15
    n = ns(dur)
    f = np.zeros(n)
    i = 0
    while i < n:
        seg = ns(r.uniform(0.006, 0.014))
        f[i:i + seg] = r.uniform(55, 140)
        i += seg
    buzz_ = osc('pulse', f, width=0.12)  # jittery mains-like buzz
    fizz = bp(white(dur, r), 3500, 0.9) * (0.5 + 0.5 * buzz_)
    zap = bp(osc('saw', f * r.uniform(9, 14)), 2200, 1.2)
    sparks = spark_bed(dur, 1600, r, 2500, decay=0.0003)
    gate = lp(np.repeat(r.uniform(0.3, 1.0, n // ns(0.005) + 1), ns(0.005))[:n], 300)
    x = mix(0.3 * buzz_, 1.2 * fizz, 0.5 * zap, 1.0 * sparks) * gate * env(dur, 0.001, curve=3)
    x = crush(sat(x * 2.5, 2.2), 9)
    return room(hp(x, 150), r, 0.05)


def shot_missile(r):
    dur = 0.38
    p = r.uniform(0.94, 1.06)
    thoomp = mix(thump(170 * p, 60 * p, 0.12), 0.3 * bp(white(0.02, r), 1200, 0.7) * env(0.02, 0.0003, curve=5))
    whoosh = bp(pink(dur, r), glide(250 * p, 1800 * p, 0.32, dur), 0.7) * env(dur, 0.04, curve=2.4)
    roar = lp(brown(dur, r), glide(300, 900, 0.3, dur), 0.8) * env(dur, 0.02, curve=2.8)
    x = mix(1.0 * thoomp, 1.6 * whoosh, 0.8 * roar)
    x = sat(x * 1.8, 1.7)
    return room(hp(x, 45), r, 0.06)


def shot_bloom(r):
    dur = 0.24
    p = r.uniform(0.94, 1.06)
    thud = thump(240 * p, 62 * p, dur, drop=0.12, curve=5)
    burst = white(0.04, r) * env(0.04, 0.0005, curve=5)
    tube = comb(bp(burst, 700 * p, 0.8), 270 * p, 0.86)
    tube = bp(fit(tube, ns(dur)), 420 * p, 2.5) * env(dur, 0.001, curve=3.5)
    x = mix(1.0 * thud, 2.2 * tube, 0.4 * click(r, 0.004, 1800, 0.7))
    x = sat(x * 1.8, 1.7)
    return room(hp(x, 45), r, 0.08)


def shot_helix(r):
    dur = 0.16
    p = r.uniform(0.96, 1.04)
    t = tt(dur)
    f = glide(760 * p, 430 * p, 0.14, dur)
    w = np.sin(2 * np.pi * 26 * t)
    a = osc('saw', f * (1 + 0.07 * w))
    b = osc('pulse', f * 1.5 * (1 - 0.07 * w), width=0.3)
    tone = lp(a + 0.7 * b, glide(6000, 1500, 0.14, dur), 2.5)
    zap = bp(white(dur, r), glide(5000, 1500, 0.08, dur), 1.2) * expdec(dur, 0.025)
    x = mix(tone * env(dur, 0.002, curve=3), 0.8 * zap, 0.3 * thump(200 * p, 90, 0.04))
    x = sat(x * 1.8, 1.8)
    return room(hp(x, 150), r, 0.06)


def shot_rail(r):
    dur = 0.45
    p = r.uniform(0.97, 1.03)
    crack = transient(hp(white(0.015, r), 700) * env(0.015, 0.0001, curve=5), 2.0)
    zip_ = osc('sine', glide(5000 * p, 220 * p, 0.07, dur, curve=3.5)) * expdec(dur, 0.03) * 0.3
    f = glide(120 * p, 36 * p, 0.32, dur)
    body = osc('saw', f) + osc('saw', f * 1.008, phase=0.3) + osc('pulse', f * 0.5, width=0.4)
    body = lp(body, glide(3500, 160, 0.34, dur, curve=3), 2.0) * env(dur, 0.002, curve=3)
    sub = thump(90 * p, 32 * p, 0.38, drop=0.14)
    sizzle = spark_bed(dur, 600, r, 2500, density=np.linspace(1, 0, ns(dur))) * env(dur, 0.005, curve=3.5)
    x = mix(1.0 * crack, zip_, sat(body * 2.8, 2.6) * 1.0, 1.3 * sub, 0.3 * sizzle)
    x = sat(x * 1.4, 1.5)
    return room(hp(x, 32), r, 0.12)


def shot_mine(r):
    dur = 0.16
    p = r.uniform(0.94, 1.06)
    metal = partials(265 * p, [1, 1.59, 2.31, 3.7], [1, 0.6, 0.4, 0.2], [0.05, 0.035, 0.025, 0.015], dur, r, 0.01)
    x = mix(metal, 0.9 * thump(160 * p, 70 * p, 0.09), 0.8 * click(r, 0.006, 1700, 1.0), at(0.4 * click(r, 0.004, 3000), 0.03))
    x = sat(x * 2.0, 2.0)
    return room(hp(x, 60), r, 0.08)


def shot_drone(r):
    dur = 0.08
    p = r.uniform(0.94, 1.06)
    f = glide(3000 * p, 800 * p, 0.05, dur, curve=4)
    x = osc('pulse', f, width=0.2) * env(dur, 0.0006, curve=4)
    x = lp(x, glide(8000, 2000, 0.06, dur), 1.5)
    tsk = hp(white(0.03, r), 4000) * env(0.03, 0.0004, curve=5)
    x = mix(0.8 * x, 0.6 * tsk)
    return hp(sat(x * 1.5, 1.5), 500)


# ================================================================== enemy (vocal machine voices)

def enemy_shot(r):
    dur = 0.2
    p = r.uniform(0.92, 1.08)
    f = glide(300 * p, 190 * p, 0.18, dur)
    v = formant(buzz(f, r, width=0.2, breath=0.9, growl=0.8, growl_hz=41), 'e', 'o', 0.15, body=0.35)
    spit = bp(white(0.05, r), glide(3000, 900, 0.04, 0.05), 1.0) * env(0.05, 0.0005, curve=4)
    x = mix(2.0 * v * env(dur, 0.004, curve=3.2), 0.9 * spit, 0.35 * thump(140 * p, 70 * p, 0.06))
    x = sat(x * 2.4, 2.2)
    return room(hp(x, 100), r, 0.07)


def enemy_shot_heavy(r):
    dur = 0.32
    p = r.uniform(0.93, 1.07)
    f = glide(150 * p, 92 * p, 0.28, dur)
    v = formant(buzz(f, r, width=0.1, growl=0.8, growl_hz=29), 'a', 'o', 0.28, body=0.5)
    sub = thump(85 * p, 45 * p, 0.25) * 1.0
    blorp = bp(white(0.06, r), glide(1100, 250, 0.05, 0.06), 1.5) * env(0.06, 0.001, curve=4)
    x = mix(2.2 * v * env(dur, 0.006, curve=2.8), sub, 0.8 * blorp)
    x = sat(x * 3.0, 2.8)
    return room(hp(x, 40), r, 0.09)


def enemy_missile(r):
    dur = 0.4
    p = r.uniform(0.94, 1.06)
    f = glide(220 * p, 440 * p, 0.34, dur)
    v = formant(buzz(f, r, breath=0.3, growl=0.3, growl_hz=24), 'i', 'a', 0.34) * env(dur, 0.03, curve=2.6)
    hiss = bp(pink(dur, r), glide(600 * p, 1700 * p, 0.3, dur), 1.5) * env(dur, 0.05, curve=2.5)
    x = mix(2.0 * v, 0.9 * hiss, 0.4 * click(r, 0.005, 1500))
    x = sat(x * 1.7, 1.7)
    return room(hp(x, 90), r, 0.08)


def enemy_laser_charge(r):
    dur = 0.92
    t = tt(dur)
    rise = (t / dur) ** 1.6
    f = glide(90, 360, 0.9, dur) * (1 + 0.01 * np.sin(2 * np.pi * 9 * t))
    v = formant(buzz(f, r, breath=0.5, growl=0.3, growl_hz=30), 'u', 'i', 0.9, body=0.4)
    swell = bp(pink(dur, r), glide(300, 4000, 0.9, dur), 1.2) * rise
    sparks = spark_bed(dur, 1200, r, 2500, density=rise ** 1.3)
    x = mix(1.0 * v * (0.2 + 0.8 * rise), 1.2 * swell, 0.6 * sparks)
    x *= np.minimum(1, (dur - t) / 0.015)
    x = sat(x * 1.8, 1.8)
    return room(hp(x, 70), r, 0.1)


def enemy_laser_fire(r):
    dur = 0.7
    t = tt(dur)
    vib = 1 + 0.02 * np.sin(2 * np.pi * 11 * t)
    voices = [formant(buzz(glide(220 * d, 180 * d, 0.6, dur) * vib, r, width=0.2, growl=0.35, growl_hz=55), v, None)
              for d, v in [(1, 'a'), (1.007, 'e'), (0.994, 'a')]]
    v = sum(voices) / 2
    blast_ = bp(white(0.1, r), glide(3500, 1200, 0.08, 0.1), 0.8) * env(0.1, 0.0005, curve=4)
    x = mix(2.2 * v * env(dur, 0.01, curve=2.5), 0.9 * blast_, 0.6 * thump(120, 50, 0.2))
    x = sat(x * 2.2, 2.2)
    return room(hp(x, 70), r, 0.14)


# ================================================================== hits

def hit_small(r):
    dur = 0.075
    tick = bp(white(0.03, r), r.uniform(2200, 3400), 0.9) * env(0.03, 0.0003, curve=5)
    crunch = lp(brown(0.05, r), 1800) * env(0.05, 0.0005, curve=5)
    ping = partials(r.uniform(1900, 2600), [1, 1.52, 2.37], [1, 0.5, 0.3], [0.012, 0.008, 0.005], dur, r, 0.02)
    knock = thump(r.uniform(300, 380), 140, 0.04)
    x = mix(1.2 * tick, 0.9 * crunch, 0.18 * ping, 0.5 * knock)
    x = sat(x * 2.0, 2.0)
    return hp(x, 180)


def hit_armor(r):
    dur = 0.26
    p = r.uniform(0.92, 1.08)
    clang = partials(1250 * p, [1, 1.58, 2.76, 3.93, 5.4, 6.8], [1, 0.7, 0.5, 0.35, 0.25, 0.15],
                     [0.12, 0.09, 0.07, 0.05, 0.035, 0.02], dur, r, 0.01)
    x = mix(0.8 * clang, 0.6 * thump(620 * p, 300 * p, 0.025), 0.9 * click(r, 0.004, 5200, 0.7))
    x = sat(x * 1.8, 1.6)
    return room(hp(x, 200), r, 0.06)


# ================================================================== explosions (stereo, except the tiny one)

def expl_small(r):
    x = blast(r, 0.12, pitch=r.uniform(0.9, 1.12), crackle=0.8)
    return reverb(glue(x), r, wet=0.08, size=0.35).mean(axis=0)


def expl_medium(r):
    x = blast(r, 0.42, pitch=r.uniform(0.92, 1.08))
    return reverb(glue(x), r, wet=0.1, size=0.45, bright=0.35)


def expl_large(r):
    p = r.uniform(0.95, 1.05)
    a = blast(r, 0.85, pitch=p)
    b = blast(r, 0.45, pitch=p * 0.85, crackle=1.3) * 0.55
    x = mix(a, at(b, 0.16))
    return reverb(glue(x), r, wet=0.1, size=0.45, bright=0.3)


def expl_huge(r):
    first = blast(r, 1.0, pitch=1.05)
    second = blast(r, 0.8, pitch=0.85) * 0.75
    third = blast(r, 0.9, pitch=0.7, crackle=1.5) * 0.6
    dur = 3.2
    t = tt(dur)
    roar = np.stack([lp(brown(dur, r), glide(300, 1200, 0.8, dur), 1.4) for _ in range(2)])
    roar *= np.clip(t / 0.9, 0, 1) ** 1.5 * np.exp(-np.maximum(0, t - 1.0) / 0.8)
    roar = sat(roar * 2.0, 1.8)
    sub = thump(50, 24, 3.0, drop=1.2, curve=3) * np.minimum(1, t[: ns(3.0)] / 0.2)
    deb = np.stack([bp(dust(2.6, 180, r, decay=0.0009, density=np.linspace(1, 0.1, ns(2.6))), 2200, 0.6) for _ in range(2)])
    x = mix(first, at(second, 0.45), at(third, 1.4), at(0.6 * roar, 0.5), 0.9 * at(sub, 0.1), 0.3 * at(deb, 0.2))
    return reverb(glue(x), r, wet=0.1, size=0.45, bright=0.3)


def chain_reaction(r):
    parts = []
    tpos = 0.0
    for i in range(5):
        b = blast(r, 0.2 + i * 0.1, pitch=1.2 - i * 0.08)
        b = np.stack([b[0] * (1 + 0.4 * (-1) ** i), b[1] * (1 - 0.4 * (-1) ** i)]) * (0.8 + i * 0.05)
        parts.append(at(b, tpos))
        tpos += r.uniform(0.16, 0.24)
    return reverb(glue(mix(*parts)), r, wet=0.1, size=0.45)


def boss_part(r):
    x = mix(blast(r, 0.45, pitch=0.9), 0.22 * stereo(metal_hit(160, 0.4, r)))
    return reverb(glue(x), r, wet=0.1, size=0.45)


def player_death(r):
    dur = 2.0
    a = blast(r, 1.0, pitch=1.0)
    b = blast(r, 0.7, pitch=0.8) * 0.65
    whine = lp(osc('saw', glide(800, 60, 1.4, 1.5)), glide(2500, 200, 1.4, 1.5), 2) * env(1.5, 0.005, curve=2.5)
    voice = formant(buzz(glide(220, 70, 1.5, 1.6), r), 'a', 'u', 1.5) * env(1.6, 0.02, curve=2.5)
    tear = mix(*[at(metal_hit(r.uniform(140, 320), 0.5, r), r.uniform(0.05, 0.5)) for _ in range(3)])
    x = mix(a, at(b, 0.6), stereo(0.35 * whine), stereo(at(0.45 * voice, 0.1)), stereo(0.3 * tear))
    x = fit(x, ns(dur + 0.5))
    return reverb(glue(x), r, wet=0.1, size=0.45)


# ================================================================== shield / hull

def shield_hit(r):
    dur = 0.2
    p = r.uniform(0.95, 1.05)
    t = tt(dur)
    sizzle = bp(white(dur, r), glide(4200 * p, 1600 * p, 0.17, dur), 1.6) * env(dur, 0.001, curve=3)
    hum = osc('pulse', 110 * p, dur, width=0.3) * bp(white(dur, r), 2500, 1.5)
    zwip = lp(osc('saw', 150 * p, dur), glide(700 * p, 2400 * p, 0.12, dur), 6) * env(dur, 0.003, curve=3.5)
    crackle = spark_bed(dur, 1200, r, 2500) * env(dur, 0.001, curve=3.5)
    x = mix(1.6 * sizzle, 0.5 * hum * env(dur, 0.002, curve=4), 0.25 * zwip, 0.7 * crackle)
    x *= 1 + 0.4 * np.sin(2 * np.pi * 60 * t)
    x = sat(x * 2.0, 1.8)
    return room(hp(x, 300), r, 0.08)


def hull_hit(r):
    dur = 0.42
    p = r.uniform(0.95, 1.05)
    metal = partials(92 * p, [1, 1.47, 2.09, 2.9, 3.8, 5.1], [1, 0.8, 0.6, 0.45, 0.3, 0.2],
                     [0.2, 0.15, 0.12, 0.08, 0.05, 0.03], dur, r, 0.02)
    thud = thump(115 * p, 42 * p, 0.32, drop=0.1)
    crunch = lp(brown(0.15, r), 1100) * env(0.15, 0.001, curve=4)
    rattle = bp(dust(0.25, 400, r, decay=0.0008), 1500, 0.8) * env(0.25, 0.005, curve=3)
    x = mix(0.7 * metal, 1.0 * thud, sat(crunch * 3, 3) * 0.8, at(0.4 * rattle, 0.03), 0.7 * click(r, 0.006, 1800))
    x = sat(x * 1.6, 1.8)
    return room(hp(x, 38), r, 0.1)


def shield_down(r):
    dur = 1.0
    stabs = []
    for tpos, f in [(0, 659), (0.14, 523), (0.28, 392)]:
        d = 0.13 if tpos < 0.2 else 0.3
        s = (0.6 * osc('pulse', f, d, width=0.3) + 0.4 * osc('saw', f * 1.004, d))
        s = lp(s, 2600, 1.2) * env(d, 0.004, curve=3 if d < 0.2 else 2.2)
        stabs.append(at(s, tpos))
    sweep = lp(osc('saw', glide(800, 150, 0.55, 0.6)), glide(1800, 250, 0.55, 0.6), 3) * env(0.6, 0.01, curve=2.5)
    fizz = bp(white(0.6, r), glide(3000, 600, 0.55, 0.6), 2) * env(0.6, 0.01, curve=3)
    crack = spark_bed(0.6, 500, r, 2000, density=np.linspace(1, 0, ns(0.6)))
    x = mix(*stabs, at(0.7 * sweep, 0.28), at(0.4 * fizz, 0.28), at(0.35 * crack, 0.3))
    x = sat(x * 1.5, 1.5)
    return reverb(fit(x, ns(dur)), r, wet=0.1, size=0.45).mean(axis=0)


def shield_restored(r):
    notes = [(0, 72), (0.07, 76), (0.14, 79), (0.21, 84)]
    bells = [at(pan(bell(mtof(m), 0.6 if i < 3 else 0.9, ratio=3.5, index=1.8), (-0.4 + 0.27 * i)), tp)
             for i, (tp, m) in enumerate(notes)]
    rise = bp(pink(0.5, r), glide(800, 6000, 0.45, 0.5), 2.5) * env(0.5, 0.2, curve=4)
    sparkle = spark_bed(0.6, 250, r, 5000, decay=0.0003) * env(0.6, 0.1, curve=3)
    x = mix(*bells, widen(0.35 * rise, r), widen(0.3 * sparkle, r))
    return reverb(x, r, wet=0.1, size=0.45, bright=0.6)


def low_hull(r):
    parts = []
    for tpos, f, d in [(0, 520, 0.14), (0.16, 440, 0.17)]:
        s = 0.6 * osc('pulse', f, d, width=0.18) + 0.4 * osc('saw', f * 1.012, d)
        s = bp(s, 1400, 0.7) * env(d, 0.004, curve=1.8, hold=d * 0.45)
        parts.append(at(s, tpos))
    x = sat(mix(*parts) * 2.6, 2.4)
    return room(hp(x, 250), r, 0.1)


# ================================================================== pickups

def _coin(r, f, dur, ratio):
    b = bell(f, dur, ratio=ratio, index=2.0 * r.uniform(0.85, 1.15), tau=dur / 3)
    b += 0.5 * bell(f * 1.004, dur, ratio=ratio, index=1.2, tau=dur / 3.5)
    return b


def pickup_credit(r):
    ratio = r.choice([3.5, 3.0, 4.0])
    a = _coin(r, 988, 0.07, ratio)
    b = _coin(r, 1319, 0.17, ratio)
    x = mix(0.8 * a, at(b, 0.045), 0.35 * click(r, 0.003, 7000, 0.7))
    x = sat(x * 1.2, 1.2)
    return room(hp(x, 500), r, 0.08)


def pickup_big(r):
    fs = [1047, 1319, 1568, 2093]
    notes = [at(mix(_coin(r, f, 0.16 if i < 3 else 0.35, 3.5), 0.4 * osc('tri', f / 2, 0.14) * expdec(0.14, 0.05)), i * 0.05)
             for i, f in enumerate(fs)]
    sparkle = spark_bed(0.4, 300, r, 6000, decay=0.0003) * env(0.4, 0.05, curve=3)
    x = mix(*notes, at(0.35 * sparkle, 0.05))
    return room(hp(sat(x, 1.2), 300), r, 0.12)


def pickup_repair(r):
    dur = 0.52
    t = tt(dur)
    f1 = glide(300, 620, 0.4, dur) * (1 + 0.01 * np.sin(2 * np.pi * 12 * t))
    a = fm(f1, 2.0, 0.8, dur) * env(dur, 0.05, curve=3)
    b = at(fm(glide(450, 930, 0.35, dur - 0.08), 1.0, 0.6) * env(dur - 0.08, 0.05, curve=3), 0.08)
    swoosh = bp(pink(dur, r), glide(500, 4500, 0.45, dur), 2) * env(dur, 0.15, curve=3)
    sparkle = spark_bed(dur, 220, r, 5000, decay=0.0003) * env(dur, 0.2, curve=3)
    x = mix(a, 0.6 * b, 0.35 * swoosh, 0.3 * sparkle)
    return room(hp(sat(x * 1.2, 1.2), 150), r, 0.14)


def pickup_special(r):
    notes = [at(pan(bell(mtof(76 + s), 0.3, ratio=2.0, index=1.5, tau=0.1), -0.5 + 0.2 * i), i * 0.045)
             for i, s in enumerate([0, 2, 4, 6, 8, 10])]
    shim = bp(pink(0.5, r), glide(1500, 7000, 0.4, 0.5), 3) * env(0.5, 0.1, curve=3)
    x = mix(*notes, widen(0.3 * shim, r))
    return reverb(x, r, wet=0.1, size=0.45, bright=0.6)


def pickup_core(r):
    dur = 1.3
    chord = []
    for i, m in enumerate([57, 60, 64, 68]):
        f = np.full(ns(dur), mtof(m)) * (1 + 0.004 * np.sin(2 * np.pi * (4.5 + i * 0.4) * tt(dur)))
        v = formant(buzz(f, r, width=0.3, breath=0.1), 'u', 'a', 1.0) * env(dur, 0.25, curve=2.5)
        chord.append(pan(v, -0.6 + 0.4 * i))
    b1 = at(stereo(bell(mtof(83), 1.0, ratio=3.5, index=1.5)), 0.15)
    b2 = at(stereo(bell(mtof(80), 0.8, ratio=3.5, index=1.5)), 0.4)
    x = mix(*[0.9 * c for c in chord], 0.5 * b1, 0.45 * b2)
    return reverb(x, r, wet=0.1, size=0.45, bright=0.5)


# ================================================================== specials

def special_ready(r):
    x = mix(pan(bell(784, 0.5, ratio=3.5, index=2.0), -0.25), at(pan(bell(1175, 0.8, ratio=3.5, index=2.2), 0.25), 0.1),
            at(widen(0.2 * spark_bed(0.5, 200, r, 6000, decay=0.0003) * env(0.5, 0.05, curve=3), r), 0.08))
    return reverb(x, r, wet=0.1, size=0.45, bright=0.6)


def special_nova(r):
    dur = 1.1
    sub = thump(72, 28, 0.95, drop=0.5, curve=3)
    body = np.stack([lp(brown(dur, r), glide(250, 2600, 0.15, dur, curve='exp'), 2) for _ in range(2)])
    body *= env(dur, 0.06, curve=3)
    wave = np.stack([bp(pink(0.9, r), glide(2600, 300, 0.8, 0.9), 1.0) * env(0.9, 0.01, curve=3) for _ in range(2)])
    crack = hp(white(0.02, r), 800) * env(0.02, 0.0002, curve=6)
    x = mix(1.2 * sub, sat(body * 2, 2) * 0.9, at(0.5 * wave, 0.08), crack)
    return reverb(glue(x), r, wet=0.1, size=0.45)


def special_overclock(r):
    dur = 1.0
    f = glide(55, 240, 0.95, dur, curve='lin')
    L = lp(osc('saw', f) + osc('saw', f * 1.027, phase=0.4), glide(300, 2400, 0.95, dur, curve='lin'), 4)
    R = lp(osc('saw', f * 1.013, phase=0.2) + osc('saw', f * 0.985, phase=0.7), glide(280, 2200, 0.95, dur, curve='lin'), 3.5)
    engine = np.stack([L, R]) * env(dur, 0.05, curve=1.5, hold=0.6)
    sub = osc('sine', glide(40, 80, 0.95, dur)) * env(dur, 0.05, curve=1.5, hold=0.6)
    whine = osc('sine', glide(800, 3400, 0.95, dur)) * env(dur, 0.2, curve=1.5, hold=0.5) * 0.12
    ratchet = bp(dust(dur, 60, r, decay=0.001, density=np.linspace(0.3, 3, ns(dur))), 2500, 1) * 0.6
    x = mix(sat(engine * 1.8, 1.8) * 0.6, 0.8 * sub, whine, ratchet)
    return reverb(x, r, wet=0.1, size=0.45)


def special_phase(r):
    dur = 0.85
    t = tt(dur)
    tones = []
    for i, ratio in enumerate([1, 1.26, 1.5, 1.89, 2.52]):
        f = glide(400 * ratio, 1500 * ratio, 0.75, dur) * (1 + 0.012 * np.sin(2 * np.pi * (9 + 2 * i) * t))
        tones.append(at(pan(osc('sine', f) * env(dur, 0.1, curve=3), -0.8 + 0.4 * i), i * 0.03))
    air = np.stack([bp(white(dur, r), glide(1500, 6500, 0.7, dur), 4) for _ in range(2)]) * env(dur, 0.2, curve=3)
    x = mix(*tones, 0.5 * air)
    # flanger: blend with a copy through a sweeping short delay
    d = (0.002 + 0.0015 * np.sin(2 * np.pi * 1.3 * np.arange(x.shape[-1]) / SR)) * SR
    idx = np.clip(np.arange(x.shape[-1]) - d, 0, x.shape[-1] - 1)
    x = x + 0.7 * np.stack([np.interp(idx, np.arange(x.shape[-1]), c) for c in x])
    return reverb(x, r, wet=0.1, size=0.45, bright=0.7)


def special_singularity(r):
    dur = 1.05
    t = tt(dur)
    swell = np.stack([bp(pink(dur, r), glide(3000, 150, 1.0, dur), 2.2) for _ in range(2)]) * (t / dur) ** 2.2
    tone = osc('tri', glide(220, 40, 1.0, dur)) * (t / dur) ** 2
    suck = hp(white(dur, r), glide(6000, 900, 1.0, dur)) * (t / dur) ** 4 * 0.4
    swell_all = mix(swell, 0.7 * tone, suck) * np.minimum(1, (dur - t) / 0.01)
    impact = mix(thump(95, 30, 0.45, drop=0.2), sat(lp(brown(0.35, r), 700) * env(0.35, 0.001, curve=3.5) * 2, 2),
                 hp(white(0.02, r), 900) * env(0.02, 0.0002, curve=6))
    x = mix(swell_all, at(stereo(impact) * 1.3, 1.0))
    return reverb(glue(x), r, wet=0.1, size=0.45)


def special_swarm(r):
    parts = []
    for i in range(8):
        tp = i * 0.055 + r.uniform(0, 0.02)
        w = bp(pink(0.24, r), glide(r.uniform(450, 750), r.uniform(2000, 3200), 0.2, 0.24), 1.6) * env(0.24, 0.02, curve=3)
        pop = mix(0.6 * thump(r.uniform(200, 260), 90, 0.05), 0.4 * click(r, 0.004, 3000))
        chirp = osc('pulse', glide(1600, 700, 0.04, 0.05), width=0.25) * env(0.05, 0.001, curve=4) * 0.15
        parts.append(at(pan(mix(1.2 * w, pop, chirp), 0.7 * (-1) ** i * r.uniform(0.5, 1)), tp))
    x = sat(mix(*parts) * 1.4, 1.4)
    return reverb(x, r, wet=0.1, size=0.45)


# ================================================================== misc gameplay

def energy_empty(r):
    dur = 0.14
    trig = bp(white(0.01, r), 2400, 1.0) * env(0.01, 0.0002, curve=6)
    hammer = bp(white(0.015, r), 900, 1.2) * env(0.015, 0.0002, curve=5)
    dzz = lp(osc('pulse', 70, 0.09, width=0.3) * bp(white(0.09, r), 800, 1.0), 1500) * env(0.09, 0.003, curve=3)
    x = mix(0.9 * trig, at(1.0 * hammer, 0.035), at(0.8 * dzz, 0.04))
    return hp(sat(x * 2, 1.8), 90)


def boss_warning(r):
    parts = []
    chord = [110, 116.5, 164.8]  # A2 + Bb2 + E3: a rubbing, ugly horn
    for i in range(3):
        tp = i * 0.62
        d = 0.5
        bend = glide(0.94, 1.0, 0.06, d)
        horn = sum(osc('saw', f * bend, phase=r.random()) + 0.6 * osc('pulse', f * 1.003 * bend, width=0.35) for f in chord)
        horn = lp(horn, glide(900, 2600, 0.08, d), 1.8) * env(d, 0.02, curve=1.2, hold=0.32)
        voc = formant(buzz(110 * bend, r, width=0.12, growl=0.5, growl_hz=33), 'a', 'o', d) * env(d, 0.02, curve=1.2, hold=0.32)
        hit = fit(thump(80, 40, 0.3), ns(d))
        parts.append(at(pan(sat(horn * 0.8 + voc * 1.5, 2.8) + 0.8 * hit, 0.25 * (-1) ** i), tp))
    drone = lp(osc('saw', 55, 2.0) + osc('saw', 58.3, 2.0, phase=0.3), 380, 1.5) * env(2.0, 0.2, curve=2, hold=1.2)
    x = mix(*parts, stereo(0.6 * sat(drone * 2, 2)))
    return reverb(x, r, wet=0.1, size=0.45)


def boss_phase(r):
    clanks = [at(stereo(mix(0.6 * metal_hit(f, 0.22, r), 1.2 * thump(f * 0.8, f * 0.4, 0.2),
                            lp(brown(0.12, r), 1200) * env(0.12, 0.001, curve=4))), tp)
              for tp, f in [(0, 120), (0.16, 100), (0.38, 85)]]
    servo = lp(osc('saw', glide(120, 420, 0.6, 0.65)), glide(400, 1400, 0.6, 0.65), 4) * env(0.65, 0.1, curve=2)
    x = mix(*[0.7 * c for c in clanks], at(widen(0.35 * servo, r), 0.1), at(1.0 * blast(r, 0.5, pitch=0.75), 0.4))
    return reverb(glue(x), r, wet=0.1, size=0.45)


def secret(r):
    steps = [0, 4, 6, 11, 14, 18, 16, 23]
    notes = [at(pan(bell(mtof(72 + s), 0.35, ratio=1.5 if i % 2 else 3.0, index=1.4, tau=0.1), -0.6 + 0.17 * i), i * 0.075)
             for i, s in enumerate(steps)]
    t = tt(0.45)
    f = glide(mtof(79), mtof(91), 0.4, 0.45) * (1 + 0.02 * np.sin(2 * np.pi * 8 * t))
    voc = formant(buzz(f, r, width=0.3, breath=0.1), 'i', 'u', 0.4) * env(0.45, 0.03, curve=2.5)
    x = mix(*notes, at(stereo(0.7 * voc), 0.62))
    return reverb(x, r, wet=0.1, size=0.45, bright=0.6)


def radio(r):
    dur = 0.22
    sq = crush(bp(white(0.17, r), 2000, 1.5), 7, 3) * env(0.17, 0.002, curve=2, hold=0.05)
    chirps = mix(at(osc('pulse', 1100, 0.06, width=0.3) * env(0.06, 0.002, curve=1.5, hold=0.03), 0.02),
                 at(osc('pulse', 1400, 0.06, width=0.3) * env(0.06, 0.002, curve=1.5, hold=0.03), 0.1))
    x = mix(0.8 * sq, 0.5 * chirps)
    x = bp(sat(x * 2, 2), 1500, 0.5)
    return fit(hp(x, 300), ns(dur))


def shield_gen_down(r):
    dur = 1.45
    whine = lp(osc('saw', glide(900, 60, 1.2, 1.2)), glide(4000, 200, 1.2, 1.2), 2) * env(1.2, 0.005, curve=2)
    tone = osc('sine', glide(1800, 120, 1.1, 1.1)) * env(1.1, 0.005, curve=2) * 0.5
    burst = bp(white(0.25, r), 3000, 3) * env(0.25, 0.001, curve=3)
    zap = np.stack([spark_bed(1.1, 600, r, 2000, density=np.linspace(1, 0, ns(1.1))) for _ in range(2)])
    thud = thump(110, 45, 0.3)
    x = mix(stereo(0.6 * whine), stereo(tone), stereo(0.5 * burst), 0.35 * zap, at(stereo(thud), 1.15))
    x = sat(x * 1.4, 1.5)
    return reverb(fit(x, ns(dur)), r, wet=0.1, size=0.45)


# ================================================================== UI (gentle, tactile, mono)

def ui_move(r):
    tick = click(r, 0.003, 2600, 1.0)
    body = partials(1750, [1, 2.7], [1, 0.3], [0.012, 0.006], 0.04)
    x = mix(0.8 * tick, 0.35 * body, 0.25 * thump(320, 200, 0.02))
    return hp(x, 300)


def _blip(f, dur, bright=1.0):
    return fm(f, 2.0, 0.9 * bright * expdec(dur, dur / 3) + 0.1, dur) * env(dur, 0.002, curve=4)


def ui_select(r):
    x = mix(0.5 * click(r, 0.003, 3000), at(0.8 * _blip(659, 0.07), 0.004), at(_blip(988, 0.11), 0.055))
    return room(hp(x, 300), r, 0.08)


def ui_back(r):
    x = mix(0.5 * click(r, 0.003, 2200), at(0.9 * _blip(988, 0.07, 0.6), 0.004), at(0.9 * _blip(659, 0.11, 0.6), 0.055))
    return room(lp(hp(x, 250), 4500), r, 0.08)


def ui_buy(r):
    cha = bp(white(0.05, r), 4000, 1.2) * env(0.05, 0.001, curve=4)
    coins = [at(bell(mtof(m), 0.45 if i == 3 else 0.15, ratio=3.5, index=1.6), 0.03 + i * 0.05) for i, m in enumerate([79, 84, 88, 91])]
    x = mix(0.6 * cha, *[0.7 * c for c in coins], 0.3 * thump(300, 150, 0.04))
    return room(hp(x, 200), r, 0.12)


def ui_sell(r):
    coins = [at(bell(mtof(m), 0.12, ratio=3.0, index=1.2), i * 0.06) for i, m in enumerate([88, 84, 86, 81])]
    x = mix(*coins, 0.4 * click(r, 0.003, 4000))
    return room(hp(x, 300), r, 0.1)


def ui_deny(r):
    parts = []
    for tp in (0, 0.11):
        b = osc('pulse', 110, 0.09, width=0.35) + 0.8 * osc('saw', 116.5, 0.09)
        parts.append(at(lp(b, 900, 1.2) * env(0.09, 0.004, curve=2, hold=0.04), tp))
    x = mix(*parts, 0.4 * click(r, 0.004, 1500))
    return hp(sat(x * 2.2, 2.0), 80)


def ui_upgrade(r):
    notes = [at(mix(_blip(mtof(m), 0.12), 0.3 * osc('pulse', mtof(m), 0.1, width=0.25) * env(0.1, 0.002, curve=4)), i * 0.05)
             for i, m in enumerate([60, 64, 67, 72, 76])]
    sweep = lp(osc('saw', glide(200, 900, 0.35, 0.35)), 2000) * env(0.35, 0.02, curve=3) * 0.4
    fin = at(bell(mtof(84), 0.45, ratio=3.5, index=1.6), 0.25)
    x = mix(*[0.6 * n for n in notes], sweep, 0.8 * fin)
    return reverb(hp(x, 150), r, wet=0.1, size=0.45, bright=0.6)


# ================================================================== stingers

def mission_complete(r):
    lead = [(0, 67, 0.12), (0.13, 72, 0.12), (0.26, 76, 0.12), (0.39, 79, 0.3), (0.8, 80, 0.35), (1.2, 82, 0.35), (1.6, 84, 1.3)]
    parts = [at(stereo(0.9 * brass(mtof(m), d, r, bright=1.2)), tp) for tp, m, d in lead]
    for tp, chord, d in [(0.8, [56, 60, 63, 68], 0.38), (1.2, [58, 62, 65, 70], 0.38), (1.6, [60, 64, 67, 72], 1.3)]:
        for i, m in enumerate(chord):
            parts.append(at(pan(0.3 * brass(mtof(m), d, r, bright=0.6, n=2), -0.6 + 0.4 * i), tp))
    for tp, m in [(0.8, 44), (1.2, 46), (1.6, 48)]:
        parts.append(at(stereo(0.6 * lp(osc('saw', mtof(m), 0.45), 450) * env(0.45, 0.005, curve=2.5, hold=0.2)), tp))
        timp = mix(thump(140, 70, 0.6, drop=0.1), 0.3 * lp(brown(0.3, r), 800) * env(0.3, 0.001, curve=4))
        parts.append(at(stereo(0.9 * fit(timp, ns(0.6))), tp))
    parts.append(at(pan(0.25 * bell(mtof(96), 1.4, ratio=3.5, index=1.0), 0.3), 1.6))
    x = comp(mix(*parts), -12, 2.5, 0.01, 0.2)
    return reverb(x, r, wet=0.1, size=0.45, bright=0.5)


def game_over(r):
    parts = []
    for tp, chord, d in [(0, [48, 51, 55], 1.0), (1.0, [46, 50, 53], 1.0), (2.0, [44, 48, 51], 1.6)]:
        for i, m in enumerate(chord):
            v = lp(osc('saw', mtof(m), d + 1) + osc('saw', mtof(m) * 1.005, d + 1, phase=0.5), 700) * env(d + 1, 0.25, curve=2.2, hold=d * 0.5)
            parts.append(at(pan(0.22 * v, -0.5 + 0.5 * i), tp))
    for tp, m, d in [(0, 67, 0.9), (1.0, 65, 0.9), (2.0, 63, 0.6), (2.6, 60, 1.2)]:
        parts.append(at(stereo(0.45 * brass(mtof(m - 12), d, r, bright=0.25)), tp))
    boom = thump(70, 30, 1.6, drop=0.6) * 0.8
    parts.append(at(stereo(boom), 2.0))
    x = comp(mix(*parts), -12, 2)
    return reverb(x, r, wet=0.1, size=0.45, bright=0.35)


# ================================================================== loops

def loop_beam(r):
    """Dense energy beam. Tones are periodic in the 2 s loop; noise layers are crossfaded."""
    L, X, warm = 2.0, 0.08, 0.2
    total = warm + X + L
    t = tt(total)
    tone = osc('saw', 110, total) + osc('saw', 110.5, total, phase=0.3) + 0.35 * osc('sine', 220, total) + 0.9 * osc('sine', 55, total)
    tone = lp(tone, 1100 + 350 * np.sin(2 * np.pi * 2.5 * t), 3)
    trem = 1 - 0.18 * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t))
    sizzle = bp(white(total, r), 3500, 2) * (0.5 + 0.5 * np.sin(2 * np.pi * 11 * t + 1))
    sparks = spark_bed(total, 350, r, 3000)
    x = mix(sat(tone * trem * 0.7, 1.8), 0.25 * sizzle, 0.25 * sparks)
    return _loop(x, warm, X, L)


def loop_charge(r):
    """1.3 s rising charge, then a 1 s sustain that loops."""
    rise, L, X = 1.3, 1.0, 0.1
    total = rise + L + 0.05
    t = tt(total)
    f = glide(200, 820, rise, total)
    vib = 2 ** (18 / 1200 * np.sin(2 * np.pi * 9 * t))
    x = osc('saw', f * vib) + 0.6 * osc('sine', 2 * f * vib)
    x = lp(x, 2400, 1.2)
    swell = bp(pink(total, r), glide(500, 3500, rise, total), 3) * np.clip(t / rise, 0, 1)
    sparks = spark_bed(total, 500, r, 4000, density=np.clip(t / rise, 0.1, 1))
    x = mix(0.6 * x, 0.35 * swell, 0.3 * sparks) * np.minimum(1, t / 0.03)
    return _loop(x, rise, X, L)


def loop_alarm(r):
    """Two-tone klaxon, 1.25 s period (1.6 Hz step, tremolo in phase)."""
    L, X = 1.25, 0.06
    total = X + L + 0.05
    t = tt(total)
    step = np.where((t % 0.625) < 0.3125, 475.0, 365.0)
    step = lp(step, 60)
    s = 0.6 * osc('pulse', step, width=0.35) + 0.4 * osc('tri', step)
    s = bp(s, 1200, 0.9)
    trem = 0.55 + 0.45 * np.sin(2 * np.pi * 3.2 * t) ** 2
    x = sat(s * trem * 1.8, 1.8)
    return _loop(x, X, X, L)


def _loop(x, start, xfade, length):
    """Fold the samples just before the loop start into the loop end, so jumping end -> start is seamless."""
    s, X, e = ns(start), ns(xfade), ns(start + length)
    x = np.array(x[..., :e])
    th = np.linspace(0, np.pi / 2, X)
    x[..., e - X:e] = x[..., e - X:e] * np.cos(th) + x[..., s - X:s] * np.sin(th)
    return x, start, start + length


# ================================================================== catalogue

# name: (recipe, variants, mono). Stereo only where width is the point (explosions, spatial specials);
# everything else is mono and gets its space from the engine's stereo reverb send.
SFX = {
    'shot_pulse': (shot_pulse, 4, True), 'shot_scatter': (shot_scatter, 4, True), 'shot_arc': (shot_arc, 4, True),
    'shot_missile': (shot_missile, 3, True), 'shot_bloom': (shot_bloom, 3, True), 'shot_helix': (shot_helix, 3, True),
    'shot_rail': (shot_rail, 3, True), 'shot_mine': (shot_mine, 3, True), 'shot_drone': (shot_drone, 3, True),
    'enemy_shot': (enemy_shot, 4, True), 'enemy_shot_heavy': (enemy_shot_heavy, 3, True), 'enemy_missile': (enemy_missile, 2, True),
    'enemy_laser_charge': (enemy_laser_charge, 1, True), 'enemy_laser_fire': (enemy_laser_fire, 1, True),
    'hit_small': (hit_small, 4, True), 'hit_armor': (hit_armor, 4, True),
    'expl_small': (expl_small, 4, True), 'expl_medium': (expl_medium, 3, False), 'expl_large': (expl_large, 2, False),
    'expl_huge': (expl_huge, 1, False),
    'shield_hit': (shield_hit, 3, True), 'hull_hit': (hull_hit, 2, True), 'shield_down': (shield_down, 1, True),
    'shield_restored': (shield_restored, 1, True), 'low_hull': (low_hull, 1, True),
    'pickup_credit': (pickup_credit, 3, True), 'pickup_big': (pickup_big, 2, True), 'pickup_repair': (pickup_repair, 1, True),
    'pickup_special': (pickup_special, 1, True), 'pickup_core': (pickup_core, 1, True),
    'special_ready': (special_ready, 1, True), 'special_nova': (special_nova, 1, False),
    'special_overclock': (special_overclock, 1, True), 'special_phase': (special_phase, 1, False),
    'special_singularity': (special_singularity, 1, False), 'special_swarm': (special_swarm, 1, False),
    'energy_empty': (energy_empty, 1, True), 'boss_warning': (boss_warning, 1, True), 'boss_phase': (boss_phase, 1, True),
    'boss_part': (boss_part, 2, False), 'secret': (secret, 1, True),
    'ui_move': (ui_move, 1, True), 'ui_select': (ui_select, 1, True), 'ui_back': (ui_back, 1, True),
    'ui_buy': (ui_buy, 1, True), 'ui_sell': (ui_sell, 1, True), 'ui_deny': (ui_deny, 1, True), 'ui_upgrade': (ui_upgrade, 1, True),
    'mission_complete': (mission_complete, 1, True), 'game_over': (game_over, 1, True), 'radio': (radio, 1, True),
    'player_death': (player_death, 1, False), 'chain_reaction': (chain_reaction, 1, False),
    'shield_gen_down': (shield_gen_down, 1, True),
}

LOOPS = {'beam': (loop_beam, True), 'charge': (loop_charge, True), 'alarm': (loop_alarm, True)}


def seed(name, v):
    return int.from_bytes(name.encode(), 'little') % (2 ** 31) + 7919 * v


def write_wav(path, x):
    """16-bit PCM with TPDF dither."""
    import soundfile as sf
    rng = np.random.default_rng(1)
    data = x.T if x.ndim == 2 else x
    d = data * 32767 + rng.uniform(-0.5, 0.5, data.shape) + rng.uniform(-0.5, 0.5, data.shape)
    sf.write(path, np.clip(np.round(d), -32768, 32767).astype(np.int16), SR, subtype='PCM_16')


def main(only):
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    old = json.load(open(mpath)) if os.path.exists(mpath) else {'sfx': {}, 'loops': {}}
    man = {'sfx': dict(old.get('sfx', {})), 'loops': dict(old.get('loops', {}))}

    for name, (fn, count, mono) in SFX.items():
        if only and name not in only:
            continue
        files = []
        xs = [finalize(fn(np.random.default_rng(seed(name, v))), mono) for v in range(count)]
        quietest = min(loudness(x) for x in xs)  # variants must not jump in level
        for v, x in enumerate(xs):
            x = x * 10 ** ((quietest - loudness(x)) / 20)
            fname = f'{name}_v{v + 1}.wav' if count > 1 else f'{name}.wav'
            for stale in (f'{name}.wav',) if count > 1 else ():
                if os.path.exists(os.path.join(OUT, stale)):
                    os.remove(os.path.join(OUT, stale))
            write_wav(os.path.join(OUT, fname), x)
            files.append(fname)
            print(f'{fname:28} {x.shape[-1] / SR:5.2f}s {"mono" if x.ndim == 1 else "stereo"}')
        man['sfx'][name] = {'files': files, 'gain': old.get('sfx', {}).get(name, {}).get('gain', 1.0)}

    for name, (fn, mono) in LOOPS.items():
        if only and name not in only:
            continue
        x, ls, le = fn(np.random.default_rng(seed(name, 0)))
        x = finalize(x, mono, loop=True)
        fname = f'loop_{name}.wav'
        write_wav(os.path.join(OUT, fname), x)
        print(f'{fname:28} {x.shape[-1] / SR:5.2f}s loop {ls:.3f}-{le:.3f}')
        man['loops'][name] = {'file': fname, 'loopStart': round(ls, 5), 'loopEnd': round(le, 5),
                              'gain': old.get('loops', {}).get(name, {}).get('gain', 1.0)}

    man['sfx'] = {k: man['sfx'][k] for k in SFX if k in man['sfx']}
    json.dump(man, open(mpath, 'w'), indent=1)
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT))
    print(f'total {total / 1e6:.2f} MB in {OUT}')


if __name__ == '__main__':
    main(set(sys.argv[1:]))
