import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /namaz/... is forwarded to namazvakitleri.com.tr so the app can read live prayer times
// (the site does not allow browsers on other sites to read it directly).
const proxy = {
  "/namaz": {
    target: "https://namazvakitleri.com.tr",
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/namaz/, ""),
    headers: { "User-Agent": "Mozilla/5.0 (MyFutureSelf prayer times)" },
  },
  // Login and saved data: run `npx wrangler dev` alongside `npm run dev`.
  "/api": { target: "http://127.0.0.1:8787", changeOrigin: false },
  "/prayer-times.json": { target: "http://127.0.0.1:8787", changeOrigin: false },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false, proxy },
  preview: { proxy },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/gsap") || id.includes("node_modules/@gsap")) return "gsap";
          if (id.includes("node_modules/react") || id.includes("node_modules/scheduler")) return "react";
        },
      },
    },
  },
});
