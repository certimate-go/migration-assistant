import path from "node:path";

import tailwindcssPlugin from "@tailwindcss/vite";
import legacyPlugin from "@vitejs/plugin-legacy";
import reactPlugin from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile as singleFilePlugin } from "vite-plugin-singlefile";

export default defineConfig(() => {
  return {
    plugins: [
      reactPlugin({}),
      legacyPlugin({
        targets: ["defaults", "not IE 11"],
        modernTargets: "chrome>=111, firefox>=113, safari>=15.4",
        polyfills: true,
        modernPolyfills: true,
        renderLegacyChunks: false,
        renderModernChunks: true,
      }),
      tailwindcssPlugin(),
      singleFilePlugin(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
