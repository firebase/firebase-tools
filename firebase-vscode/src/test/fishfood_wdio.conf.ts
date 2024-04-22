import { merge } from "lodash";
import { config as baseConfig, vscodeConfigs } from "./default_wdio.conf";
import type { Options } from "@wdio/types";
import * as path from "path";

const fishfoodPath = path.resolve(
  process.cwd(),
  "src/test/test_projects/fishfood"
);

export const config: Options.Testrunner = {
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
