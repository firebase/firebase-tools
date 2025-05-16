import { join } from "path";
import { Setup } from "../..";
import { input } from "../../../prompt";
import { Config } from "../../../config";
import { readTemplateSync } from "../../../templates";

const SMOKE_TEST_YAML_TEMPLATE = readTemplateSync("init/apptesting/smoke_test.yaml");

export interface RequiredInfo {
  testDir: string;
}

export async function askQuestions(setup: Setup): Promise<void> {
  setup.featureInfo = {
    ...setup.featureInfo,
    apptesting: {
      testDir: setup.featureInfo?.apptesting?.testDir ||
        (await input({
          message: "What do you want to use as your test directory?",
          default: "tests",
        }))
    }
  }
}

export async function actuate(setup: Setup, config: Config): Promise<void> {
  const info = setup.featureInfo?.apptesting;
  if (!info) {
    throw new Error("App Testing feature RequiredInfo is not provided");
  }
  const testDir = info.testDir;
  config.set("apptesting.testDir", testDir);
  await config.askWriteProjectFile(join(testDir, "smoke_test.yaml"), SMOKE_TEST_YAML_TEMPLATE);
}
