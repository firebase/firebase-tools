import { PlatformAdapter, PackageManager } from "../interfaces";

export const ReactJsAdapter: PlatformAdapter = {
  parentId: "npm",
  id: "reactjs",
  create: {},
  discovery: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "react",
    },
    required_files: ["package.json"],
  },
};
