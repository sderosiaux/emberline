"""Objective + blind-listening QA for public/sfx.

usage:
  python3 tools/sfx-qa.py                      table: peak, DC, attack, duration, centroid, loudness per file
  python3 tools/sfx-qa.py gemini [name ...]    ask Gemini (neutral prompt, no hint of the intent) what each file sounds like
                                               (first variant only unless a full file name like shot_pulse_v3 is given)

Loudness is the loudest 50 ms window of K-weighted RMS (BS.1770 pre-filter), in dB: comparable across
short and long sounds, and it is what the calibration step matches against the old synth mix.
"""
import base64
import concurrent.futures as cf
import io
import json
import os
import sys
import urllib.request

import numpy as np
import soundfile as sf
from scipy.signal import lfilter, resample_poly

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'public', 'sfx')
SR = 44100


def kweight(x):
    # BS.1770 stage 1 (high shelf) + stage 2 (RLB high-pass), coefficients for 44.1 kHz
    b1 = [1.53090959, -2.65116903, 1.16916686]
    a1 = [1.0, -1.66375011, 0.71265753]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.98916967, 0.98919506]
    return lfilter(b2, a2, lfilter(b1, a1, x, axis=0), axis=0)


def loud_max(x, win=0.05):
    k = kweight(x)
    p = (k ** 2).sum(axis=1) if k.ndim == 2 else k ** 2
    n = int(win * SR)
    if len(p) < n:
        return 10 * np.log10(p.mean() + 1e-12) - 0.691
    c = np.convolve(p, np.ones(n) / n, mode='valid')
    return 10 * np.log10(c.max() + 1e-12) - 0.691


def stats(path):
    x, sr = sf.read(path)
    assert sr == SR, path
    mono = x if x.ndim == 1 else x.mean(axis=1)
    peak = np.max(np.abs(x))
    dc = np.abs(x.mean(axis=0)).max()
    envl = np.convolve(np.abs(mono), np.ones(64) / 64, mode='same')
    m = envl.max()
    i10 = np.argmax(envl > 0.1 * m)
    i90 = np.argmax(envl > 0.9 * m)
    spec = np.abs(np.fft.rfft(mono * np.hanning(len(mono))))
    f = np.fft.rfftfreq(len(mono), 1 / SR)
    centroid = (spec * f).sum() / (spec.sum() + 1e-12)
    edge = max(np.abs(x[:1]).max(), np.abs(x[-1:]).max())
    return {
        'file': os.path.basename(path), 'ch': 1 if x.ndim == 1 else x.shape[1], 'dur': len(x) / SR,
        'peak_db': 20 * np.log10(peak + 1e-12), 'dc': dc, 'attack_ms': (i90 - i10) / SR * 1000,
        'centroid': centroid, 'loud': loud_max(x), 'edge': edge,
    }


def table():
    man = json.load(open(os.path.join(DIR, 'manifest.json')))
    rows = []
    for name, e in list(man['sfx'].items()) + [(k, {'files': [v['file']], 'gain': v['gain']}) for k, v in man['loops'].items()]:
        for fname in e['files']:
            s = stats(os.path.join(DIR, fname))
            s['name'], s['gain'] = name, e['gain']
            s['ingame'] = s['loud'] + 20 * np.log10(e['gain'])
            rows.append(s)
    print(f"{'file':28} {'ch':>2} {'dur':>5} {'peak':>6} {'dc':>7} {'atk ms':>6} {'centr':>6} {'loud':>6} {'gain':>5} {'in-game':>7} flags")
    bad = 0
    for s in rows:
        flags = []
        if s['peak_db'] > -1.0:
            flags.append('PEAK')
        if s['dc'] > 1e-3:
            flags.append('DC')
        if s['edge'] > 0.01 and not s['file'].startswith('loop_'):
            flags.append('EDGE')
        bad += bool(flags)
        print(f"{s['file']:28} {s['ch']:>2} {s['dur']:5.2f} {s['peak_db']:6.1f} {s['dc']:7.1e} {s['attack_ms']:6.1f} "
              f"{s['centroid']:6.0f} {s['loud']:6.1f} {s['gain']:5.2f} {s['ingame']:7.1f} {' '.join(flags)}")
    cats = {'player shots': 'shot_', 'enemy': 'enemy_', 'hits': 'hit_', 'explosions': 'expl_', 'pickups': 'pickup_',
            'specials': 'special_', 'ui': 'ui_', 'loops': 'loop_'}
    print('\nin-game loudness by category (dB, K-weighted 50 ms max, after manifest gain, before game vol):')
    for c, pre in cats.items():
        v = [s['ingame'] for s in rows if s['file'].startswith(pre)]
        if v:
            print(f'  {c:14} mean {np.mean(v):6.1f}  min {np.min(v):6.1f}  max {np.max(v):6.1f}')
    total = sum(os.path.getsize(os.path.join(DIR, f)) for f in os.listdir(DIR))
    print(f'\n{len(rows)} files, {bad} flagged, {total / 1e6:.2f} MB')
    return bad


# Keep it neutral and short: longer checklists made the model pattern-complete ("sharp", "no bass", "UI click").
PROMPT = ('Describe this audio clip in two sentences: is it high or low pitched, tonal or noisy, and what does it sound like? '
          'Then guess what it is in a video game.')


def ask(path):
    """The API mis-reads 44.1 kHz WAV (everything comes back 'high-pitched ping', as if played ~2.7x too fast),
    so the clip is sent the way the model ingests audio anyway: 16 kHz mono."""
    key = os.environ['GEMINI_API_KEY']
    x, sr = sf.read(path)
    if x.ndim == 2:
        x = x.mean(axis=1)
    x = resample_poly(x, 160, 441)
    sr = 16000
    pad = np.zeros(int(0.35 * sr))
    lead = np.zeros(int(0.25 * sr))
    buf = io.BytesIO()
    sf.write(buf, np.concatenate([lead, x, pad]), sr, format='WAV', subtype='PCM_16')
    body = {'contents': [{'parts': [{'inline_data': {'mime_type': 'audio/wav', 'data': base64.b64encode(buf.getvalue()).decode()}},
                                    {'text': PROMPT}]}],
            'generationConfig': {'temperature': 0.2}}
    req = urllib.request.Request(
        f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={key}',
        data=json.dumps(body).encode(), headers={'Content-Type': 'application/json'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                out = json.load(r)
            return ''.join(p.get('text', '') for p in out['candidates'][0]['content']['parts']).strip()
        except Exception as e:  # rate limits / transient errors
            err = e
    return f'ERROR {err}'


def gemini(names):
    man = json.load(open(os.path.join(DIR, 'manifest.json')))
    files = []
    for n in names or list(man['sfx']) + list(man['loops']):
        if n in man['sfx']:
            files.append(man['sfx'][n]['files'][0])
        elif n in man['loops']:
            files.append(man['loops'][n]['file'])
        elif os.path.exists(os.path.join(DIR, n + '.wav')):
            files.append(n + '.wav')
    # the judge is noisy: two independent takes per file, read them together
    jobs = [f for f in files for _ in range(2)]
    with cf.ThreadPoolExecutor(8) as ex:
        answers = list(ex.map(lambda f: ask(os.path.join(DIR, f)), jobs))
    for i, f in enumerate(files):
        print(f'== {f}\n[1] {answers[2 * i]}\n[2] {answers[2 * i + 1]}\n', flush=True)


if __name__ == '__main__':
    if len(sys.argv) > 1 and sys.argv[1] == 'gemini':
        gemini(sys.argv[2:])
    else:
        sys.exit(1 if table() else 0)
