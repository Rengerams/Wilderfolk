import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [inspectAttr(), react()],
  server: {
    // Port 3000 is in Windows Hyper-V excluded range 2944–3043 on many PCs (EACCES).
    port: 5173,
    host: '127.0.0.1',
    strictPort: false,
    open: true,
  },
  preview: {
    port: 4173,
    host: '127.0.0.1',
    strictPort: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("react-dom") || id.includes("/react/")) return "react";
            return;
          }
          if (id.includes("/src/game/") || id.includes("/src/audio/")) return "game";
        },
      },
    },
  },
});
