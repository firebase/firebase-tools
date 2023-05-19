import { AppSpec } from "../interfaces";

/**
 * Discover framework in the given project directory
 */
export function discover(): AppSpec {
  return {
    baseImage: "node:18",
    environmentVariables: {
      NODE_ENV: "PRODUCTION",
    },
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    afterInstall: (b) => {
      console.log("HOOK: AFTER INSTALL");
      return { version: "v1alpha", notes: "afterInstall" };
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    afterBuild(b) {
      console.log("HOOK: AFTER BUILD");
      return { version: "v1alpha", notes: "afterBuild" };
    },
  };
}
