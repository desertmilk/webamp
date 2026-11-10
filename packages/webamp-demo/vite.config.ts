import { defineConfig } from "vite";
import nodePolyfills from "rollup-plugin-polyfill-node";
import { fileURLToPath } from "node:url";

export default defineConfig({
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 2500,
    rollupOptions: {
      input: {
        main: "index.html",
        skinEditor: "skin-editor.html",
      },
    },
  },
  resolve: {
    alias: {
      "webamp/lazy": fileURLToPath(
        new URL("../webamp/js/webampLazy.tsx", import.meta.url)
      ),
    },
  },
  assetsInclude: ["**/*.wsz", "**/*.mp3"],
  plugins: [
    // Needed for music-metadata-browser which uses polyfillable node APIs
    nodePolyfills(),
  ],
});
