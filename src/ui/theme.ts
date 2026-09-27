/**
 * Design tokens shared by the DOM UI (as CSS variables) and the canvas HUD.
 * Light "flight manual" identity: warm paper, ink, ember accent.
 */
export const T = {
  paper: '#f4f0e6',
  paper2: '#ebe5d6',
  paper3: '#dfd7c4',
  line: '#cfc6b0',
  ink: '#1c1a22',
  ink2: '#4a4552',
  muted: '#857d6c',
  ember: '#ff6a13',
  emberDeep: '#c94a06',
  shield: '#1aa7c9',
  hull: '#e0463b',
  energy: '#e6a800',
  energyLow: '#e0463b',
  credit: '#6aa10f',
  special: '#f07c1c',
  core: '#8a5cf0',
  good: '#2f9e5b',
  bad: '#d23b3b',
  fontHead: '"Chakra Petch", "Avenir Next Condensed", system-ui, sans-serif',
  fontMono: '"JetBrains Mono", ui-monospace, Menlo, monospace',
} as const

export function applyCssTokens(root: HTMLElement) {
  for (const [k, v] of Object.entries(T)) root.style.setProperty(`--${k}`, v)
}
