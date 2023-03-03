import { PlatformAdapter, PackageManager } from "../interfaces";

export const PreactViteAdapter: PlatformAdapter = {
  parentId: "vite",
  id: "preact_vite",
  create: {},
  discovery: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "preact",
    },
    required_files: ["package.json"],
  },
};
