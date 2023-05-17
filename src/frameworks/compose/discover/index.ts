import { AppSpec } from "../interfaces";

/**
 * Discover framework in the given project directory
 */
export function discover(dir: string): AppSpec {
  return {
    baseImage: "node:18",
    environmentVariables: {
      NODE_ENV: "PRODUCTION",
    },
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",

    afterInstall: () => {
      return (b) => {
        console.log("HOOK: AFTER INSTALL");
        return { version: "v1alpha" };
      };
    },

    afterBuild: () => {
      return (b) => {
        console.log("HOOK: AFTER BUILD");
        return { version: "v1alpha" };
      };
    },
  };
}
