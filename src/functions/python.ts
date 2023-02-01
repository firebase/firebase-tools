import * as path from "path";
import * as spawn from "cross-spawn";
import * as cp from "child_process";
import { logger } from "../logger";

const DEFAULT_VENV_DIR = "venv";

/**
 * Spawn a process inside the Python virtual environment if found.
 */
export function runWithVirtualEnv(
  commandAndArgs: string[],
  cwd: string,
  envs: Record<string, string>,
  spawnOpts: cp.SpawnOptions = {},
  venvDir = DEFAULT_VENV_DIR
): cp.ChildProcess {
  const activateScriptPath =
    process.platform === "win32" ? ["Scripts", "activate.bat"] : ["bin", "activate"];
  const venvActivate = path.join(cwd, venvDir, ...activateScriptPath);
  const command = process.platform === "win32" ? venvActivate : "source";
  const args = [process.platform === "win32" ? "" : venvActivate, "&&", ...commandAndArgs];
  logger.debug(`Running command with virtualenv: command=${command}, args=${JSON.stringify(args)}`);

  return spawn(command, args, {
    shell: true,
    cwd,
    stdio: [/* stdin= */ "pipe", /* stdout= */ "pipe", /* stderr= */ "pipe", "pipe"],
    ...spawnOpts,
    // Linting disabled since internal types expect NODE_ENV which does not apply to Python runtimes.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    env: envs as any,
  });
}
