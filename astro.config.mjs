import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";
import alpinejs from "@astrojs/alpinejs";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  integrations: [
    tailwind(),
    alpinejs({
      entrypoint: "/src/entrypoint"
    })
  ],
  output: "server",
  adapter: cloudflare({
    mode: "directory",
    functionPerRoute: false,
    routes: {
      strategy: "include",
      include: [
        "/api/*", 
        "/produtos/*", 
        "/produto/*", 
        "/marketplace-*", 
        "/carrinho", 
        "/checkout"
      ]
    },
    runtime: {
      mode: "local",
      persistTo: "./node_modules/.cloudflare"
    }
  })
});