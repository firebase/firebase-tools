import * as path from "path";
import { spawn } from "cross-spawn";
import * as cp from "child_process";
import { logger } from "../logger";
import { IS_WINDOWS } from "../utils";

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
 * Force-kill a process spawned by runWithVirtualEnv, including its Python
 * grandchild.
 *
 * runWithVirtualEnv always spawns through a shell (`. venv/bin/activate && <cmd>`),
 * so the pid it returns is the shell, not the Python process underneath it.
 * Signaling that pid alone does not reliably reach Python, so callers must pass
 * `detached: true` when spawning (making the shell the leader of its own process
 * group) and kill the whole group here instead of a single pid.
 */
export function killProcessTree(pid: number): void {
  // Callers already skip an unspawned child, but guard here too: this function is
  // exported, and process.kill(-0, ...) would signal the CLI's own process group.
  if (!pid || pid <= 0) {
    return;
  }
  if (IS_WINDOWS) {
    // taskkill /T walks the process tree by parent pid, so it doesn't rely on
    // the process group trick used below.
    cp.spawnSync("taskkill", ["/pid", pid.toString(), "/T", "/F"]);
    return;
  }
  try {
    // A negative pid signals the whole process group rather than just `pid`.
    process.kill(-pid, "SIGKILL");
  } catch (e) {
    // Group may already be gone (process exited on its own).
  }
}

/**
 * Signals that should trigger cleanup of tracked children. SIGTERM is what CI
 * runners send on job cancellation or timeout, which is the case that used to
 * leave orphaned admin servers behind. SIGINT and SIGQUIT are terminal-generated
 * and so only reach the foreground process group: a detached child never sees
 * them on its own.
 */
const CLEANUP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"];

const trackedChildren = new Set<cp.ChildProcess>();
const signalHandlers = new Map<NodeJS.Signals, () => void>();

function killAllTrackedChildren(): void {
  for (const child of trackedChildren) {
    // A child that has already exited may have had its pid reaped and recycled
    // as the leader of some unrelated process group by now.
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
  // 'exit' covers normal and uncaught-exception exits. It does *not* fire for
  // signal-terminated processes, hence the explicit signal handlers below.
  process.on("exit", killAllTrackedChildren);
  for (const signal of CLEANUP_SIGNALS) {
    const handler = (): void => {
      killAllTrackedChildren();
      // Attaching a signal listener suppresses Node's default "terminate on
      // signal" behaviour, so restore it: drop our listeners and re-raise, but
      // only if nobody else (e.g. the emulator's own shutdown handler) is still
      // listening and expecting to drive the exit itself.
      removeCleanupHandlers();
      if (process.listenerCount(signal) === 0) {
        process.kill(process.pid, signal);
      }
    };
    signalHandlers.set(signal, handler);
    process.on(signal, handler);
  }
}

/**
 * Track a detached child spawned by runWithVirtualEnv so that it is force-killed
 * if the CLI itself goes away before the caller's normal cleanup path runs.
 *
 * Passing `detached: true` at spawn time takes the child out of the CLI's process
 * group, which means it no longer dies with the CLI on Ctrl-C. Tracking it here
 * restores that, and extends it to SIGTERM (CI cancellation) and SIGHUP.
 *
 * Nothing can help if the CLI is SIGKILLed, since that signal cannot be caught.
 */
export function trackVirtualEnvChild(child: cp.ChildProcess): void {
  trackedChildren.add(child);
  addCleanupHandlers();
}

/**
 * Stop tracking a child that has exited. Cleanup handlers are removed once
 * nothing is left to clean up, so the CLI's default signal behaviour is not
 * altered for the rest of the run.
 */
export function untrackVirtualEnvChild(child: cp.ChildProcess): void {
  trackedChildren.delete(child);
  if (!trackedChildren.size) {
    removeCleanupHandlers();
  }
}
