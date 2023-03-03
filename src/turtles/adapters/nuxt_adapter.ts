import { PlatformAdapter, PackageManager } from "../interfaces";

export const NuxtAdapter: PlatformAdapter = {
  parentId: "npm",
  id: "nuxt",
  create: {},
  discovery: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "nuxt",
    },
    required_files: ["package.json"],
  },
};
