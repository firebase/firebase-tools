import { merge } from "lodash";
import { config as baseConfig, vscodeConfigs } from "./default_wdio.conf";
import * as path from "path";

const emptyPath = path.resolve(process.cwd(), "src/test/test_projects/empty");

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: ["./integration/empty/**/*.ts"],
  maxInstances: 1,
  capabilities: [
    merge(vscodeConfigs, {
      "wdio:vscodeOptions": { workspacePath: emptyPath },
    }),
  ],
};
