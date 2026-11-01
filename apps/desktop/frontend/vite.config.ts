import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The bundle is served by the Go backend (internal/server), never by a dev
// server: the app must look exactly like it does in the Wails webview, and the
// same-origin /v1 proxy is what makes that possible. Iterate with
// `bun run build --watch` next to `go run . -serve`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    target: "es2022",
  },
});
