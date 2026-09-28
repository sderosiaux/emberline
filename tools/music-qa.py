"""Ask Gemini (audio understanding) to review each generated track against its brief.
usage: python3 tools/music-qa.py [track ...]  -> prints a JSON verdict per track."""
import base64, json, os, sys, urllib.request, importlib.util
spec = importlib.util.spec_from_file_location('gen', os.path.join(os.path.dirname(__file__), 'generate-music.py'))
gen = importlib.util.module_from_spec(spec); spec.loader.exec_module(gen)
MODEL = os.environ.get('QA_MODEL', 'gemini-2.5-flash')

def review(track):
    data = base64.b64encode(open(os.path.join(gen.OUT, f'{track}.mp3'), 'rb').read()).decode()
    prompt = (f'You are a strict game-audio director. Brief for this track: "{gen.TRACKS[track]}". '
              'Listen to the whole file and answer ONLY a JSON object with keys: '
              '"vocals" (true if ANY human voice, singing, humming, choir with words or spoken words is audible), '
              '"vocal_details" (where/what, or ""), "brief_match" (1-10), "quality" (1-10, production/musicality), '
              '"energy" (1-10), "loop_ok" (true if the last seconds would flow naturally back into the first seconds: no fade-out, no final stop, similar tempo/texture), '
              '"description" (one sentence), "issues" (short list).')
    body = {'contents': [{'parts': [{'inline_data': {'mime_type': 'audio/mpeg', 'data': data}}, {'text': prompt}]}],
            'generationConfig': {'responseMimeType': 'application/json'}}
    req = urllib.request.Request(f'https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent',
                                 data=json.dumps(body).encode(), method='POST',
                                 headers={'Content-Type': 'application/json', 'x-goog-api-key': os.environ['GEMINI_API_KEY']})
    with urllib.request.urlopen(req, timeout=300) as r:
        d = json.load(r)
    return json.loads(d['candidates'][0]['content']['parts'][0]['text'])

if __name__ == '__main__':
    for t in sys.argv[1:] or list(gen.TRACKS):
        try:
            print(t, json.dumps(review(t), ensure_ascii=False), flush=True)
        except Exception as e:
            print(t, 'ERROR', e, flush=True)
