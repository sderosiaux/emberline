"""Render each track's loop seam (4 s before loopEnd crossfaded into loopStart, like the game does) and ask Gemini if it's audible.
usage: python3 tools/music-seams.py [track ...]"""
import base64, io, json, os, subprocess, sys, urllib.request
import numpy as np, librosa, soundfile as sf
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MUSIC = os.path.join(ROOT, 'public', 'music')
meta = json.load(open(os.path.join(MUSIC, 'tracks.json')))

def seam(t):
    m = meta[t]
    y, sr = librosa.load(os.path.join(MUSIC, f'{t}.mp3'), sr=44100, mono=False)
    s = lambda sec: int(sec * sr)
    xf = m['xfade']
    a = y[:, s(m['loopEnd'] - 4): s(m['loopEnd'] + xf)]
    b = y[:, s(m['loopStart']): s(m['loopStart'] + 4 + xf)]
    n = s(xf)
    ramp = np.linspace(0, 1, n)
    head = a[:, : a.shape[1] - n]
    mix = a[:, a.shape[1] - n:] * (1 - ramp) + b[:, :n] * ramp
    out = np.concatenate([head, mix, b[:, n:]], axis=1)
    buf = io.BytesIO(); sf.write(buf, out.T, sr, format='WAV'); wav = buf.getvalue()
    mp3 = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', '-', '-f', 'mp3', '-b:a', '160k', '-'], input=wav, capture_output=True).stdout
    return mp3

def ask(mp3):
    prompt = ('This 8-second clip is a game-music loop point: around the 4-second mark the track jumps from near its end back to an earlier point with a short crossfade. '
              'Answer ONLY JSON: {"seamless": true/false (would a player notice the jump?), "score": 1-10 (10 = inaudible), "problem": "" or what is audible (tempo/beat flam, harmony clash, energy drop, abrupt texture change)}')
    body = {'contents': [{'parts': [{'inline_data': {'mime_type': 'audio/mpeg', 'data': base64.b64encode(mp3).decode()}}, {'text': prompt}]}],
            'generationConfig': {'responseMimeType': 'application/json'}}
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', data=json.dumps(body).encode(),
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ['GEMINI_API_KEY']}, method='POST')
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(json.load(r)['candidates'][0]['content']['parts'][0]['text'])

if __name__ == '__main__':
    os.makedirs('/tmp/seams', exist_ok=True)
    for t in sys.argv[1:] or sorted(meta):
        mp3 = seam(t)
        open(f'/tmp/seams/{t}.mp3', 'wb').write(mp3)
        try: print(t, json.dumps(ask(mp3)), flush=True)
        except Exception as e: print(t, 'ERROR', e, flush=True)
