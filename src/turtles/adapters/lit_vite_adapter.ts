import { PlatformAdapter, PackageManager } from "../interfaces";

export const LitViteAdapter: PlatformAdapter = {
  parentId: "vite",
  id: "lit_vite",
  create: {},
  discovery: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "lit",
    },
    required_files: ["package.json"],
  },
};
