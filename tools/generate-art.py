"""Generate EMBERLINE's boss art with Gemini image generation (gemini-3-pro-image).

usage: GEMINI_API_KEY=... python3 tools/generate-art.py [asset ...]   (no args = all)
       python3 tools/generate-art.py --key-only [asset ...]          (re-key raw takes, no API calls)

Each asset is painted on a flat chroma-key background, keyed to alpha here, trimmed, and fitted
into the sprite's logical box (public/art/<asset>.png at ART_SCALE× the logical size). The game
loads these over the procedural sprites of the same key; a missing file keeps the procedural art.
Raw takes are kept in tools/art-raw/ so keying can be retuned without paying for new images.
The prompts below ARE the art direction; edit one and rerun with its name for a new take."""
import base64, json, os, sys, time, urllib.request
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'art')
RAW = os.path.join(ROOT, 'tools', 'art-raw')
REF = os.path.join(ROOT, 'tools', 'art-ref')
MODEL = 'gemini-3-pro-image'
# stored pixels per logical sprite pixel: boss sprites are drawn at up to ~3.3 device px per logical px
ART_SCALE = 3

STYLE = ('Top-down orthographic game sprite, seen from directly above, for a premium sci-fi vertical shoot-em-up. '
         'Highly detailed hand-painted digital art: heavy weathered industrial machinery, layered armour plates, '
         'panel lines, rivets, pistons, cables, scorch marks and chipped paint, strong ambient occlusion, '
         'lit from the upper left, crisp dark outline around the silhouette so it reads over any terrain. '
         'Feels colossal and menacing, like a raid boss. Symmetric left/right unless stated. '
         'The front of the machine points DOWN (toward the bottom of the image). '
         'The ENTIRE object is fully inside the frame with margin around it. '
         'Background: perfectly flat uniform pure {key} ({keyhex}), no gradient, no floor, no cast shadow, no vignette. '
         'No {keyname} anywhere on the object itself. No smoke, steam, sparks, glow or particles outside the silhouette. '
         'No text, no labels, no UI.')

KEYS = {'green': ((0, 255, 0), '#00FF00', 'green'), 'magenta': ((255, 0, 255), '#FF00FF', 'magenta')}

# name: dict(prompt, aspect, box=(logical w, h), key, refs=[reference images])
A = {
  'm4_exc_body': dict(
    aspect='3:2', box=(300, 200), key='green', refs=['m4_exc_body.png'],
    prompt='Main hull of the EXCAVATOR, a colossal asteroid strip-mining machine hijacked by a hostile machine intelligence. '
           'A wide armoured chassis: a heavy central body with a big round armoured iris shutter in the middle (closed, '
           'thick segmented blades), two massive shoulder sockets on the left and right flanks where drill arms attach '
           '(empty round sockets, no arms), ore hoppers and exhaust stacks at the back (top of the image), '
           'hazard-orange and yellow striped edges, dark gunmetal and rusted bronze plating, '
           'thin glowing hot-pink energy conduits running along the seams, a few amber warning lights. '
           'At the front (bottom edge, centre) a wide slot where a grinder mouth is mounted. '
           'Use the reference only for layout and proportions; repaint it far more detailed and realistic.'),
  'm4_exc_core': dict(
    aspect='1:1', box=(84, 84), key='green', refs=[],
    prompt='The exposed reactor core of a mining machine seen from above: a round armoured socket with broken iris blades '
           'peeled back, inside a blinding molten orange-white plasma heart with crackling hot-pink arcs, '
           'heat-blued metal rim, glowing cracks. Circular, centred.'),
  'm4_exc_shoulder': dict(
    aspect='1:1', box=(64, 64), key='green', refs=['m4_exc_shoulder.png'],
    prompt='A heavy rotating shoulder joint for a giant mining drill arm, seen from above: a round armoured hub with '
           'hydraulic pistons, a geared ring, bolts, hazard-orange accents, dark steel. Circular, centred.'),
  'm4_exc_drill': dict(
    aspect='9:16', box=(52, 300), key='green', refs=['m4_exc_drill_a.png'], tight=True,
    prompt='A single long mining drill arm seen from above, pointing straight DOWN: at the top a thick armoured boom '
           'with hydraulic rams and cables, getting narrower, ending at the bottom in a huge spiral tungsten drill bit '
           'with sharp cutting teeth, glowing orange-hot tip. Very long and narrow, vertical, fills the frame height.'),
  'm4_exc_maw': dict(
    aspect='16:9', box=(124, 74), key='green', refs=['m4_exc_maw.png'],
    prompt='The grinder mouth of a mining machine, seen from above: a wide armoured jaw housing with two rows of '
           'counter-rotating crusher rollers full of sharp steel teeth, glowing orange furnace light deep inside, '
           'rock dust, hazard stripes on the lip. Wider than tall.'),
}


def api_key():
    k = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not k: sys.exit('GEMINI_API_KEY not set')
    return k


def generate(name, spec):
    key_rgb, keyhex, keyname = KEYS[spec['key']]
    text = spec['prompt'] + '\n\n' + STYLE.format(key=keyname, keyhex=keyhex, keyname=keyname)
    parts = [{'text': text}]
    for r in spec.get('refs', []):
        p = os.path.join(REF, r)
        if os.path.exists(p):
            parts.append({'inline_data': {'mime_type': 'image/png', 'data': base64.b64encode(open(p, 'rb').read()).decode()}})
    body = json.dumps({'contents': [{'parts': parts}],
                       'generationConfig': {'responseModalities': ['IMAGE'], 'imageConfig': {'aspectRatio': spec['aspect'], 'imageSize': '2K'}}}).encode()
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent', data=body, method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': api_key()})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                res = json.loads(r.read())
            for c in res.get('candidates', []):
                for p in c.get('content', {}).get('parts', []):
                    d = p.get('inlineData') or p.get('inline_data')
                    if d: return base64.b64decode(d['data'])
            raise RuntimeError(f'no image in response: {json.dumps(res)[:400]}')
        except Exception as e:
            print(f'  {name}: retry {attempt + 1}: {e}', flush=True)
            time.sleep(5 * (attempt + 1))
    raise RuntimeError(name)


def chroma_key(img: Image.Image, key_rgb: tuple) -> Image.Image:
    """Alpha from distance to the key colour (soft edge), then remove key spill from edge pixels."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    k = np.array(key_rgb, np.float32)
    # the background is "flat" only to the eye: estimate the actual key from the image border
    border = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    near = border[np.linalg.norm(border - k, axis=1) < 160]
    if len(near) > 50: k = np.median(near, axis=0)
    d = np.linalg.norm(a - k, axis=2)
    alpha = np.clip((d - 60) / (150 - 60), 0, 1)
    # tinted leftovers (smoke, haze) the model paints in the key's hue: the object is told never to use it
    if key_rgb == (0, 255, 0):
        dom = a[..., 1] - np.maximum(a[..., 0], a[..., 2])
    else:
        dom = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    alpha = np.minimum(alpha, np.clip(1 - (dom - 6) / 20, 0, 1))
    # spill: the key's dominant channel(s) exceeding the others on edge pixels
    out = a.copy()
    if key_rgb == (0, 255, 0):
        lim = np.maximum(out[..., 0], out[..., 2])
        g = out[..., 1]
        out[..., 1] = np.where(g > lim, lim + (g - lim) * (1 - (1 - alpha) ** 0.5) * 0.3, g)
    else:
        lim = out[..., 1]
        for ch in (0, 2):
            c = out[..., ch]
            out[..., ch] = np.where(c > lim, lim + (c - lim) * (alpha ** 2), c)
    rgba = np.dstack([np.clip(out, 0, 255), alpha * 255]).astype(np.uint8)
    im = Image.fromarray(rgba, 'RGBA')
    # drop isolated specks the model sometimes leaves in the background
    return im


def fit(im, box, tight=False):
    """Trim to content, then fit inside the logical box (keeping aspect), centred, at ART_SCALE.
    tight: the box takes the content's own aspect (keeps the width), so the art's edges are the
    sprite's edges — needed when code anchors on an end of the sprite (a drill tip, a barrel)."""
    bb = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bb: im = im.crop(bb)
    if tight: box = (box[0], max(1, round(box[0] * im.height / im.width)))
    W, H = box[0] * ART_SCALE, box[1] * ART_SCALE
    s = min(W / im.width, H / im.height)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.alpha_composite(im, ((W - im.width) // 2, (H - im.height) // 2))
    return out


def main():
    args = sys.argv[1:]
    key_only = '--key-only' in args
    names = [a for a in args if not a.startswith('--')] or list(A)
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    for n in names:
        spec = A[n]
        raw = os.path.join(RAW, f'{n}.png')
        if not key_only or not os.path.exists(raw):
            print(f'{n}: generating', flush=True)
            open(raw, 'wb').write(generate(n, spec))
        img = Image.open(raw)
        out = fit(chroma_key(img, KEYS[spec['key']][0]), spec['box'], spec.get('tight', False))
        out.save(os.path.join(OUT, f'{n}.png'), optimize=True)
        print(f'{n}: {img.size} -> {out.size}', flush=True)
    man = {}
    for n in A:
        f = os.path.join(OUT, f'{n}.png')
        if os.path.exists(f):
            w, h = Image.open(f).size
            man[n] = {'w': round(w / ART_SCALE), 'h': round(h / ART_SCALE)}
    json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
