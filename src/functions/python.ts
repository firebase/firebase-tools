import * as path from "path";
import { spawn } from "cross-spawn";
import * as cp from "child_process";
import { logger } from "../logger";
import { IS_WINDOWS } from "../utils";
import * as supported from "../deploy/functions/runtimes/supported";
import { getPythonBinary } from "../deploy/functions/runtimes/python";

/**
 * Default directory for python virtual environment.
 */
export const DEFAULT_VENV_DIR = "venv";

/**
 *  Get command for running Python virtual environment for given platform.
 */
export function virtualEnvCmd(cwd: string, venvDir: string): { command: string; args: string[] } {
  const activateScriptPath = IS_WINDOWS ? ["Scripts", "activate.bat"] : ["bin", "activate"];
  const venvActivate = `"${path.join(cwd, venvDir, ...activateScriptPath)}"`;
  return {
    command: IS_WINDOWS ? venvActivate : ".",
    args: IS_WINDOWS ? [] : [venvActivate],
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
    stdio: "pipe",
    ...spawnOpts,
    // Linting disabled since internal types expect NODE_ENV which does not apply to Python runtimes.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    env: envs as any,
  });
}

/**
 * Check if a python binary is available and return its version.
 */
export async function checkPythonVersion(binary: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    const child = spawn(binary, ["--version"], { stdio: "pipe" });
    let output = "";
    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.stderr?.on("data", (data: Buffer) => {
      output += data.toString();
    });
    child.on("close", (code: number) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        resolve(undefined);
      }
    });
    child.on("error", () => {
      resolve(undefined);
    });
  });
}

/**
 * Get all available python runtimes on the user machine.
 */
export async function getAvailablePythonRuntimes(): Promise<
  { runtime: supported.Runtime & supported.RuntimeOf<"python">; binary: string; version: string }[]
> {
  const pythonRuntimes = (Object.keys(supported.RUNTIMES) as supported.Runtime[]).filter(
    (runtime): runtime is supported.Runtime & supported.RuntimeOf<"python"> =>
      runtime.startsWith("python"),
  );

  const results = await Promise.all(
    pythonRuntimes.map(async (runtime) => {
      const binary = getPythonBinary(runtime);
      const version = await checkPythonVersion(binary);
      return version ? { runtime, binary, version } : undefined;
    }),
  );

  return results.filter((r): r is NonNullable<typeof r> => !!r);
}
