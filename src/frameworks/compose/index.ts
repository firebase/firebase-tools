import { AppSpec } from "./interfaces";
import { Mode, getDriver } from "./driver";

function discover(): AppSpec {
  return {
    baseImage: "node:18",
    environmentVariables: {
      NODE_ENV: "PRODUCTION",
    },
    installCommand: "npm install",
    buildCommand: "npm run build",
    startCommand: "npm run start",
  };
}

/**
 * Run composer in the specified execution context.
 */
export function run(mode: Mode): void {
  const spec = discover();

  const driver = getDriver(mode, spec);
  driver.install();
  driver.build();
}
