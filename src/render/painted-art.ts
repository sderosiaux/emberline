import { defineSprite } from './sprites'

/**
 * Painted boss art (generated offline by tools/generate-art.py into public/art/). Each image
 * replaces the procedural sprite of the same key once it has loaded; until then, or if a file
 * is missing, the procedural sprite stays. Bosses check `hasPainted` where the painted art
 * needs a different layout from the procedural one.
 */
const BASE = `${import.meta.env.BASE_URL}art/`
/** Matches ART_SCALE in tools/generate-art.py. */
const ART_SCALE = 3

const loaded = new Set<string>()
export const hasPainted = (key: string) => loaded.has(key)

export async function loadPaintedArt() {
  let man: Record<string, { w: number; h: number }>
  try {
    const r = await fetch(`${BASE}manifest.json`)
    if (!r.ok) return
    man = await r.json()
  } catch { return }
  await Promise.all(Object.entries(man).map(([key, { w, h }]) => new Promise<void>((done) => {
    const img = new Image()
    img.onload = () => {
      defineSprite(key, w, h, (c) => c.drawImage(img, 0, 0, w, h), false, ART_SCALE)
      loaded.add(key)
      done()
    }
    img.onerror = () => done()
    img.src = `${BASE}${key}.webp`
  })))
}
