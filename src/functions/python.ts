import * as os from "os";
import * as path from "path";
import { spawn } from "cross-spawn";
import * as cp from "child_process";
import { logger } from "../logger";
import { IS_WINDOWS } from "../utils";
import { getErrMsg } from "../error";

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
    env: { ...process.env, ...envs },
  });
}

/**
 * Force-kill a process spawned by runWithVirtualEnv, including its Python
 * grandchild. runWithVirtualEnv spawns through a shell, so its pid is the
 * shell's; callers must pass `detached: true` so that shell leads a process
 * group, which is what gets killed here.
 */
export function killProcessTree(pid: number): void {
  // process.kill(-0, ...) would signal the CLI's own process group.
  if (!pid || pid <= 0) {
    return;
  }
  if (IS_WINDOWS) {
    // Windows has no process groups; taskkill /T walks the tree by parent pid.
    const result = cp.spawnSync("taskkill", ["/pid", pid.toString(), "/T", "/F"]);
    if (result.error || result.status !== 0) {
      logger.debug(
        `taskkill on pid ${pid} exited with ${String(result.status)}: ` +
          `${result.error?.message ?? result.stderr?.toString().trim() ?? ""}`,
      );
    }
    return;
  }
  try {
    // A negative pid signals the whole process group rather than just `pid`.
    process.kill(-pid, "SIGKILL");
  } catch (e: unknown) {
    // Usually ESRCH (the group exited on its own); EPERM is the failure that
    // surfaces later as an orphaned server.
    logger.debug(`Failed to kill process group ${pid}: ${getErrMsg(e)}`);
  }
}

/**
 * SIGTERM is what CI runners send on job cancellation. SIGINT and SIGQUIT are
 * terminal-generated and reach the foreground process group only, so a detached
 * child never sees them on its own.
 */
const CLEANUP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

const trackedChildren = new Set<cp.ChildProcess>();
const signalHandlers = new Map<NodeJS.Signals, () => void>();

/**
 * Terminate as if the signal had never been handled. Windows implements only
 * SIGINT, SIGTERM and SIGKILL in `process.kill` and throws ENOSYS for the rest,
 * including the SIGHUP it raises when the console window closes.
 */
function reRaise(signal: NodeJS.Signals): void {
  try {
    process.kill(process.pid, signal);
  } catch (e: unknown) {
    logger.debug(`Could not re-raise ${signal}, exiting instead: ${getErrMsg(e)}`);
    process.exit(128 + (os.constants.signals[signal] ?? 0));
  }
}

function killAllTrackedChildren(): void {
  for (const child of trackedChildren) {
    // An exited child's pid may have been reaped and recycled by now.
    if (child.pid && child.exitCode === null && child.signalCode === null) {
      killProcessTree(child.pid);
    }
  }
  trackedChildren.clear();
}

function removeCleanupHandlers(): void {
  if (!signalHandlers.size) {
    return;
  }
  process.removeListener("exit", killAllTrackedChildren);
  for (const [signal, handler] of signalHandlers) {
    process.removeListener(signal, handler);
  }
  signalHandlers.clear();
}

function addCleanupHandlers(): void {
  if (signalHandlers.size) {
    return;
  }
  // 'exit' does not fire for signal-terminated processes, hence the handlers below.
  process.on("exit", killAllTrackedChildren);
  for (const signal of CLEANUP_SIGNALS) {
    const handler = (): void => {
      killAllTrackedChildren();
      // A signal listener suppresses Node's default terminate-on-signal, so
      // restore it, unless another listener is still driving the exit itself.
      removeCleanupHandlers();
      if (process.listenerCount(signal) === 0) {
        reRaise(signal);
      }
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

/**
 * Track a detached child so it is force-killed if the CLI goes away before the
 * caller's normal cleanup runs. `detached: true` takes the child out of the
 * CLI's process group, so it no longer dies with the CLI on Ctrl-C; this
 * restores that and extends it to SIGTERM and SIGHUP.
 */
export function trackVirtualEnvChild(child: cp.ChildProcess): void {
  trackedChildren.add(child);
  addCleanupHandlers();
}

/**
 * Stop tracking an exited child. Cleanup handlers come off once nothing is left
 * to clean up, so the CLI's default signal behaviour is unchanged afterwards.
 */
export function untrackVirtualEnvChild(child: cp.ChildProcess): void {
  trackedChildren.delete(child);
  if (!trackedChildren.size) {
    removeCleanupHandlers();
  }
}
