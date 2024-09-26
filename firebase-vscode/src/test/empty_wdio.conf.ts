import { config as baseConfig } from "./default_wdio.conf";

export const config: WebdriverIO.Config = {
  ...baseConfig,
  specs: ["./integration/empty/**/*.ts"],
  maxInstances: 1,
};
