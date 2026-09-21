import { defineConfig } from "vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";

/** Browser → Vite → Django. In Docker set API_PROXY_TARGET=http://backend:8000 */
const apiProxyTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";
/** Use 0.0.0.0 in containers so the host can reach the port. */
const listenHost = process.env.VITE_DEV_HOST ?? "127.0.0.1";

const proxy = {
  "/api": { target: apiProxyTarget, changeOrigin: true },
  "/health": { target: apiProxyTarget, changeOrigin: true },
} as const;

export default defineConfig({
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
  ],
  server: {
    host: listenHost,
    port: 8080,
    allowedHosts: [".trycloudflare.com", "localhost", "127.0.0.1"],
    proxy: { ...proxy },
  },
  // Shared public links use `vite preview` (bundled assets) — Vite dev over
  // cloudflared drops hundreds of module requests and leaves login non-interactive.
  preview: {
    host: listenHost,
    port: 8080,
    allowedHosts: [".trycloudflare.com", "localhost", "127.0.0.1"],
    proxy: { ...proxy },
  },
});
