"""Small offline DSP kit for designing EMBERLINE's sound effects (used by tools/generate-sfx.py).

Signals are float64 numpy arrays at SR: mono = shape (n,), stereo = shape (2, n).
Everything that needs per-sample state (time-varying filters, oscillators, compressor) is numba-jitted.
"""
import numpy as np
from numba import njit
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

SR = 44100


def ns(sec):
    return max(1, int(round(sec * SR)))


def tt(sec):
    return np.arange(ns(sec)) / SR


# ------------------------------------------------------------------ envelopes / curves

def glide(f0, f1, dur, total=None, curve='exp'):
    """Frequency (or any positive value) moving f0 -> f1 over `dur` s, then holding, for `total` s."""
    n = ns(total if total is not None else dur)
    k = min(n, ns(dur))
    out = np.full(n, float(f1))
    x = np.linspace(0, 1, k, endpoint=False)
    if curve == 'exp':
        out[:k] = f0 * (f1 / f0) ** x
    elif curve == 'lin':
        out[:k] = f0 + (f1 - f0) * x
    else:  # fast start, slow end ("pitch drop" of a drum)
        out[:k] = f1 + (f0 - f1) * np.exp(-x * float(curve))
    return out


def env(dur, a=0.001, d=None, curve=4.0, hold=0.0):
    """Attack (raised cosine) / hold / exponential-ish decay to exactly 0 at `dur`."""
    n = ns(dur)
    e = np.zeros(n)
    na, nh = min(n, ns(a)), ns(hold)
    e[:na] = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, na))
    e[na:na + nh] = 1
    nd = n - na - nh
    if nd > 0:
        x = np.linspace(0, 1, nd)
        e[na + nh:] = (np.exp(-curve * x) - np.exp(-curve)) / (1 - np.exp(-curve))
    return e


def expdec(dur, tau, a=0.0005):
    t = tt(dur)
    e = np.exp(-t / tau)
    na = ns(a)
    e[:na] *= np.linspace(0, 1, na)
    fade = min(len(e), ns(0.004))
    e[-fade:] *= np.linspace(1, 0, fade)
    return e


def fit(x, n):
    """Pad with zeros or cut a curve/signal to n samples (last axis)."""
    m = x.shape[-1]
    if m >= n:
        return x[..., :n]
    pad = [(0, 0)] * (x.ndim - 1) + [(0, n - m)]
    return np.pad(x, pad)


def hold_to(curve, n):
    if len(curve) >= n:
        return curve[:n]
    return np.concatenate([curve, np.full(n - len(curve), curve[-1])])


# ------------------------------------------------------------------ oscillators

@njit(cache=True)
def _blep(t, dt):
    if t < dt:
        t /= dt
        return t + t - t * t - 1.0
    if t > 1.0 - dt:
        t = (t - 1.0) / dt
        return t * t + t + t + 1.0
    return 0.0


@njit(cache=True)
def _osc(freq, kind, width, phase0):
    n = len(freq)
    y = np.empty(n)
    ph = phase0
    tri = 0.0
    for i in range(n):
        dt = freq[i] / 44100.0
        if dt > 0.49:
            dt = 0.49
        if kind == 0:  # sine
            y[i] = np.sin(2 * np.pi * ph)
        elif kind == 1:  # saw
            y[i] = 2.0 * ph - 1.0 - _blep(ph, dt)
        else:  # pulse (2) / triangle (3, integrated square)
            v = 1.0 if ph < width else -1.0
            v += _blep(ph, dt)
            p2 = ph - width
            if p2 < 0:
                p2 += 1.0
            v -= _blep(p2, dt)
            if kind == 2:
                y[i] = v
            else:
                tri = tri * 0.9995 + v * 4.0 * dt
                y[i] = tri
        ph += dt
        if ph >= 1.0:
            ph -= 1.0
    return y


KINDS = {'sine': 0, 'saw': 1, 'square': 2, 'pulse': 2, 'tri': 3}


def osc(kind, freq, dur=None, width=0.5, phase=0.0):
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        f = np.full(ns(dur), float(f))
    elif dur is not None:
        f = hold_to(f, ns(dur))
    return _osc(f, KINDS[kind], width, phase)


def fm(freq, ratio, index, dur=None, fb=0.0):
    """2-op FM: sine carrier at freq, modulator at freq*ratio, index (scalar or curve) in radians."""
    f = np.asarray(freq, dtype=np.float64)
    if f.ndim == 0:
        f = np.full(ns(dur), float(f))
    elif dur is not None:
        f = hold_to(f, ns(dur))
    n = len(f)
    idx = np.asarray(index, dtype=np.float64)
    if idx.ndim:
        idx = hold_to(idx, n)
    pm = np.cumsum(2 * np.pi * f * ratio / SR)
    pc = np.cumsum(2 * np.pi * f / SR)
    m = np.sin(pm)
    if fb:
        m = np.sin(pm + fb * m)
    return np.sin(pc + idx * m)


def partials(f0, ratios, amps, taus, dur, rng=None, detune=0.0):
    """Modal/additive synthesis: inharmonic partials each with its own exponential decay."""
    t = tt(dur)
    out = np.zeros_like(t)
    for r, a, tau in zip(ratios, amps, taus):
        dv = 1 + (rng.uniform(-detune, detune) if rng is not None and detune else 0)
        ph = rng.uniform(0, 2 * np.pi) if rng is not None else 0
        out += a * np.sin(2 * np.pi * f0 * r * dv * t + ph) * np.exp(-t / tau)
    na, nf = ns(0.0008), min(len(out), ns(0.02))
    out[:na] *= np.linspace(0, 1, na)
    out[-nf:] *= np.cos(np.linspace(0, np.pi / 2, nf))
    return out


# ------------------------------------------------------------------ noise

def white(dur, rng):
    return rng.uniform(-1, 1, ns(dur))


def colored(dur, rng, slope):
    """Noise with a 1/f^slope power spectrum (slope 1 = pink, 2 = brown), unit-ish peak."""
    n = ns(dur)
    spec = np.fft.rfft(rng.standard_normal(n + 1024))
    f = np.fft.rfftfreq(n + 1024, 1 / SR)
    f[0] = f[1]
    spec /= f ** (slope / 2)
    spec[f < 18] = 0
    x = np.fft.irfft(spec)[:n]
    return x / (np.max(np.abs(x)) + 1e-12)


def pink(dur, rng):
    return colored(dur, rng, 1.0)


def brown(dur, rng):
    return colored(dur, rng, 2.0)


def dust(dur, rate, rng, decay=0.0006, density=None):
    """Random clicks (crackle/sparks). rate = clicks/s, `density` an optional 0..1 curve over time."""
    n = ns(dur)
    x = np.zeros(n)
    p = rate / SR
    probs = np.full(n, p) if density is None else p * hold_to(np.asarray(density, float), n)
    hits = np.nonzero(rng.random(n) < probs)[0]
    x[hits] = rng.uniform(0.3, 1.0, len(hits)) * rng.choice([-1, 1], len(hits))
    k = np.exp(-np.arange(ns(decay * 6)) / (decay * SR))
    return fftconvolve(x, k)[:n]


# ------------------------------------------------------------------ filters

@njit(cache=True)
def _svf(x, fc, q, mode):
    n = len(x)
    y = np.empty(n)
    ic1 = 0.0
    ic2 = 0.0
    k = 1.0 / q
    for i in range(n):
        f = fc[i]
        if f > 20000.0:
            f = 20000.0
        if f < 10.0:
            f = 10.0
        g = np.tan(np.pi * f / 44100.0)
        a1 = 1.0 / (1.0 + g * (g + k))
        a2 = g * a1
        a3 = g * a2
        v3 = x[i] - ic2
        v1 = a1 * ic1 + a2 * v3
        v2 = ic2 + a2 * ic1 + a3 * v3
        ic1 = 2.0 * v1 - ic1
        ic2 = 2.0 * v2 - ic2
        if mode == 0:
            y[i] = v2
        elif mode == 1:
            y[i] = v1 * k  # unity-gain band-pass
        elif mode == 2:
            y[i] = x[i] - k * v1 - v2
        else:
            y[i] = x[i] - k * v1  # notch
    return y


MODES = {'lp': 0, 'bp': 1, 'hp': 2, 'notch': 3}


def svf(x, mode, fc, q=0.707):
    """Time-varying state-variable filter; fc scalar or curve (held at its last value)."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 2:
        return np.stack([svf(c, mode, fc, q) for c in x])
    f = np.asarray(fc, dtype=np.float64)
    f = np.full(len(x), float(f)) if f.ndim == 0 else hold_to(f, len(x))
    return _svf(x, f, float(q), MODES[mode])


def lp(x, f, q=0.707):
    return svf(x, 'lp', f, q)


def hp(x, f, q=0.707):
    return svf(x, 'hp', f, q)


def bp(x, f, q=1.0):
    return svf(x, 'bp', f, q)


def butter_f(x, kind, f, order=2):
    sos = butter(order, f, btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x, axis=-1)


def shelf(x, f, gain_db, kind='high'):
    """Crude shelf: split with a 2nd-order crossover and re-weight the band."""
    g = 10 ** (gain_db / 20) - 1
    band = butter_f(x, 'highpass' if kind == 'high' else 'lowpass', f, 2)
    return x + g * band


def formant(x, vowel_from, vowel_to=None, dur=None, shift=1.0, q=(5, 7, 9), body=0.25):
    """Vocal tract: three parallel band-passes gliding between two vowels, plus some low-passed source
    so the voice keeps a buzzy chest instead of collapsing into three whistles."""
    V = {'a': (730, 1090, 2440), 'e': (530, 1840, 2480), 'i': (300, 2250, 3000),
         'o': (570, 840, 2410), 'u': (320, 800, 2240), 'r': (490, 1350, 1690)}
    G = (1.0, 0.55, 0.3)
    n = x.shape[-1]
    a = V[vowel_from]
    b = V[vowel_to or vowel_from]
    k = min(n, ns(dur) if dur else n)
    out = np.zeros(n)
    for i in range(3):
        fc = hold_to(np.linspace(a[i], b[i], k), n) * shift
        out += G[i] * bp(x, fc, q[i])
    return out + body * lp(x, 900 * shift)


# ------------------------------------------------------------------ dynamics / colour

def sat(x, drive=2.0, asym=0.0):
    """tanh saturation normalised so small signals keep unity gain; asym adds even harmonics."""
    return np.tanh(drive * (x + asym)) / drive - np.tanh(drive * asym) / drive


def fold(x, amt):
    """Gentle wavefolding for gritty metallic edges."""
    return np.sin(x * amt) / amt


def crush(x, bits=8, down=1):
    q = 2 ** (bits - 1)
    y = np.round(x * q) / q
    if down > 1:
        y = np.repeat(y[..., ::down], down, axis=-1)[..., :x.shape[-1]]
    return y


@njit(cache=True)
def _comp(x, thr, ratio, att, rel, knee):
    n = x.shape[-1]
    gains = np.empty(n)
    envv = 0.0
    aa = np.exp(-1.0 / (att * 44100.0))
    ar = np.exp(-1.0 / (rel * 44100.0))
    for i in range(n):
        lvl = 0.0
        for c in range(x.shape[0]):
            v = abs(x[c, i])
            if v > lvl:
                lvl = v
        if lvl > envv:
            envv = aa * envv + (1 - aa) * lvl
        else:
            envv = ar * envv + (1 - ar) * lvl
        db = 20.0 * np.log10(envv + 1e-9)
        over = db - thr
        if over <= -knee / 2:
            gr = 0.0
        elif over < knee / 2:
            gr = (1.0 / ratio - 1.0) * (over + knee / 2) ** 2 / (2 * knee)
        else:
            gr = (1.0 / ratio - 1.0) * over
        gains[i] = 10.0 ** (gr / 20.0)
    return gains


def comp(x, thr=-18.0, ratio=3.0, att=0.004, rel=0.12, knee=6.0, makeup=0.0):
    """Feed-forward peak compressor (stereo-linked). thr is relative to the signal's own peak."""
    x2 = x if x.ndim == 2 else x[None, :]
    pk = np.max(np.abs(x2)) + 1e-12
    g = _comp(np.ascontiguousarray(x2 / pk), float(thr), float(ratio), float(att), float(rel), float(knee))
    y = x2 * g * 10 ** (makeup / 20)
    return y if x.ndim == 2 else y[0]


def transient(x, amount=1.5, fast=0.001, slow=0.03):
    """Boost the attack: ratio of a fast and a slow envelope follower."""
    a = np.abs(x if x.ndim == 1 else x.max(axis=0))
    ef = _follow(a, fast)
    es = _follow(a, slow)
    g = np.clip((ef + 1e-6) / (es + 1e-6), 1, 8) ** (amount - 1)
    return x * g


@njit(cache=True)
def _follow_nb(a, coef):
    y = np.empty_like(a)
    e = 0.0
    for i in range(len(a)):
        e = max(a[i], coef * e + (1 - coef) * a[i])
        y[i] = e
    return y


def _follow(a, tau):
    return _follow_nb(a, np.exp(-1 / (tau * SR)))


# ------------------------------------------------------------------ space

def impulse(dur, rng, decay=None, bright=0.5, pre=0.008, er=True):
    """Stereo synthetic room: early reflection taps + exponentially decaying noise that darkens with time."""
    n = ns(dur)
    decay = decay or dur / 3
    t = tt(dur)
    ir = np.zeros((2, n))
    for c in range(2):
        nz = rng.standard_normal(n)
        dark = butter_f(nz, 'lowpass', 1200)
        light = butter_f(nz, 'lowpass', 2500 + 9000 * bright)
        mixk = np.clip(t / dur * 2.5, 0, 1)
        tail = (light * (1 - mixk) + dark * mixk * 1.6) * np.exp(-t / decay)
        s = ns(pre)
        ir[c, s:] = tail[: n - s]
        if er:
            for _ in range(7):
                d = ns(rng.uniform(0.003, 0.035))
                ir[c, d] += rng.uniform(-0.6, 0.6) * 4
    ir /= np.sqrt(np.sum(ir ** 2) / 2) + 1e-12
    return ir


def reverb(x, rng, wet=0.15, size=0.6, bright=0.5, pre=0.008):
    """Returns stereo dry + wet (wet level is energy-relative)."""
    s = stereo(x)
    ir = impulse(size, rng, bright=bright, pre=pre)
    mono_in = s.mean(axis=0)
    w = np.stack([fftconvolve(mono_in, ir[0]), fftconvolve(mono_in, ir[1])])
    n = w.shape[-1]
    return fit(s, n) + wet * w


def room(x, rng, wet=0.08):
    """Tiny, tight room for small sounds: keeps them mono."""
    ir = impulse(0.15, rng, decay=0.035, bright=0.4, pre=0.002)[0]
    w = fftconvolve(x, ir, axes=-1)
    return fit(x, w.shape[-1]) + wet * w


def stereo(x):
    return x if x.ndim == 2 else np.stack([x, x])


def widen(x, rng, amount=0.5):
    """Decorrelate a mono layer: two different short all-pass-ish smears for L and R."""
    if x.ndim == 2:
        return x
    out = []
    for _ in range(2):
        k = np.zeros(ns(0.012))
        k[0] = 1
        for _ in range(12):
            k[rng.integers(1, len(k))] += rng.uniform(-0.35, 0.35)
        out.append(fftconvolve(x, k)[: len(x)])
    wide = np.stack(out)
    wide /= np.max(np.abs(wide)) / (np.max(np.abs(x)) + 1e-12) + 1e-12
    return (1 - amount) * stereo(x) + amount * wide


def pan(x, p):
    """Equal-power pan of a mono signal, p in -1..1."""
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)]) * np.sqrt(2)


# ------------------------------------------------------------------ assembly

def at(x, sec):
    """Delay a signal by `sec`."""
    d = ns(sec) if sec > 0 else 0
    pad = [(0, 0)] * (x.ndim - 1) + [(d, 0)]
    return np.pad(x, pad)


def mix(*layers):
    """Sum layers of any length; promotes to stereo if any layer is stereo."""
    n = max(l.shape[-1] for l in layers)
    st = any(l.ndim == 2 for l in layers)
    out = np.zeros((2, n)) if st else np.zeros(n)
    for l in layers:
        l2 = stereo(l) if st else l
        out[..., : l2.shape[-1]] += l2
    return out


def norm(x, peak=1.0):
    return x * (peak / (np.max(np.abs(x)) + 1e-12))


def true_peak(x):
    x2 = x if x.ndim == 2 else x[None, :]
    return max(np.max(np.abs(resample_poly(c, 4, 1))) for c in x2)


def finalize(x, mono, peak_db=-1.2, trim_db=-46, fade_in=0.0006, fade_out=0.012, dc_hz=22, loop=False):
    """DC block, trim silence, click-free edges, normalise the true peak."""
    x = np.asarray(x, dtype=np.float64)
    if mono and x.ndim == 2:
        x = x.mean(axis=0)
    if not mono:
        x = stereo(x)
    if not loop:  # a causal high-pass would break the loop seam; loops only get their mean removed
        x = butter_f(x, 'highpass', dc_hz, 2)
        a = np.abs(x) if x.ndim == 1 else np.abs(x).max(axis=0)
        pk = a.max() + 1e-12
        above = np.nonzero(a > pk * 10 ** (trim_db / 20))[0]
        start = max(0, above[0] - ns(0.0005))
        end = min(len(a), above[-1] + ns(fade_out))
        x = x[..., start:end]
        fi, fo = ns(fade_in), max(ns(fade_out), int(0.06 * x.shape[-1]))  # long tails fade over their last 6 %
        x[..., :fi] *= 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, fi))
        x[..., -fo:] *= 0.5 + 0.5 * np.cos(np.linspace(0, np.pi, fo))
    if loop:
        x -= x.mean(axis=-1, keepdims=True)
    return x * (10 ** (peak_db / 20) / (true_peak(x) + 1e-12))


def loopify(x, loop_len, xfade):
    """Given a signal rendered for loop_len + xfade seconds, fold the tail over the head
    with an equal-power crossfade so the result loops seamlessly at exactly loop_len."""
    L, X = ns(loop_len), ns(xfade)
    x = x[..., : L + X].copy()
    head = x[..., :X].copy()
    tail = x[..., L:L + X]
    th = np.linspace(0, np.pi / 2, X)
    x[..., :X] = head * np.sin(th) + tail * np.cos(th)
    return x[..., :L]


def loudness(x, win=0.05):
    """Loudest 50 ms window of BS.1770 K-weighted power, in dB (same measure as tools/sfx-qa.py)."""
    from scipy.signal import lfilter
    y = lfilter([1.0, -2.0, 1.0], [1.0, -1.98916967, 0.98919506],
                lfilter([1.53090959, -2.65116903, 1.16916686], [1.0, -1.66375011, 0.71265753], x, axis=-1), axis=-1)
    pw = (y ** 2).sum(axis=0) if y.ndim == 2 else y ** 2
    n = min(len(pw), ns(win))
    c = np.convolve(pw, np.ones(n) / n, mode='valid')
    return 10 * np.log10(c.max() + 1e-12) - 0.691
