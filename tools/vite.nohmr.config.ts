import { defineConfig } from 'vite'

/** Dev server for automated playtests: no HMR/auto-reload, so edits elsewhere don't reset a running test page. */
export default defineConfig({
  root: new URL('..', import.meta.url).pathname,
  server: { host: '127.0.0.1', hmr: false },
})
