import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "safari15",
    rollupOptions: {
      input: [
        fileURLToPath(new URL("./index.html", import.meta.url)),
        fileURLToPath(new URL("./previews/snow-whale/index.html", import.meta.url)),
      ],
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
});
