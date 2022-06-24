import * as fs from "fs";
import * as path from "path";

import { Config } from "../../../config";
import { promptOnce } from "../../../prompt";
import { LATEST_VERSION, runWithVirtualEnv } from "../../../deploy/functions/runtimes/python";
import { getHumanFriendlyRuntimeName, PYTHON_RUNTIMES } from "../../../deploy/functions/runtimes";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/python");
const MAIN_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "main.py"), "utf8");
const REQUIREMENTS_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "requirements.txt"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

/**
 * Create a Python Firebase Functions project.
 */
export async function setup(_setup: unknown, config: Config): Promise<void> {
  await config.askWriteProjectFile(
    `${Config.DEFAULT_FUNCTIONS_SOURCE}/requirements.txt`,
    REQUIREMENTS_TEMPLATE
  );
  await config.askWriteProjectFile(
    `${Config.DEFAULT_FUNCTIONS_SOURCE}/.gitignore`,
    GITIGNORE_TEMPLATE
  );
  await config.askWriteProjectFile(`${Config.DEFAULT_FUNCTIONS_SOURCE}/main.py`, MAIN_TEMPLATE);

  // Prompt for runtime selection.
  const runtimeVersion = await promptOnce({
    type: "rawlist",
    message: "Which Python version do you want to use?",
    choices: PYTHON_RUNTIMES.reverse().map((r) => ({
      name: `${getHumanFriendlyRuntimeName(r)} (${r})`,
      value: r,
    })),
    default: LATEST_VERSION,
  });

  // Write the selected runtime version to the config.
  config.set("functions.runtime", runtimeVersion);
  // Setup VENV.
  await runWithVirtualEnv(
    ["python3", "-m", "venv", "venv"],
    config.path(Config.DEFAULT_FUNCTIONS_SOURCE),
    false
  ).promise;
  // Install dependencies.
  await runWithVirtualEnv(
    ["python3", "-m", "pip", "install", "-r", "requirements.txt"],
    config.path(Config.DEFAULT_FUNCTIONS_SOURCE)
  ).promise;
}
