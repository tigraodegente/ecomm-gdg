import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import cloudflare from "@astrojs/cloudflare";
import db from "@astrojs/db";

// https://astro.build/config
export default defineConfig({
  integrations: [
    db(),
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    })
  ],
  output: "server",
  adapter: cloudflare({
    mode: 'directory',
    runtime: {
      mode: 'local',
      persistTo: './.cloudflare/wrangler-local-state'
    },
    imageService: 'cloudflare'
  }),
  vite: {
    build: {
      minify: 'terser',
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            'alpine': ['alpinejs'],
            'flexsearch': ['flexsearch']
          }
        }
      }
    }
  }
});
