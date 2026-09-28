"""Generate EMBERLINE's sound effects with ElevenLabs text-to-sound (eleven_text_to_sound_v2).

usage: ELEVENLABS_API_KEY=... python3 tools/generate-sfx-elevenlabs.py [name ...]   (no args = all)
Writes public/sfx/<name>_eN.wav, trims leading silence (shots must fire on the frame), matches the loudness
of the previous sample for that name so the game's mix gains stay valid, and updates public/sfx/manifest.json.
The prompts below ARE the sound design; edit one and rerun with its name to get a new take."""
import io, json, os, sys, time, urllib.request, concurrent.futures as cf
import numpy as np, soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'sfx')
SR = 44100
STYLE = 'Video game sound effect for a modern sci-fi arcade shoot-em-up. Clean, punchy, high quality, no music, no voice.'

# name: (prompt, duration seconds, variants, max length after trim)
S = {
  # player weapons: fire 2-12 times per second, must be short and snappy
  'shot_pulse': ('Rapid-fire plasma blaster shot, single shot, tight punchy transient with a warm energy zap, short', 0.5, 3, 0.2),
  'shot_scatter': ('Sci-fi energy shotgun blast, single shot, chunky wide burst with a thump, short', 0.5, 3, 0.3),
  'shot_arc': ('Short electric lightning arc zap, crackling electricity discharge, single burst', 0.5, 3, 0.25),
  'shot_missile': ('Small homing missile launch, quick whoosh with ignition hiss, single', 0.6, 3, 0.45),
  'shot_bloom': ('Hollow mortar launch thump, deep tube pop with a short airy tail, single', 0.6, 3, 0.4),
  'shot_helix': ('Twin intertwined energy beams firing, warbling phaser tone burst, single short', 0.5, 3, 0.25),
  'shot_rail': ('Heavy railgun shot, charged electromagnetic crack with a deep punch and metallic ring, single', 1.0, 3, 0.6),
  'shot_mine': ('Small metallic mine dropped and arming, mechanical clunk with a click', 0.5, 2, 0.35),
  'shot_drone': ('Tiny drone laser pew, light and quiet, single short shot', 0.5, 3, 0.15),
  # enemy fire: organic-machine timbre, clearly different from the player's
  'enemy_shot': ('Alien bio-mechanical creature spitting a glowing energy orb, short wet synthetic squelch, single', 0.5, 3, 0.25),
  'enemy_shot_heavy': ('Large alien cannon firing a heavy energy ball, deep throbbing pulse, single', 0.7, 2, 0.5),
  'enemy_missile': ('Enemy rocket launch, harsh hiss and roar, single', 0.8, 2, 0.6),
  'enemy_laser_charge': ('Energy laser charging up, rising electric whine building tension, 1 second', 1.2, 1, 1.2),
  'enemy_laser_fire': ('Massive continuous laser beam firing, intense searing buzz and roar', 1.5, 1, 1.4),
  # impacts
  'hit_small': ('Small bullet impact on a metal spaceship hull, quick spark tick', 0.5, 3, 0.12),
  'hit_armor': ('Bullet ricochet off heavy armor plating, sharp metallic clank ping', 0.5, 3, 0.3),
  'shield_hit': ('Energy shield absorbing a hit, electric sizzle with a shimmering forcefield ripple', 0.6, 3, 0.4),
  'hull_hit': ('Spaceship hull taking heavy damage, crunchy metal impact with sparks and a dull thud', 0.7, 2, 0.5),
  # explosions
  'expl_small': ('Small spaceship explosion, quick punchy boom with crackling debris', 0.8, 3, 0.7),
  'expl_medium': ('Medium explosion of a fighter craft, solid boom with fire whoosh and scattering debris', 1.4, 3, 1.3),
  'expl_large': ('Large spaceship explosion, heavy deep boom with rumbling fireball and metal debris raining', 2.5, 2, 2.4),
  'expl_huge': ('Enormous capital ship destruction, chain of massive explosions building into a huge deep rumbling blast with long debris tail', 4.0, 1, 4.0),
  'chain_reaction': ('Chain reaction of several explosions going off in quick succession, fuel tanks blowing up', 2.0, 1, 2.0),
  'boss_part': ('Heavy mechanical component destroyed, metal crunch and explosion with grinding debris', 1.5, 1, 1.4),
  'player_death': ('Player spaceship destroyed, violent explosion with electrical failure and hull breaking apart', 2.5, 1, 2.4),
  # shield / status
  'shield_down': ('Energy shield collapsing, descending electric power-down with a warning tone', 1.0, 1, 0.9),
  'shield_restored': ('Energy shield recharged, soft rising shimmering power-up hum', 0.8, 1, 0.8),
  'low_hull': ('Short cockpit warning beep, urgent but not annoying, two tones', 0.6, 1, 0.5),
  'energy_empty': ('Weapon out of energy, dry click with a sputtering fizzle', 0.5, 1, 0.35),
  'shield_gen_down': ('Big shield generator shutting down, heavy electrical power-down whine and clunk', 1.5, 1, 1.4),
  # pickups
  'pickup_credit': ('Collecting a small coin in a game, bright short metallic chime', 0.5, 3, 0.25),
  'pickup_big': ('Collecting a large valuable gem, rich sparkling chime with a shimmer', 0.7, 1, 0.6),
  'pickup_repair': ('Repair pickup collected, mechanical ratchet and a warm healing chime', 0.8, 1, 0.7),
  'pickup_special': ('Energy cell collected, charging zap with a rising sparkle', 0.7, 1, 0.6),
  'pickup_core': ('Mysterious alien data crystal collected, ethereal glassy shimmer with a deep resonant tone', 1.5, 1, 1.5),
  # specials
  'special_ready': ('Special weapon fully charged, satisfying power-up ding with an energetic swell', 0.8, 1, 0.8),
  'special_nova': ('Massive energy shockwave blast expanding outward, deep whoomph with a bright sweeping wave', 2.0, 1, 2.0),
  'special_overclock': ('Spaceship engines overclocking, turbine revving up to a high-pitched boost', 1.5, 1, 1.5),
  'special_phase': ('Ship phasing out of reality, warping shimmer with a reversed whoosh', 1.2, 1, 1.2),
  'special_singularity': ('Black hole forming, deep sucking implosion with a low rumble and swirling wind', 2.5, 1, 2.5),
  'special_swarm': ('Barrage of dozens of small missiles launching in rapid succession', 2.0, 1, 2.0),
  # events
  'boss_warning': ('Spaceship alarm klaxon, dramatic warning siren for an incoming boss, two blasts', 2.5, 1, 2.5),
  'boss_phase': ('Giant machine transforming, heavy mechanical shifting with hydraulic hiss and a metallic roar', 2.0, 1, 2.0),
  'secret': ('Discovering a secret in a game, magical mysterious sparkling reveal, short and delightful', 1.5, 1, 1.5),
  'radio': ('Short radio transmission click with a burst of static', 0.5, 1, 0.3),
  'mission_complete': ('Mission complete victory stinger, triumphant short synth fanfare', 3.0, 1, 3.0),
  'game_over': ('Game over, somber descending synth tone with a low rumble', 2.5, 1, 2.5),
  # UI
  'ui_move': ('Soft UI menu hover tick, subtle clean click', 0.5, 1, 0.08),
  'ui_select': ('UI menu confirm click, crisp satisfying button press', 0.5, 1, 0.2),
  'ui_back': ('UI menu back click, soft lower-pitched tap', 0.5, 1, 0.2),
  'ui_buy': ('Buying an item in a game shop, cash register cha-ching with coins', 0.8, 1, 0.7),
  'ui_sell': ('Selling an item, coins sliding and a soft chime', 0.7, 1, 0.6),
  'ui_deny': ('UI error, soft muted buzz, not annoying', 0.5, 1, 0.25),
  'ui_upgrade': ('Weapon upgrade installed, mechanical lock-in clunk with a rising power-up chime', 1.0, 1, 0.9),
}
LOOPS = {
  'beam': ('Continuous powerful energy beam hum, sustained searing laser drone, seamless loop', 3.0),
  'charge': ('Continuous energy charging whine, sustained rising electric hum, seamless loop', 2.0),
  'alarm': ('Soft repeating cockpit warning alarm pulse, low urgency, seamless loop', 2.0),
}

def call(text, dur, loop=False):
    body = json.dumps({'text': f'{text}. {STYLE}', 'duration_seconds': dur, 'prompt_influence': 0.55,
                       'model_id': 'eleven_text_to_sound_v2', 'loop': loop}).encode()
    req = urllib.request.Request('https://api.elevenlabs.io/v1/sound-generation?output_format=pcm_44100', data=body, method='POST',
                                 headers={'xi-api-key': os.environ['ELEVENLABS_API_KEY'], 'Content-Type': 'application/json'})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return np.frombuffer(r.read(), dtype='<i2').astype(np.float32) / 32768
        except Exception as e:
            print(f'  retry {attempt + 1}: {e}', flush=True)
            time.sleep(4 * (attempt + 1))
    raise RuntimeError(text)

def peak_rms(x):
    w = int(0.05 * SR)
    if len(x) < w: return float(np.sqrt(np.mean(x ** 2)) + 1e-9)
    c = np.cumsum(np.concatenate([[0], x ** 2]))
    return float(np.sqrt((c[w:] - c[:-w]).max() / w) + 1e-9)

def clean(x, max_len):
    a = np.abs(x); thr = a.max() * 0.03
    start = max(0, int(np.argmax(a > thr)) - int(0.002 * SR))       # fire on the frame: cut leading silence
    x = x[start:start + int(max_len * SR)]
    tail = np.where(np.abs(x) > a.max() * 0.004)[0]
    if len(tail): x = x[: tail[-1] + int(0.02 * SR)]
    f = min(len(x) // 4, int(0.015 * SR)); x[-f:] *= np.linspace(1, 0, f)
    x[: 32] *= np.linspace(0, 1, 32)
    return x

def reference_level(name):
    try:
        man = json.load(open(os.path.join(OUT, 'manifest.json')))
        f = man['sfx'][name]['files'][0]
        y, _ = sf.read(os.path.join(OUT, f)); y = y.mean(1) if y.ndim > 1 else y
        return peak_rms(y.astype(np.float32))
    except Exception:
        return None

def make(name):
    prompt, dur, n, max_len = S[name]
    ref = reference_level(name)
    files = []
    for i in range(n):
        x = clean(call(prompt, dur), max_len)
        target = ref if ref else peak_rms(x)
        x *= target / peak_rms(x)
        pk = np.abs(x).max()
        if pk > 0.89: x *= 0.89 / pk
        fn = f'{name}_e{i + 1}.wav'
        sf.write(os.path.join(OUT, fn), x, SR, subtype='PCM_16')
        files.append(fn)
    return name, files

def make_loop(name):
    prompt, dur = LOOPS[name]
    x = call(prompt, dur, loop=True)
    x = x / (np.abs(x).max() + 1e-9) * 0.7
    fn = f'loop_{name}_e.wav'
    sf.write(os.path.join(OUT, fn), x, SR, subtype='PCM_16')
    return name, fn, len(x) / SR

if __name__ == '__main__':
    todo = sys.argv[1:] or list(S) + [f'loop:{k}' for k in LOOPS]
    man = json.load(open(os.path.join(OUT, 'manifest.json')))
    with cf.ThreadPoolExecutor(4) as ex:
        futs = {ex.submit(make_loop if t.startswith('loop:') else make, t.split(':')[-1]): t for t in todo}
        for fu in cf.as_completed(futs):
            t = futs[fu]
            try:
                res = fu.result()
            except Exception as e:
                print('FAILED', t, e, flush=True); continue
            if t.startswith('loop:'):
                name, fn, d = res
                old = man['loops'].get(name, {})
                man['loops'][name] = {**old, 'file': fn, 'loopStart': 0.0, 'loopEnd': round(d, 4)}
                print('loop', name, f'{d:.2f}s', flush=True)
            else:
                name, files = res
                old = [f for f in man['sfx'].get(name, {}).get('files', []) if f.endswith('.wav') and '_e' not in f]
                man['sfx'].setdefault(name, {})['files'] = files
                for f in old:  # retire the synthesized takes
                    try: os.remove(os.path.join(OUT, f))
                    except FileNotFoundError: pass
                print(name, len(files), 'takes', flush=True)
            json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
