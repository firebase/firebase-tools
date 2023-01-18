import * as fs from "fs";
import * as path from "path";

import { Config } from "../../../config";
import { LATEST_VERSION } from "../../../deploy/functions/runtimes/python";
import { runWithVirtualEnv } from "../../../functions/python";

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

  // Write the latest supported runtime version to the config.
  config.set("functions.runtime", LATEST_VERSION);
  // Add python specific ignores to config.
  config.set("functions.ignore", ["venv", "__pycache__"]);
  // Setup VENV.
  const venvProcess = runWithVirtualEnv(
    ["python3.10", "-m", "venv", "venv"],
    config.path(Config.DEFAULT_FUNCTIONS_SOURCE),
    {}
  );
  await new Promise((resolve, reject) => {
    venvProcess.on("exit", resolve);
    venvProcess.on("error", reject);
  });

  // Update pip to support dependencies like pyyaml.
  const upgradeProcess = runWithVirtualEnv(
    ["pip3", "install", "--upgrade", "pip"],
    config.path(Config.DEFAULT_FUNCTIONS_SOURCE),
    {}
  );
  await new Promise((resolve, reject) => {
    upgradeProcess.on("exit", resolve);
    upgradeProcess.on("error", reject);
  });

  // Install dependencies.
  const installProcess = runWithVirtualEnv(
    ["python3.10", "-m", "pip", "install", "-r", "requirements.txt"],
    config.path(Config.DEFAULT_FUNCTIONS_SOURCE),
    {}
  );
  await new Promise((resolve, reject) => {
    installProcess.on("exit", resolve);
    installProcess.on("error", reject);
  });
}
