import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    target: "safari15",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
});
