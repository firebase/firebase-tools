import { ChildProcess } from "child_process";
import { wrapSpawn } from "../../spawn";

import { Config } from "../../../config";
import { getPythonBinary } from "../../../deploy/functions/runtimes/python";
import { runWithVirtualEnv } from "../../../functions/python";
import { confirm } from "../../../prompt";
import { latest } from "../../../deploy/functions/runtimes/supported";
import { readTemplateSync } from "../../../templates";
import { FirebaseError } from "../../../error";

const MAIN_TEMPLATE = readTemplateSync("init/functions/python/main.py");
const REQUIREMENTS_TEMPLATE = readTemplateSync("init/functions/python/requirements.txt");
const GITIGNORE_TEMPLATE = readTemplateSync("init/functions/python/_gitignore");

/**
 * Helper to wait for a child process to exit.
 */
function waitForProcess(p: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => {
    p.on("exit", resolve);
    p.on("error", () => resolve(-1));
  });
}

/**
 * Helper to spawn a process and create a python virtual environment.
 */
async function createVirtualEnv(pythonBinary: string, cwd: string): Promise<void> {
  try {
    await wrapSpawn(pythonBinary, ["-m", "venv", "venv"], cwd);
  } catch (err) {
    throw new FirebaseError(
      `Failed to create virtual environment. Please make sure Python is installed and in your PATH.`,
    );
  }
}

/**
 * Helper to upgrade pip and install requirements.txt dependencies inside the virtual environment.
 */
async function installDependencies(pythonBinary: string, cwd: string): Promise<void> {
  // Update pip to support dependencies like pyyaml.
  // Note: We execute pip using pythonBinary `-m pip` instead of calling `pip3` directly.
  // Calling `pip3` directly on Windows can cause OS file locking failures since the executable attempts to overwrite itself.
  const upgradeProcess = runWithVirtualEnv(
    [pythonBinary, "-m", "pip", "install", "--upgrade", "pip"],
    cwd,
    {},
    { stdio: "inherit" },
  );
  const upgradeExitCode = await waitForProcess(upgradeProcess);
  if (upgradeExitCode !== 0) {
    throw new FirebaseError("Failed to upgrade pip inside virtual environment.");
  }

  const installProcess = runWithVirtualEnv(
    [pythonBinary, "-m", "pip", "install", "-r", "requirements.txt"],
    cwd,
    {},
    { stdio: "inherit" },
  );
  const installExitCode = await waitForProcess(installProcess);
  if (installExitCode !== 0) {
    throw new FirebaseError("Failed to install dependencies.");
  }
}

/**
 * Create a Python Firebase Functions project.
 */
export async function setup(setup: any, config: Config): Promise<void> {
  const sourceDir = config.path(setup.functions.source);

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

  // We resolve the version-specific Python binary (e.g. python3.10) to ensure we execute
  // the correct version of Python chosen for the functions codebase.
  const pythonBinary = getPythonBinary(latest("python"));
  await createVirtualEnv(pythonBinary, sourceDir);

  const install = await confirm({
    message: "Do you want to install dependencies now?",
    default: true,
  });
  if (install) {
    await installDependencies(pythonBinary, sourceDir);
  }
}
