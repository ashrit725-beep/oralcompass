import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Parallel local runs (worktrees, review agents) point the dev/preview proxy at their own API port; the default matches docs/WEB_FOUNDATION_NOTES.md.
const apiTarget = process.env.ORALCOMPASS_API_TARGET ?? "http://127.0.0.1:8000";
const apiProxy = { "/api": { target: apiTarget, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api/, "") } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  build: {
    rollupOptions: {
      onwarn(warning, warn) {
        // Registry files carry "use client"; harmless in Vite, noisy in the build log.
        if (warning.code === "MODULE_LEVEL_DIRECTIVE" && /use client/.test(warning.message)) return;
        warn(warning);
      },
      output: {
        // pdf.js never enters the main chunk; the motion chunk (motion + its framer-motion/motion-dom internals) is cached across views.
        manualChunks(id) {
          if (id.includes("node_modules/pdfjs-dist")) return "pdfjs";
          if (/node_modules\/(motion|framer-motion|motion-dom|motion-utils)\//.test(id)) return "motion";
          // react + the Radix/vaul primitives are stable across releases of our own code: a separate cached chunk keeps the app chunk under
          // Rollup's 500 kB advisory (the budget check still measures the index-* chunk).
          if (/node_modules\/(react|react-dom|scheduler|radix-ui|@radix-ui|vaul)\//.test(id)) return "ui-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    port: 4173,
    proxy: apiProxy,
  },
});
