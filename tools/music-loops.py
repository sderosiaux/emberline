"""Find musical loop points for each generated track.
Generated songs end with a fade or a final hit, and jumping back to the intro resets the phrase. We search
for a jump from late in the track (E) to an earlier point (S) such that the ~6 s leading into E and into S
match in rhythm (onset envelope cross-correlation, ~12 ms resolution) and harmony/timbre (chroma + MFCC).
Playing up to E and continuing from S then sounds like the music simply went on.
Writes public/music/tracks.json: { id: { loopStart, loopEnd, xfade, duration, score } } (seconds)."""
import json, os, sys
import numpy as np, librosa
from scipy.signal import fftconvolve

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC = os.path.join(ROOT, 'public', 'music')
SR, HOP = 22050, 256
CTX = 6.0         # seconds of context that must match before the jump
MIN_LOOP = 45.0   # seconds between S and E

def zn(x):
    x = x - x.mean()
    return x / (np.linalg.norm(x) + 1e-9)

def analyse(path):
    y, _ = librosa.load(path, sr=SR, mono=True)
    dur = len(y) / SR
    t = lambda f: f * HOP / SR
    f = lambda sec: int(sec * SR / HOP)
    env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=SR, hop_length=HOP)
    mfcc = librosa.feature.mfcc(y=y, sr=SR, n_mfcc=13, hop_length=HOP)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    n = min(len(env), chroma.shape[1], mfcc.shape[1], len(rms))
    env, chroma, mfcc, rms = env[:n], chroma[:, :n], mfcc[:, :n], rms[:n]
    ref = np.median(rms[f(8):f(dur - 8)])
    smooth = np.convolve(rms, np.ones(f(1.0)) / f(1.0), mode='same')
    w = f(CTX)
    best = None
    for E in range(f(dur * 0.5), n - f(3), 4):
        if smooth[E - f(1.0)] < 0.7 * ref:   # still inside the body of the song, not the fade
            continue
        a = zn(env[E - w:E])
        smax = E - f(MIN_LOOP)
        if smax <= w + f(4):
            continue
        # rhythm: normalized cross-correlation of the context window against every earlier position
        seg = env[: smax]
        num = fftconvolve(seg, a[::-1], mode='valid')                 # index k -> window seg[k:k+w]
        csum = np.cumsum(np.concatenate([[0], seg])); csq = np.cumsum(np.concatenate([[0], seg ** 2]))
        m = (csum[w:] - csum[:-w]) / w
        sd = np.sqrt(np.maximum(csq[w:] - csq[:-w] - w * m ** 2, 1e-9))
        corr = num[: len(sd)] / sd
        k0 = f(4)
        cand = np.argsort(corr[k0:])[-5:] + k0                        # top rhythmic matches
        ca = chroma[:, E - w:E].mean(1); ma = mfcc[:, E - w:E].mean(1)
        for k in cand:
            S = k + w
            cs = chroma[:, S - w:S].mean(1); ms = mfcc[:, S - w:S].mean(1)
            harm = float(np.dot(ca, cs) / (np.linalg.norm(ca) * np.linalg.norm(cs) + 1e-9))
            timb = float(np.dot(ma, ms) / (np.linalg.norm(ma) * np.linalg.norm(ms) + 1e-9))
            # what follows S should also resemble what would have followed E
            nxt = float(np.dot(zn(env[S:S + f(1.5)]), zn(env[E:E + f(1.5)]))) if E + f(1.5) < n else 0
            score = corr[k] * 0.45 + harm * 0.25 + timb * 0.15 + nxt * 0.15 + (t(E) - t(S)) / dur * 0.05
            if best is None or score > best[0]:
                best = (score, E, S, corr[k], harm)
    if best is None:
        raise RuntimeError('no loop found')
    score, E, S, rc, hc = best
    end, start = t(E), t(S)
    # waveform fine alignment (±3 ms) so the short crossfade doesn't comb-filter
    y44, _ = librosa.load(path, sr=44100, mono=True)
    nwin = int(0.04 * 44100)
    ea = y44[int(end * 44100) - nwin: int(end * 44100) + nwin]
    bd, bo = -1e9, 0
    for d in range(-132, 133):
        sb = y44[int(start * 44100) - nwin + d: int(start * 44100) + nwin + d]
        if len(sb) == len(ea):
            c = float(np.dot(ea, sb))
            if c > bd:
                bd, bo = c, d
    start = float(start + bo / 44100)
    return {'loopStart': round(start, 4), 'loopEnd': round(end, 4), 'xfade': 0.06, 'duration': round(dur, 3),
            'score': round(float(score), 3), 'rhythm': round(float(rc), 3), 'harmony': round(float(hc), 3)}

if __name__ == '__main__':
    meta_path = os.path.join(MUSIC, 'tracks.json')
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    ids = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(MUSIC) if f.endswith('.mp3'))
    for tr in ids:
        meta[tr] = analyse(os.path.join(MUSIC, f'{tr}.mp3'))
        print(tr, meta[tr], flush=True)
    json.dump(meta, open(meta_path, 'w'), indent=1, sort_keys=True)
