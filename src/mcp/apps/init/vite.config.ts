import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [viteSingleFile()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../../../../lib/mcp/apps/init"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "mcp-app.html"),
    },
  },
});
