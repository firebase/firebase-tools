import { config as baseConfig } from "./default_wdio.conf";
import type { Options } from "@wdio/types";

export const config: Options.Testrunner = {
  ...baseConfig,
  specs: ["./integration/empty/**/*.ts"],
};
