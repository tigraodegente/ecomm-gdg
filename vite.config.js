import { defineConfig } from 'vite';

export default defineConfig({
  ssr: {
    // Evitar problemas com pacotes CJS em ambiente ESM
    noExternal: ['cookie', '**/node_modules/cookie/**', 'jsonwebtoken']
  },
  build: {
    // Corrige problemas com crypto em ambiente Cloudflare
    rollupOptions: {
      external: ['node:crypto']
    }
  },
  optimizeDeps: {
    // Evitar problemas de pré-bundling com módulos ESM
    exclude: ['cookie', 'jsonwebtoken']
  }
});