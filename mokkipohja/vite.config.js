import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

/* Two build targets from one codebase:
 *
 *   npm run build          -> dist/         deployed to GitHub Pages
 *   npm run build:single   -> dist-single/  one self-contained .html
 *
 * The deploy workflow sets BASE_PATH=/mokkipohja/; the default matches it so a
 * local build behaves like the published one.
 */
export default defineConfig(({ mode }) => {
  const single = mode === "single";
  return {
    base: single ? "./" : (process.env.BASE_PATH ?? "/mokkipohja/"),
    plugins: [react(), ...(single ? [viteSingleFile()] : [])],
    build: {
      outDir: single ? "dist-single" : "dist",
      emptyOutDir: true,
      target: "es2020",
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.{js,jsx}"],
    },
  };
});
