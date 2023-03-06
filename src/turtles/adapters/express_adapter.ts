import { PlatformAdapter, PackageManager } from "../interfaces";

export const ExpressAdapter: PlatformAdapter = {
  parentId: "npm",
  id: "express",

  create: {
    install_command: "npm install",
    develop_command: "npm start",
    run_command: "NODE_ENV=production npm start",
    output_directory: "public",
  },

  discover: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "express",
    },
    required_files: ["package.json"],
  },
};
