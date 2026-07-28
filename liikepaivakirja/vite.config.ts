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
 * ---- Offline, second attempt --------------------------------------------
 *
 * The first attempt shipped a worker that precached index.html and served it
 * cache-first. That topology can pin a device to a broken shell with no way out
 * on iOS, so this one is built differently in three ways.
 *
 * 1. The worker is emitted as `service-worker.js`, not `sw.js`. `public/sw.js` is
 *    still the self-destroying kill switch from the rollback, so any device that
 *    never came back and still holds the old workbox worker gets it retired on its
 *    next visit. Keeping the two at separate URLs means neither can shadow the
 *    other. `public/sw.js` can be deleted once every device has loaded the app
 *    once with a network connection.
 *
 * 2. Navigations are **NetworkFirst**, not cache-first, and `navigateFallback` is
 *    off. Hashed assets are immutable so precaching them cache-first is safe, but
 *    the HTML entry point is the one file whose staleness can brick the app. When
 *    online it is always fetched fresh, so a fixed deploy heals on one refresh;
 *    when offline the cached copy is served. This removes the failure mode rather
 *    than adding a remedy for it.
 *
 * 3. BUILD_ID is compiled in and shown in the app, so "did the deploy actually
 *    take effect" is answerable by looking, not by inference.
 */
const buildId = () => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : "local";
  return `${stamp} · ${sha}`;
};

export default defineConfig(({ mode }) => {
  const single = mode === "single";
  const base = single ? "./" : process.env.BASE_PATH ?? "/liikepaivakirja/";
  return {
    base,
    define: { __BUILD_ID__: JSON.stringify(buildId()) },
    plugins: [
      react(),
      ...(single
        ? [viteSingleFile()]
        : [
            VitePWA({
              /* registration is ours: see src/platform/sw.ts for the escape
                 hatches that the plugin's automatic registration would bypass */
              injectRegister: null,
              registerType: "prompt",
              filename: "service-worker.js",
              /* public/manifest.webmanifest is hand-written and linked from
                 index.html; generating a second one would be two sources of
                 truth for the icons and the name */
              manifest: false,
              workbox: {
                /* hashed assets and icons only — never the HTML */
                globPatterns: ["assets/**/*.{js,css}", "*.{png,svg,ico,webmanifest}"],
                globIgnores: ["**/sw.js", "**/service-worker.js"],
                navigateFallback: null,
                cleanupOutdatedCaches: true,
                skipWaiting: false,
                clientsClaim: false,
                runtimeCaching: [
                  {
                    /* the entry point: fresh when online, cached when not */
                    urlPattern: ({ request }) => request.mode === "navigate",
                    handler: "NetworkFirst",
                    options: {
                      cacheName: "shell",
                      networkTimeoutSeconds: 4,
                      expiration: { maxEntries: 4 },
                      cacheableResponse: { statuses: [200] },
                    },
                  },
                ],
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
