import { ChildProcess } from "child_process";
import * as ora from "ora";
import { wrapSpawn } from "../../spawn";

import { Config } from "../../../config";
import { getPythonBinary } from "../../../deploy/functions/runtimes/python";
import { getAvailablePythonRuntimes, runWithVirtualEnv } from "../../../functions/python";
import { confirm, select } from "../../../prompt";
import { latest, Runtime, RuntimeOf } from "../../../deploy/functions/runtimes/supported";
import { readTemplateSync } from "../../../templates";
import { FirebaseError } from "../../../error";
import { logger } from "../../../logger";
import { configForCodebase } from "../../../functions/projectConfig";

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
  const spinner = ora("Creating Python virtual environment...").start();
  try {
    await wrapSpawn(pythonBinary, ["-m", "venv", "venv"], cwd);
    spinner.succeed("Created Python virtual environment.");
  } catch (err) {
    spinner.fail("Failed to create Python virtual environment.");
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
 * Prompt the user to select a Python runtime if multiple runtimes are available, or if the latest runtime is not available.
 */
async function promptSelectRuntime(
  availableRuntimes: { runtime: Runtime & RuntimeOf<"python">; version: string }[],
): Promise<Runtime & RuntimeOf<"python">> {
  const latestPythonRuntime = latest("python");
  let selectedRuntime: Runtime & RuntimeOf<"python">;

  const isLatestRuntimeAvailable = availableRuntimes.some((r) => r.runtime === latestPythonRuntime);
  // If the latest runtime is available, use it by default
  if (isLatestRuntimeAvailable) {
    selectedRuntime = latestPythonRuntime;
  } else if (availableRuntimes.length >= 1) {
    const choices = availableRuntimes.map((r) => ({
      name: `${r.runtime} (${r.version})`,
      value: r.runtime,
    }));
    if (!choices.some((c) => c.value === latestPythonRuntime)) {
      choices.push({
        name: `${latestPythonRuntime} (not available on your machine)`,
        value: latestPythonRuntime,
      });
    }
    const runtime = await select({
      message: "Which Python runtime would you like to use for this codebase?",
      default: choices[0].value,
      choices,
    });

    selectedRuntime = runtime;
  } else {
    logger.warn(
      "No Python runtimes were detected on your machine. " +
        `The latest supported runtime ${latestPythonRuntime} will be set in your config, but you may encounter issues deploying or emulating functions.`,
    );
    selectedRuntime = latestPythonRuntime;
  }
  return selectedRuntime;
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

  const availableRuntimes = await getAvailablePythonRuntimes();
  const selectedRuntime = await promptSelectRuntime(availableRuntimes);
  const cbconfig = configForCodebase(setup.config.functions, setup.functions.codebase);
  cbconfig.runtime = selectedRuntime;

  // Write the selected runtime version to the config.
  config.set("functions.runtime", selectedRuntime);
  // Add python specific ignores to config.
  config.set("functions.ignore", ["venv", "__pycache__"]);

  // We resolve the version-specific Python binary (e.g. python3.10) to ensure we execute
  // the correct version of Python chosen for the functions codebase.
  const pythonBinary = getPythonBinary(selectedRuntime);
  const runtimeDetected = availableRuntimes.some((r) => r.runtime === selectedRuntime);
  if (runtimeDetected) {
    await createVirtualEnv(pythonBinary, sourceDir);
    const install = await confirm({
      message: "Do you want to install dependencies now?",
      default: true,
    });
    if (install) {
      await installDependencies(pythonBinary, sourceDir);
    }
  } else {
    logger.info(
      `Skipping virtual environment creation because ${selectedRuntime} is not available on your machine.`,
    );
  }
}
