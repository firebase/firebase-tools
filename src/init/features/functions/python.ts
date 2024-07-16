import * as spawn from "cross-spawn";

import { Config } from "../../../config";
import { getPythonBinary } from "../../../deploy/functions/runtimes/python";
import { runWithVirtualEnv } from "../../../functions/python";
import { promptOnce } from "../../../prompt";
import { latest } from "../../../deploy/functions/runtimes/supported";
import { readTemplateSync } from "../../../templates";

const MAIN_TEMPLATE = readTemplateSync("init/functions/python/main.py");
const REQUIREMENTS_TEMPLATE = readTemplateSync("init/functions/python/requirements.txt");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/python/_gitignore");

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
  config.set("functions.runtime", latest("python"));
  // Add python specific ignores to config.
  config.set("functions.ignore", ["venv", "__pycache__"]);

  // Setup VENV.
  const venvProcess = spawn(getPythonBinary(latest("python")), ["-m", "venv", "venv"], {
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
      [getPythonBinary(latest("python")), "-m", "pip", "install", "-r", "requirements.txt"],
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
