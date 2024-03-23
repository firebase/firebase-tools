import * as path from "path";
import * as spawn from "cross-spawn";
import * as cp from "child_process";
import { logger } from "../logger";

/**
 * Default directory for python virtual environment.
 */
export const DEFAULT_VENV_DIR = "venv";

/**
 *  Get command for running Python virtual environment for given platform.
 */
export function virtualEnvCmd(cwd: string, venvDir: string): { command: string; args: string[] } {
  const activateScriptPath =
    process.platform === "win32" ? ["Scripts", "activate.bat"] : ["bin", "activate"];
  const venvActivate = `"${path.join(cwd, venvDir, ...activateScriptPath)}"`;
  return {
    command: process.platform === "win32" ? venvActivate : ".",
    args: [process.platform === "win32" ? "" : venvActivate],
  };
}

/**
 * Spawn a process inside the Python virtual environment if found.
 */
export function runWithVirtualEnv(
  commandAndArgs: string[],
  cwd: string,
  envs: Record<string, string>,
  spawnOpts: cp.SpawnOptions = {},
  venvDir = DEFAULT_VENV_DIR,
): cp.ChildProcess {
  const { command, args } = virtualEnvCmd(cwd, venvDir);
  args.push("&&", ...commandAndArgs);
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
