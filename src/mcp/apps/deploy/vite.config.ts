import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import * as path from "path";

export default defineConfig({
  plugins: [viteSingleFile()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../../../../lib/mcp/apps/deploy"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "mcp-app.html"),
    },
  },
});
