"""Generate EMBERLINE's soundtrack with Google's Lyria 3 Pro (Gemini API).

usage: GEMINI_API_KEY=... python3 tools/generate-music.py [track ...]
Writes raw MP3s to tools/music/raw/, then normalizes/encodes them to public/music/<id>.mp3.
Prompts are the source of truth for the music direction; regenerate a track by name to try another take.
"""
import base64, json, os, subprocess, sys, time, urllib.request

MODEL = 'lyria-3-pro-preview'
COMMON = ('Instrumental only: absolutely no vocals, no singing, no lyrics, no spoken words. '
          'Soundtrack for an original arcade vertical shoot-em-up video game. '
          'High-energy 1990s PC game tracker-music spirit reimagined with modern, punchy, polished production. '
          'Duration about 2 minutes. It must loop seamlessly: the ending flows straight back into the opening '
          'with the same tempo and key, no fade-out, no final hit, no silence at start or end.')

TRACKS = {
    'title': 'Heroic sci-fi anthem, 118 BPM, D major with a B minor bridge. Bright synth-brass lead melody with a memorable hook, '
             'fast arpeggiated analog synths, big gated drums, driving bass. Hopeful, adventurous, a lone pilot taking off.',
    'hangar': 'Laid-back groovy shop music in a starship hangar, 96 BPM, F major. Electric piano chords, round slap bass, '
              'light swung drums, playful muted synth plucks, a catchy relaxed melody. Warm, a bit cheeky.',
    'm1': 'Driving industrial synth-rock for flying over a desert refinery planet, 140 BPM, E minor. Chugging distorted guitar riffs, '
          'tracker-style square-wave arpeggios, heavy rock drums, metallic percussion hits, a soaring lead melody.',
    'm2': 'Flowing hopeful electronic track over a turquoise ocean world, 128 BPM, A major. Shimmering pads, marimba-like plucked synths, '
          'rolling breakbeat drums, a warm singing synth lead (no voice), wide stereo sparkle.',
    'm3': 'Cold, tense track for a frozen colony under siege, 110 BPM, C sharp minor. Sparse glassy bells and mallets, deep sub bass, '
          'half-time drums that build into a driving section, icy string stabs, a lonely lead melody.',
    'm4': 'Funky syncopated space-funk for an asteroid mining belt, 116 BPM, G minor. Slap synth bass, wah-wah synth guitar, '
          'crisp drums with ghost notes, brass stabs, a groovy playful lead.',
    'm5': 'Fast techno-trance for a high-speed run through an orbital shipyard, 138 BPM, F minor. Rolling offbeat bass, supersaw stabs, '
          'four-on-the-floor kick, risers, an urgent arpeggio and an anthemic lead.',
    'm6': 'Eerie dark synthwave in a graveyard of derelict warships, 92 BPM building to intense, B minor. Ghostly detuned pads, '
          'a wordless synthetic choir pad texture (synth, no human voice), slow heavy drums, metallic creaks, a haunting lead melody.',
    'm7': 'Epic urgent hybrid orchestral-electronic track for the assault on an alien machine citadel, 150 BPM, D minor. '
          'Pounding taiko and electronic drums, driving staccato strings, huge synth pads, synth brass, a heroic lead melody.',
    'secret': 'Strange, playful, dreamlike track for a secret pastel garden dimension, 100 BPM in 7/8 time, E flat major. '
              'Music box, glassy FM bells, soft glitchy percussion, gentle wobbly synths. Whimsical and slightly uncanny.',
    'boss': 'Aggressive fast boss-fight track, 160 BPM, C minor. Distorted synth bass, shredding lead synth solos, relentless double-kick drums, '
            'dramatic orchestral hits, tension and danger.',
    'final_boss': 'The most epic final boss battle, 165 BPM, D minor. Full orchestra with synths, massive drums, a synthetic choir pad '
                  'texture (no human voice, no words), soaring heroic lead, dark dramatic harmony, relentless intensity.',
    'rift': 'Dark aggressive alternate-dimension version of a shmup stage theme, 150 BPM, F sharp minor. Reversed cymbals, '
            'detuned distorted synth bass, glitchy stuttering arpeggios, pounding industrial drums, eerie dissonant pads. Unsettling and intense.',
    'ending': 'Warm, reflective ending theme after the war, 80 BPM, D major. Gentle piano, soft strings, a warm synth pad, '
              'a tender reprise of a heroic melody. Bittersweet and peaceful.',
}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, 'tools', 'music', 'raw')
OUT = os.path.join(ROOT, 'public', 'music')


def generate(track: str) -> str:
    body = json.dumps({'model': MODEL, 'input': f'{COMMON} {TRACKS[track]}'}).encode()
    req = urllib.request.Request('https://generativelanguage.googleapis.com/v1beta/interactions', data=body, method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ['GEMINI_API_KEY']})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                d = json.load(r)
            audio = [c for s in d['steps'] for c in s.get('content', []) if c.get('type') == 'audio']
            if not audio:
                raise RuntimeError(f'no audio in response: {json.dumps(d)[:300]}')
            path = os.path.join(RAW, f'{track}.mp3')
            with open(path, 'wb') as f:
                f.write(base64.b64decode(audio[0]['data']))
            return path
        except Exception as e:  # rate limits / transient errors: back off and retry
            print(f'  {track}: attempt {attempt + 1} failed: {e}', flush=True)
            time.sleep(20 * (attempt + 1))
    raise RuntimeError(f'{track}: giving up')


def encode(track: str, raw: str):
    # Two-pass-ish loudness normalisation to a game-music level, tiny edge fades against clicks at the loop point.
    out = os.path.join(OUT, f'{track}.mp3')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', raw,
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.03',
                    '-ar', '44100', '-ac', '2', '-codec:a', 'libmp3lame', '-b:a', '128k', out], check=True)
    return out


if __name__ == '__main__':
    os.makedirs(RAW, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    todo = sys.argv[1:] or list(TRACKS)
    for t in todo:
        t0 = time.time()
        raw = generate(t)
        out = encode(t, raw)
        dur = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], capture_output=True, text=True).stdout.strip()
        print(f'{t}: {float(dur):.0f}s, {os.path.getsize(out) // 1024} KB, {time.time() - t0:.0f}s', flush=True)
