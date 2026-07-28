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
