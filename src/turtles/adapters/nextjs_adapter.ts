import { PlatformAdapter, PackageManager } from "../interfaces";

// https://github.com/firebase/firebase-tools/blob/master/src/frameworks/next/index.ts#L69
export const NextJsAdapter: PlatformAdapter = {
  parentId: "npm",
  id: "nextjs",

  create: {
    install_command: "npm install",
    build_command: "npm run build",
    develop_command: "next",
    run_command: "NODE_ENV=production npm start",
  },

  discover: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "next",
    },
    required_files: ["package.json"],
    optional_files: ["next.config.js"],
  },
};
