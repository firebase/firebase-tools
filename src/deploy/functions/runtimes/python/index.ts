import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import { ChildProcess } from "child_process";

import * as portfinder from "portfinder";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as supported from "../supported";
import { logger } from "../../../../logger";
import {
  DEFAULT_VENV_DIR,
  killProcessTree,
  runWithVirtualEnv,
  trackVirtualEnvChild,
  untrackVirtualEnvChild,
  virtualEnvCmd,
} from "../../../../functions/python";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";
import { assertExhaustive } from "../../../../functional";
import { IS_WINDOWS } from "../../../../utils";

// How long to wait for the admin server to shut down in response to
// /__/quitquitquit before force-killing it.
const FORCE_KILL_DELAY_MS = 10_000;
// Hard cap on the whole shutdown sequence. A wedged server that survives even
// SIGKILL of its process group must not be able to hang the deploy.
const SHUTDOWN_TIMEOUT_MS = 15_000;
// A server that is bound but not accepting connections will never answer, so the
// shutdown request needs its own timeout rather than relying on the socket layer.
const QUITQUITQUIT_TIMEOUT_MS = 5_000;

/**
 * Create a runtime delegate for the Python runtime, if applicable.
 * @param context runtimes.DelegateContext
 * @return Delegate Python runtime delegate
 */
export async function tryCreateDelegate(
  context: runtimes.DelegateContext,
): Promise<Delegate | undefined> {
  const requirementsTextPath = path.join(context.sourceDir, "requirements.txt");

  if (!(await promisify(fs.exists)(requirementsTextPath))) {
    logger.debug("Customer code is not Python code.");
    return;
  }
  const runtime = context.runtime ?? supported.latest("python");
  if (!supported.isRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime as string} is not a valid Python runtime`);
  }
  if (!supported.runtimeIsLanguage(runtime, "python")) {
    throw new FirebaseError(
      `Internal error. Trying to construct a python runtime delegate for runtime ${runtime}`,
      { exit: 1 },
    );
  }
  return Promise.resolve(new Delegate(context.projectId, context.sourceDir, runtime));
}

/**
 * Get corresponding python binary name for a given runtime.
 *
 * By default, returns "python"
 */
export function getPythonBinary(
  runtime: supported.Runtime & supported.RuntimeOf<"python">,
): string {
  if (process.platform === "win32") {
    // There is no easy way to get specific version of python executable in Windows.
    return "python.exe";
  }
  if (runtime === "python310") {
    return "python3.10";
  } else if (runtime === "python311") {
    return "python3.11";
  } else if (runtime === "python312") {
    return "python3.12";
  } else if (runtime === "python313") {
    return "python3.13";
  } else if (runtime === "python314") {
    return "python3.14";
  }
  assertExhaustive(runtime, `Unhandled python runtime ${runtime as string}`);
}

export class Delegate implements runtimes.RuntimeDelegate {
  public readonly language = "python";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: supported.Runtime & supported.RuntimeOf<"python">,
  ) {}

  private _bin = "";
  private _modulesDir = "";

  get bin(): string {
    if (this._bin === "") {
      this._bin = this.getPythonBinary();
    }
    return this._bin;
  }

  async modulesDir(): Promise<string> {
    if (!this._modulesDir) {
      let out = "";
      let stderr = "";
      const child = runWithVirtualEnv(
        [
          this.bin,
          "-c",
          '"import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))"',
        ],
        this.sourceDir,
        {},
      );
      child.stderr?.on("data", (chunk: Buffer) => {
        const chunkString = chunk.toString();
        stderr = stderr + chunkString;
        logger.debug(`stderr: ${chunkString}`);
      });
      child.stdout?.on("data", (chunk: Buffer) => {
        const chunkString = chunk.toString();
        out = out + chunkString;
        logger.debug(`stdout: ${chunkString}`);
      });
      await new Promise((resolve, reject) => {
        child.on("exit", resolve);
        child.on("error", reject);
      });
      this._modulesDir = out.trim();
      if (this._modulesDir === "") {
        if (stderr.includes("venv") && stderr.includes("activate")) {
          throw new FirebaseError(
            "Failed to find location of Firebase Functions SDK: Missing virtual environment at venv directory. " +
              `Did you forget to run '${this.bin} -m venv venv'?`,
          );
        }
        const { command, args } = virtualEnvCmd(this.sourceDir, DEFAULT_VENV_DIR);
        throw new FirebaseError(
          "Failed to find location of Firebase Functions SDK. " +
            `Did you forget to run '${command} ${args.join(" ")} && ${
              this.bin
            } -m pip install -r requirements.txt'?`,
        );
      }
    }
    return this._modulesDir;
  }

  getPythonBinary(): string {
    return getPythonBinary(this.runtime);
  }

  validate(): Promise<void> {
    // TODO: make sure firebase-functions is included as a dep
    return Promise.resolve();
  }

  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async build(): Promise<void> {
    return Promise.resolve();
  }

  async serveAdmin(port: number, envs: backend.EnvironmentVariables): Promise<() => Promise<void>> {
    const modulesDir = await this.modulesDir();
    const envWithAdminPort = {
      ...envs,
      ADMIN_PORT: port.toString(),
    };
    const args = [this.bin, `"${path.join(modulesDir, "private", "serving.py")}"`];
    logger.debug(
      `Running admin server with args: ${JSON.stringify(args)} and env: ${JSON.stringify(
        envWithAdminPort,
      )} in ${this.sourceDir}`,
    );
    // detached so the shell runWithVirtualEnv spawns becomes the leader of its
    // own process group: that lets killProcessTree() force-kill the shell *and*
    // the Python process underneath it, instead of just the shell.
    const childProcess = runWithVirtualEnv(args, this.sourceDir, envWithAdminPort, {
      detached: !IS_WINDOWS,
    });
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.info(chunk.toString("utf8"));
    });
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      logger.error(chunk.toString("utf8"));
    });
    // Attached here rather than in shutdownAdmin() because 'exit' and 'error' do
    // not replay: a server that dies before shutdown is called (a venv that fails
    // to activate, a missing interpreter) would otherwise leave a listener that
    // never fires and stall the whole shutdown until SHUTDOWN_TIMEOUT_MS.
    const exited = new Promise<void>((resolve) => {
      childProcess.once("exit", () => resolve());
      childProcess.once("error", () => resolve());
    });
    trackVirtualEnvChild(childProcess);
    return Promise.resolve(() => this.shutdownAdmin(childProcess, port, exited));
  }

  /**
   * Shut down a discovery admin server, escalating from an HTTP request to a
   * force-kill of its process group, and never blocking indefinitely.
   *
   * `exited` must have been attached at spawn time; see serveAdmin().
   */
  private async shutdownAdmin(
    childProcess: ChildProcess,
    port: number,
    exited: Promise<void>,
  ): Promise<void> {
    try {
      await fetch(`http://127.0.0.1:${port}/__/quitquitquit`, {
        signal: AbortSignal.timeout(QUITQUITQUIT_TIMEOUT_MS),
      });
    } catch (e) {
      logger.debug("Failed to call quitquitquit. This often means the server failed to start", e);
    }
    const forceKill = setTimeout(() => {
      // No childProcess.killed check: that flag only reflects calls to .kill()
      // on this object, and killProcessTree() is already a no-op for a process
      // group that has gone away.
      if (childProcess.pid) {
        logger.debug(
          `Discovery admin server on port ${port} did not shut down when asked. Force-killing it.`,
        );
        killProcessTree(childProcess.pid);
      }
    }, FORCE_KILL_DELAY_MS);
    let giveUp: NodeJS.Timeout | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      giveUp = setTimeout(() => resolve(false), SHUTDOWN_TIMEOUT_MS);
    });
    try {
      const exitedCleanly = await Promise.race([exited.then(() => true), timedOut]);
      if (exitedCleanly) {
        untrackVirtualEnvChild(childProcess);
      } else {
        // Deliberately left tracked, so the process-exit handler gets one more
        // attempt at it when the CLI finishes.
        logger.debug(
          `Discovery admin server on port ${port} survived being force-killed. ` +
            `Continuing without it; it may need to be cleaned up manually.`,
        );
      }
    } finally {
      clearTimeout(forceKill);
      clearTimeout(giveUp);
    }
  }

  async discoverBuild(
    _configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables,
  ): Promise<Build> {
    let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      const adminPort = await portfinder.getPortPromise({
        port: 8081,
      });
      const killProcess = await this.serveAdmin(adminPort, envs);
      try {
        discovered = await discovery.detectFromPort(
          adminPort,
          this.projectId,
          this.runtime,
          500 /* initialDelay, python startup is slow */,
        );
      } finally {
        await killProcess();
      }
    }
    return discovered;
  }
}
