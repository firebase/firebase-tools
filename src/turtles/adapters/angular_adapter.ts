import { PlatformAdapter, PackageManager } from "../interfaces";

// https://github.com/firebase/firebase-tools/blob/master/src/frameworks/angular/index.ts
export const AngularAdapter: PlatformAdapter = {
  id: "angular",
  parentId: "npm",

  create: {},

  discover: {
    required_package_dependency: {
      packageManager: PackageManager.NPM,
      dependency: "@angular/core",
    },
    required_files: ["package.json", "angular.json"],
  },
};
