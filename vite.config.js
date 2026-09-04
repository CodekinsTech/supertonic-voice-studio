import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: { port: 3050, open: false },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        studio: resolve(__dirname, 'studio.html'),
        supertonic: resolve(__dirname, 'supertonic.html'),
        wave: resolve(__dirname, 'wave.html'),
        terms: resolve(__dirname, 'terms.html'),
        privacy: resolve(__dirname, 'privacy.html')
      }
    }
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] }
});
