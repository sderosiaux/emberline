"""Generate EMBERLINE's boss art with Gemini image generation (gemini-3-pro-image).

usage: GEMINI_API_KEY=... python3 tools/generate-art.py [asset ...]   (no args = all)
       python3 tools/generate-art.py --key-only [asset ...]          (re-key raw takes, no API calls)

Each asset is painted on a flat chroma-key background, keyed to alpha here, trimmed, and fitted
into the sprite's logical box (public/art/<asset>.webp at ART_SCALE× the logical size). The game
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

# for things that are not machines (the Gardener): same framing rules, none of the industrial look
SOFT_STYLE = ('Top-down orthographic game sprite, seen from directly above, for a premium vertical shoot-em-up. '
              'Delicate, luminous, hand-painted digital art with a thin crisp darker outline so it reads over any '
              'background. Only the single object described, nothing else in the image. The ENTIRE object is fully '
              'inside the frame with margin around it. The background MUST be a perfectly flat, uniform, saturated '
              'pure {key} ({keyhex}) everywhere around the object: not white, no glow, no gradient, no halo, no vignette, '
              'no cast shadow. No {keyname} on the object. No text, no labels, no UI.')

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

  # ── m1 SMELTER — refinery crawler (desert)
  'smelter_body': dict(
    aspect='4:3', box=(240, 186), key='green', refs=['smelter_body.png'],
    prompt='Main hull of the SMELTER, a huge tracked mobile ore refinery hijacked by a hostile machine intelligence. '
           'Two massive caterpillar track units run down the left and right sides. Between them a heavy furnace body: '
           'in the middle a big round armoured furnace hatch (closed, glowing faintly orange at the seams), crucible '
           'ladles and slag pipes, a pair of soot-blackened smokestacks at the back (top of the image), '
           'empty mounting collars at the front-left and front-right corners where flame arms attach, and two round '
           'pod mounts on top towards the back. Sun-bleached desert paint over scorched steel, copper pipes, '
           'hazard-orange trim, thin hot-pink energy lines along the seams.'),
  'smelter_core': dict(
    aspect='1:1', box=(80, 80), key='green', refs=[],
    prompt='An open smelting furnace seen from above: a thick round armoured rim with the hatch blown off, inside a '
           'churning pool of white-hot molten metal with orange and red currents and floating slag crust. Circular, centred.'),
  'smelter_arm': dict(
    aspect='9:16', box=(64, 96), key='green', refs=['smelter_arm.png'], tight=True,
    prompt='A heavy industrial flamethrower arm seen from above, pointing straight DOWN: armoured shoulder housing at '
           'the top, fuel hoses and a pressure tank along the arm, ending at the bottom in a wide flared nozzle with a '
           'glowing orange pilot flame. Vertical.'),
  'smelter_pod': dict(
    aspect='1:1', box=(48, 48), key='green', refs=['smelter_pod.png'],
    prompt='A compact square missile pod seen from above: armoured box with four launch tubes showing red-tipped '
           'missile noses, hazard stripes, rivets. Centred.'),

  # ── m2 TIDEBREAKER — leviathan submarine (sea)
  'm2_tide_hull': dict(
    aspect='9:16', box=(170, 380), key='magenta', refs=['m2_tide_hull.png'],
    prompt='The TIDEBREAKER, a colossal military submarine converted into a hostile machine leviathan, seen from directly '
           'above, bow pointing DOWN. Long streamlined dark hull, wet gleaming black and gunmetal plating with barnacles '
           'and sea-worn paint, a raised conning-tower base in the upper-middle, a rectangular missile hatch field near '
           'the stern (top), two torpedo tube openings at the bow (bottom), diving planes, faint teal-cyan bioluminescent '
           'seams. NO pink and NO magenta anywhere (energy glows are teal-cyan).'),
  'm2_tide_core': dict(
    aspect='3:4', box=(50, 64), key='magenta', refs=['m2_tide_core.png'],
    prompt='An exposed submarine reactor core seen from above: an oval armoured cradle holding a glowing teal-cyan '
           'energy cell with liquid light swirling inside, coolant pipes. NO pink, NO magenta.'),
  'm2_tide_tower': dict(
    aspect='2:3', box=(60, 90), key='magenta', refs=['m2_tide_tower.png'],
    prompt='A submarine conning tower (sail) seen from above, bow down: a streamlined armoured fin with periscope masts, '
           'sensor dome and two small dive-plane stubs, wet black steel, teal lights. NO pink, NO magenta.'),
  'm2_tide_tube': dict(
    aspect='3:4', box=(44, 56), key='magenta', refs=['m2_tide_tube.png'],
    prompt='A torpedo tube muzzle housing seen from above, pointing down: heavy armoured cylinder with an open round '
           'muzzle door and a torpedo nose visible inside, wet dark steel, teal light. NO pink, NO magenta.'),
  'm2_tide_vls': dict(
    aspect='1:1', box=(64, 60), key='magenta', refs=['m2_tide_vls.png'],
    prompt='A vertical-launch missile hatch field seen from above: a rectangular armoured deck panel with a 3x2 grid of '
           'closed square missile cell hatches, warning stripes, wet steel. NO pink, NO magenta.'),
  'm2_tide_vls_open': dict(
    aspect='1:1', box=(64, 60), key='magenta', refs=['art:m2_tide_vls'],
    prompt='Exactly the same missile hatch field as the reference image, but every hatch is open with a glowing '
           'missile tip visible in each cell. Same framing and size. NO pink, NO magenta.'),

  # ── m3 BASTION — colony siege crawler (ice)
  'm3_bastion_body': dict(
    aspect='5:4', box=(280, 220), key='green', refs=['m3_bastion_body.png'],
    prompt='Main hull of the BASTION, a colossal colony-siege crawler fortress on four tracked legs, seen from above, '
           'front pointing DOWN. Massive armoured citadel body with frost and ice crust on the plating, four square '
           'tracked track pods at the corners, four round empty pylon pads on outrigger arms, two turret rings on the top '
           'deck (empty sockets), a big central command dome, and at the front (bottom) a pair of heavy blast doors '
           'closed over a cannon bay. Cold blue-grey steel, bronze trim, hazard stripes, thin hot-pink energy seams.'),
  'm3_bastion_cannon': dict(
    aspect='9:16', box=(44, 100), key='green', refs=['m3_bastion_cannon.png'], tight=True,
    prompt='A huge lance cannon barrel seen from above pointing straight DOWN: segmented heavy barrel with coils and '
           'cooling fins, glowing hot-pink energy rings, a muzzle at the bottom. Vertical.'),
  'm3_bastion_door': dict(
    aspect='9:16', box=(26, 50), key='green', refs=['m3_bastion_door.png'],
    prompt='One heavy armoured blast door panel seen from above, tall rectangle, thick riveted steel with frost, '
           'hazard stripes along one edge. Vertical.'),
  'm3_bastion_pylon': dict(
    aspect='1:1', box=(40, 40), key='green', refs=['m3_bastion_pylon.png'],
    prompt='A shield generator pylon seen from above: octagonal armoured base with a glowing cyan energy crystal on top '
           'and hazard-striped edge, frosted metal. Centred.'),
  'm3_bastion_pylon_dead': dict(
    aspect='1:1', box=(40, 40), key='green', refs=['art:m3_bastion_pylon'],
    prompt='Exactly the same shield pylon as the reference, but destroyed: crystal shattered and dark, burnt metal, '
           'cracks, no glow. Same framing and size.'),
  'm3_bastion_gun': dict(
    aspect='1:1', box=(40, 40), key='green', refs=['m3_bastion_gun.png'],
    prompt='A heavy mortar turret base seen from above: round armoured turret housing with a hatch and sensor, frosted '
           'steel, bronze trim. No barrel. Centred.'),
  'm3_bastion_gun_barrel': dict(
    aspect='9:16', box=(30, 56), key='green', refs=['m3_bastion_gun_barrel.png'], tight=True,
    prompt='A short thick twin mortar barrel seen from above, pointing straight DOWN, steel with a reinforced breech '
           'at the top. Vertical.'),
  'm3_bastion_rubble': dict(
    aspect='5:4', box=(280, 220), key='green', refs=['art:m3_bastion_body'],
    prompt='Exactly the same crawler fortress as the reference image, but destroyed: burnt-out, collapsed plating, '
           'smoking holes, broken tracks, debris. Same framing, size and silhouette.'),

  # ── m5 WARDEN — dock defence core
  'm5_warden_core': dict(
    aspect='1:1', box=(110, 110), key='green', refs=['m5_warden_core.png'],
    prompt='The WARDEN, a spherical defence core of a space dock seen from above: heavy armoured sphere with concentric '
           'plates, a vertical slit iris in the middle with a glowing cyan eye, gun ports, hot-pink energy seams. Centred, circular.'),
  'm5_warden_seg': dict(
    aspect='16:9', box=(40, 26), key='green', refs=['m5_warden_seg.png'],
    prompt='One curved armour segment of a rotating shield ring seen from above: thick curved slab of plating with '
           'rivets and a thin cyan light strip. Wider than tall.'),
  'm5_warden_node': dict(
    aspect='1:1', box=(30, 30), key='green', refs=['m5_warden_node.png'],
    prompt='A small laser emitter node seen from above: hexagonal armoured housing with a glowing hot-pink crystal lens. Centred.'),

  # ── m6 REVENANT — stitched dreadnought (ship graveyard)
  'm6_rev_hull': dict(
    aspect='9:16', box=(300, 540), key='green', refs=['m6_rev_hull.png'],
    prompt='The REVENANT, a dreadnought stitched together from the wrecks of many dead warships, seen from above, bow '
           'pointing DOWN. Long hull made of mismatched hull sections of different colours and ages welded and cabled '
           'together, exposed girders, scorch marks, glowing hot-pink weld seams and cables holding it together, a '
           'central armoured spine, a round reactor housing in the middle. Huge and grim.'),
  'm6_rev_spars': dict(
    aspect='21:9', box=(780, 260), key='green', refs=['m6_rev_spars.png'],
    prompt='The two enormous wings of a dreadnought stitched together from dead warships, seen from above. The image is '
           'filled edge to edge: on the left half one massive wing, on the right half its mirror, each built from several '
           'large broken battleship hull slabs, gun decks and armour plates riveted and cabled together into one long '
           'heavy shape that tapers toward the outer tip. Between the two wings, in the exact centre, a narrow vertical '
           'slot (about one tenth of the width) is left empty for the main hull. Weathered grey steel, rust, burn marks, '
           'glowing hot-pink stitched seams. Massive, dense, very wide.'),
  'm6_rev_bow': dict(
    aspect='4:5', box=(96, 120), key='green', refs=['m6_rev_bow.png'],
    prompt='The armoured bow ram of a stitched warship seen from above, pointing DOWN: a heavy wedge of welded plates '
           'with a glowing breach cannon slot. Centred.'),
  'm6_rev_engine': dict(
    aspect='4:5', box=(60, 76), key='green', refs=['m6_rev_engine.png'],
    prompt='A salvaged ship engine pod seen from above, exhaust at the top: armoured cylinder with intake rings, '
           'cables, glowing hot-pink thruster core. Centred.'),
  'm6_rev_missile': dict(
    aspect='4:5', box=(52, 60), key='green', refs=['m6_rev_missile.png'],
    prompt='A boxy salvaged missile rack seen from above: a 3x3 grid of missile tubes with warheads visible, welded '
           'to scrap plating. Centred.'),
  'm6_rev_plate': dict(
    aspect='9:16', box=(58, 96), key='green', refs=['m6_rev_plate.png'],
    prompt='A large armour plate slab bolted onto a hull with heavy clamps and cables, seen from above, cracked and '
           'scorched, pink glowing seam. Vertical.'),
  'm6_turret': dict(
    aspect='1:1', box=(36, 36), key='green', refs=['m6_turret.png'],
    prompt='A small salvaged gun turret base seen from above: round armoured housing, no barrel, rusty, pink sensor '
           'light. Centred.'),

  # ── m7 THE CHOIR — the Heart (final boss)
  'm7_heart': dict(
    aspect='1:1', box=(150, 150), key='green', refs=['m7_heart.png'],
    prompt='The CHOIR HEART, the final boss: a huge biomechanical heart of a machine intelligence seen from above, '
           'dark crimson-magenta flesh laced with glowing hot-pink veins, encased in a cage of curved bone-white and '
           'brass ribs, cables plugging into it, a dark pulsing pupil-like opening in the centre. Menacing and alive. Centred.'),
  'm7_pipe': dict(
    aspect='9:16', box=(40, 140), key='green', refs=['m7_pipe.png'], tight=True,
    prompt='A tall organ pipe cannon seen from above pointing straight DOWN: brass and bone pipe with ring bands, '
           'glowing hot-pink resonance slits, a flared mouth at the bottom. Vertical, narrow.'),
  'm7_voice': dict(
    aspect='1:1', box=(60, 60), key='green', refs=['m7_voice.png'],
    prompt='A singing "voice" node seen from above: a round brass speaker horn with bone fins and a glowing pink '
           'membrane vibrating in the centre. Centred, circular.'),
  'm7_petal': dict(
    aspect='9:16', box=(44, 74), key='green', refs=['m7_petal.png'],
    prompt='A curved armour petal made of polished bone and brass seen from above, pointed at both ends, with a thin '
           'pink glowing line along its spine. Vertical.'),
  'm7_wall_l': dict(
    aspect='16:9', box=(300, 176), key='green', refs=['m7_wall_l.png'],
    prompt='The left half of a fortified biomechanical organ wall seen from above: a row of four tall brass-and-bone organ '
           'pipes bound by curved bone bars and cables over dark armour, glowing pink veins, and at the right edge a '
           'segment of a huge round iris door. Wider than tall.'),

  # ── GARDEN — the Gardener (secret)
  'garden_core': dict(
    aspect='1:1', box=(150, 150), key='magenta', refs=[], hue_clean=False, style='soft',
    prompt='The GARDENER, an ancient serene being from a dream garden, seen from above. NOT a machine: no metal, no rust, '
           'no bolts, no gears. A radiant flower-like mandala of polished white porcelain and mother-of-pearl petals in '
           'twelve-fold symmetry, inlaid with thin gold filigree, around a glowing pale jade and aquamarine crystal '
           'hexagon, and at its very centre a calm golden eye. Soft luminous pastel light, ethereal, sacred, beautiful. '
           'Centred, circular. NO pink, NO magenta.'),
  'garden_petal': dict(
    aspect='9:16', box=(50, 96), key='magenta', refs=[], hue_clean=False, style='soft',
    prompt='A single long luminous crystal petal seen from above, NOT metal: translucent pale lavender, lilac and white '
           'crystal, faceted like a gemstone, pointed at both ends, with a glowing white light running along its central '
           'vein. Soft, ethereal, beautiful. Vertical. NO pink, NO magenta.'),

  # ── missiles (drawn nose UP; the engine flame is drawn live by the renderer)
  'enemy_missile': dict(
    aspect='9:16', box=(12, 26), key='green', refs=[], tight=True, rot180=True,
    prompt='A single small enemy guided missile seen from directly above, pointing straight UP: slim dark gunmetal '
           'cylindrical body with panel seams and a thin hazard band, a glowing hot-pink warhead nose cone at the top, '
           'four small swept tail fins at the bottom, a dark engine nozzle at the very bottom with NO flame. Vertical, narrow.'),
  'shot_missile': dict(
    aspect='3:4', box=(9, 17), key='green', refs=[], style='soft',
    prompt='A single small stubby homing rocket, NOT a spaceship, seen from directly above, pointing straight UP. Its '
           'length is only about THREE times its width. Ivory-white body with a bright orange pointed nose cone taking the '
           'top third, a thin orange band, four short swept orange tail fins flaring out at the bottom, a dark engine '
           'nozzle at the very bottom, NO flame. Small panel details and a soft metallic sheen. Centred, compact.'),
  'shot_viper': dict(
    aspect='3:4', box=(10, 19), key='green', refs=['art:shot_missile'], style='soft',
    prompt='The same stubby homing rocket design as the reference image (same angle, pointing straight UP, same proportions), '
           'but a heavier variant: warm peach-copper body, a deep red-orange nose cone, darker copper tail fins, a dark '
           'nozzle at the bottom, NO flame. Centred, compact.'),
}

# Assets made from other generated art instead of a new generation: (operation, source asset).
DERIVED = {
  'm2_tide_hull_l': ('split_left', 'm2_tide_hull'),
  'm2_tide_hull_r': ('split_right', 'm2_tide_hull'),
  'm7_wall_r': ('mirror', 'm7_wall_l'),
}


def derive(op, src):
    im = Image.open(os.path.join(OUT, f'{src}.webp')).convert('RGBA')
    if op == 'mirror':
        return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # split a hull down its keel with a ragged tear, keeping the full canvas so offsets stay the same
    a = np.asarray(im).copy()
    h, w = a.shape[:2]
    rng = np.random.default_rng(7)
    edge = (w / 2 + np.cumsum(rng.normal(0, 1.4, h)).clip(-w * 0.06, w * 0.06)).astype(int)
    xs = np.arange(w)[None, :]
    keep = xs < edge[:, None] if op == 'split_left' else xs >= edge[:, None]
    a[..., 3] = np.where(keep, a[..., 3], 0)
    return Image.fromarray(a, 'RGBA')


def api_key():
    k = os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
    if not k: sys.exit('GEMINI_API_KEY not set')
    return k


def generate(name, spec):
    key_rgb, keyhex, keyname = KEYS[spec['key']]
    style = SOFT_STYLE if spec.get('style') == 'soft' else STYLE
    text = spec['prompt'] + '\n\n' + style.format(key=keyname, keyhex=keyhex, keyname=keyname)
    parts = [{'text': text}]
    for r in spec.get('refs', []):
        p = os.path.join(OUT, r[4:] + '.webp') if r.startswith('art:') else os.path.join(REF, r)
        if os.path.exists(p):
            parts.append({'inline_data': {'mime_type': 'image/webp' if p.endswith('.webp') else 'image/png', 'data': base64.b64encode(open(p, 'rb').read()).decode()}})
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


def chroma_key(img: Image.Image, key_rgb: tuple, hue_clean=True) -> Image.Image:
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
    if hue_clean:
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


def save(im, name):
    # lossy WebP with alpha: ~5x smaller than PNG for painted art, no visible loss at game scale
    im.save(os.path.join(OUT, f'{name}.webp'), 'WEBP', quality=88, method=6, alpha_quality=95)


def main():
    args = sys.argv[1:]
    key_only = '--key-only' in args
    names = [a for a in args if not a.startswith('--')] or list(A) + list(DERIVED)
    os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)
    for n in names:
        if n in DERIVED:
            save(derive(*DERIVED[n]), n)
            print(f'{n}: derived', flush=True)
            continue
        spec = A[n]
        raw = os.path.join(RAW, f'{n}.png')
        if not key_only or not os.path.exists(raw):
            print(f'{n}: generating', flush=True)
            open(raw, 'wb').write(generate(n, spec))
        img = Image.open(raw)
        keyed = chroma_key(img, KEYS[spec['key']][0], spec.get('hue_clean', True))
        # the model sometimes paints a pointed thing the wrong way round; fix the take instead of paying for another
        if spec.get('rot180'): keyed = keyed.rotate(180)
        out = fit(keyed, spec['box'], spec.get('tight', False))
        save(out, n)
        print(f'{n}: {img.size} -> {out.size}', flush=True)
    man = {}
    for n in list(A) + list(DERIVED):
        f = os.path.join(OUT, f'{n}.webp')
        if os.path.exists(f):
            w, h = Image.open(f).size
            man[n] = {'w': round(w / ART_SCALE), 'h': round(h / ART_SCALE)}
    json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)


if __name__ == '__main__':
    main()
