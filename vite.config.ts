import { defineConfig } from 'vite';

// Relative base so the same build works on GitHub Pages
// (https://precis60.github.io/golf-course-tycoon/) and local preview.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
});
