import { merge } from "lodash";
import { config as baseConfig, vscodeConfigs } from "./default_wdio.conf";
import * as path from "path";
import process from "node:process";

const fishfoodPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood",
);

export const config: WebdriverIO.Config = {
  ...baseConfig,
  // Disable concurrency as tests may write to the same files.
  maxInstances: 1,
  specs: ["./integration/fishfood/**/*.ts"],
  capabilities: [
    merge(vscodeConfigs, {
      "wdio:vscodeOptions": { workspacePath: fishfoodPath },
    }),
  ],
};
