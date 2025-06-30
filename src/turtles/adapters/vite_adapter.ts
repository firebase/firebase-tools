import { PlatformAdapter, PackageManager } from "../interfaces";

// https://github.com/firebase/firebase-tools/blob/master/src/frameworks/vite/index.ts
export const ViteAdapter: PlatformAdapter = {
  create: {},
  parentId: "npm",
  id: "vite",
  discover: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "vite",
    },
    required_files: ["package.json"],
    optional_files: ["vite.config.js", "vite.config.ts"],
  },
};
