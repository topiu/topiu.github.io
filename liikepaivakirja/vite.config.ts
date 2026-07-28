import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { VitePWA } from "vite-plugin-pwa";

/* Two build targets from one codebase:
 *
 *   npm run build          -> dist/        deployed to GitHub Pages
 *   npm run build:single   -> dist-single/ one self-contained .html
 *
 * BASE_PATH defaults to a project-site subpath so publishing does not disturb
 * whatever else lives at the root of topiu.github.io. Set BASE_PATH=/ if you
 * do want the app to own the root of the user site.
 *
 * The service worker is deliberately absent from the single-file build: that
 * target exists to be a portable file opened from disk, where a worker has
 * nothing to cache and no origin to be scoped to.
 *
 * Scope matters more than usual here. sw.js is emitted next to index.html, so at
 * /liikepaivakirja/ its scope is /liikepaivakirja/ and it cannot touch the other
 * things published on the same github.io origin. A root-scoped worker would
 * silently take over the landing page and every sibling project.
 */
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  const base = single ? "./" : process.env.BASE_PATH ?? "/liikepaivakirja/";
  return {
    base,
    plugins: [
      react(),
      ...(single
        ? [viteSingleFile()]
        : [
            VitePWA({
              /* registration lives in src/platform/sw.ts: a diary should not be
                 swapped out from under an unsaved edit, so the update is offered
                 rather than applied, and that needs UI we control */
              injectRegister: null,
              registerType: "prompt",
              /* public/manifest.webmanifest is hand-written and linked from
                 index.html; generating a second one would be two sources of
                 truth for the icons and the name */
              manifest: false,
              workbox: {
                globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
                navigateFallback: `${base}index.html`,
                cleanupOutdatedCaches: true,
                /* the new worker waits until the user says so */
                skipWaiting: false,
                clientsClaim: false,
              },
              devOptions: { enabled: false },
            }),
          ]),
    ],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      target: "es2020",
    },
  };
});
