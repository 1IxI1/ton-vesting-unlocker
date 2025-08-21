import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // whether to polyfill specific globals
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    allowedHosts: ['c0d32de0b98b.ngrok-free.app', 'unlocker.ton.org', '1ixi1.github.io'],
  },
})
