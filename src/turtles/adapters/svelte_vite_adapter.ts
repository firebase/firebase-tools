import { PlatformAdapter, PackageManager } from "../interfaces";

// https://github.com/firebase/firebase-tools/blob/master/src/frameworks/svelte/index.ts
export const SvelteViteAdapter: PlatformAdapter = {
  parentId: "vite",
  id: "svelte_vite",
  create: {},
  discover: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "vite-plugin-svelte",
    },
    required_files: ["package.json"],
  },
};
