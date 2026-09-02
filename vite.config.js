import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: { port: 3000, open: true },
  build: {
    target: 'esnext',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        supertonic: resolve(__dirname, 'supertonic.html')
      }
    }
  },
  optimizeDeps: { exclude: ['onnxruntime-web'] }
});
