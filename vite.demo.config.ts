import { defineConfig } from 'vite'
import { resolve } from 'path'

// Demo-only vite config. Kept separate from any library build config so the
// published artifact is unaffected by how the demo page is bundled.
export default defineConfig({
  root: 'demo',
  base: './',
  resolve: {
    alias: {
      // Import the library by its published name; resolve to working-tree src.
      '@dank-inc/super-mouse': resolve(__dirname, 'src'),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
