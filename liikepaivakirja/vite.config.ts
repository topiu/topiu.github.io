import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/* Two build targets from one codebase:
 *
 *   npm run build          -> dist/        deployed to GitHub Pages
 *   npm run build:single   -> dist-single/ one self-contained .html
 *
 * BASE_PATH defaults to a project-site subpath so publishing does not disturb
 * whatever else lives at the root of topiu.github.io. Set BASE_PATH=/ if you
 * do want the app to own the root of the user site.
 *
 * No service worker. `public/sw.js` is a deliberate exception: it is a
 * self-destroying worker whose only job is to retire the one that used to be
 * generated here. See src/platform/sw.ts for why offline was withdrawn. Do not
 * remove that file until every device has loaded the app once without it.
 */
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: single ? "./" : process.env.BASE_PATH ?? "/liikepaivakirja/",
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      target: "es2020",
    },
  };
});
