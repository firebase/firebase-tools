import * as fs from "fs";
import * as spawn from "cross-spawn";
import * as path from "path";

import { Config } from "../../../config";
import { getPythonBinary, LATEST_VERSION } from "../../../deploy/functions/runtimes/python";
import { runWithVirtualEnv } from "../../../functions/python";
import { promptOnce } from "../../../prompt";

const TEMPLATE_ROOT = path.resolve(__dirname, "../../../../templates/init/functions/python");
const MAIN_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "main.py"), "utf8");
const REQUIREMENTS_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "requirements.txt"), "utf8");
const GITIGNORE_TEMPLATE = fs.readFileSync(path.join(TEMPLATE_ROOT, "_gitignore"), "utf8");

/**
 * Create a Python Firebase Functions project.
 */
export async function setup(setup: any, config: Config): Promise<void> {
  await config.askWriteProjectFile(
    `${setup.functions.source}/requirements.txt`,
    REQUIREMENTS_TEMPLATE,
  );
  await config.askWriteProjectFile(`${setup.functions.source}/.gitignore`, GITIGNORE_TEMPLATE);
  await config.askWriteProjectFile(`${setup.functions.source}/main.py`, MAIN_TEMPLATE);

  // Write the latest supported runtime version to the config.
  config.set("functions.runtime", LATEST_VERSION);
  // Add python specific ignores to config.
  config.set("functions.ignore", ["venv", "__pycache__"]);

  // Setup VENV.
  const venvProcess = spawn(getPythonBinary(LATEST_VERSION), ["-m", "venv", "venv"], {
    shell: true,
    cwd: config.path(setup.functions.source),
    stdio: [/* stdin= */ "pipe", /* stdout= */ "pipe", /* stderr= */ "pipe", "pipe"],
  });
  await new Promise((resolve, reject) => {
    venvProcess.on("exit", resolve);
    venvProcess.on("error", reject);
  });

  const install = await promptOnce({
    name: "install",
    type: "confirm",
    message: "Do you want to install dependencies now?",
    default: true,
  });
  if (install) {
    // Update pip to support dependencies like pyyaml.
    const upgradeProcess = runWithVirtualEnv(
      ["pip3", "install", "--upgrade", "pip"],
      config.path(setup.functions.source),
      {},
      { stdio: ["inherit", "inherit", "inherit"] },
    );
    await new Promise((resolve, reject) => {
      upgradeProcess.on("exit", resolve);
      upgradeProcess.on("error", reject);
    });
    const installProcess = runWithVirtualEnv(
      [getPythonBinary(LATEST_VERSION), "-m", "pip", "install", "-r", "requirements.txt"],
      config.path(setup.functions.source),
      {},
      { stdio: ["inherit", "inherit", "inherit"] },
    );
    await new Promise((resolve, reject) => {
      installProcess.on("exit", resolve);
      installProcess.on("error", reject);
    });
  }
}
