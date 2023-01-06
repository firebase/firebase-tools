import fetch from "node-fetch";
import * as path from "path";
import * as fs from "fs";
import * as portfinder from "portfinder";
import * as spawn from "cross-spawn";
import * as cp from "child_process";

import * as runtimes from "..";
import * as backend from "../../backend";
import { logger } from "../../../../logger";
import * as discovery from "../discovery";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";
import { ChildProcess, ProcessEnvOptions } from "child_process";

export const LATEST_VERSION: runtimes.Runtime = "python310";

export const PYVENV = ".venv";

type ChildProcessWithCompletionPromise = cp.ChildProcess & { promise: Promise<string> };

/**
 * Runs a shell command with the Python virtual env pre-activated.
 */
export function runWithVirtualEnv(
  commandAndArgs: string[],
  functionsDir: string,
  withVirtualEnv = true,
  opts?: cp.SpawnOptions
): ChildProcessWithCompletionPromise {
  const activateScriptPath =
    process.platform === "win32" ? ["Scripts", "activate.bat"] : ["bin", "activate"];
  const venvActivate = path.join(functionsDir, PYVENV, ...activateScriptPath);
  const command = withVirtualEnv
    ? process.platform === "win32"
      ? venvActivate
      : "source"
    : commandAndArgs[0];
  const args = withVirtualEnv
    ? [process.platform === "win32" ? "" : venvActivate, "&&", ...commandAndArgs]
    : [...commandAndArgs.splice(1)];

  const child = spawn(command, args, {
    shell: true,
    cwd: functionsDir,
    stdio: [/* stdin= */ "pipe", /* stdout= */ "pipe", /* stderr= */ "pipe", "ipc"],
    ...opts,
    env: {
      ...(opts?.env ?? {}),
      ...process.env,
    },
  }) as ChildProcessWithCompletionPromise;
  let out = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    const chunkString = chunk.toString();
    out = out + chunkString;
    logger.debug(chunkString);
  });
  const promise = new Promise<string>((resolve, reject) => {
    child.on("exit", () => resolve(out));
    child.on("error", reject);
  });
  child.promise = promise;
  return child;
}

class Delegate implements runtimes.RuntimeDelegate {
  public readonly name = "python";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
  ) {}

  private modulesDir_ = "";

  async modulesDir(): Promise<string> {
    if (!this.modulesDir_) {
      const out = await runWithVirtualEnv(
        [
          "python3.10",
          "-c",
          "'import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))'",
        ],
        this.sourceDir,
        true,
        {
          stdio: [/* stdin= */ "ignore", /* stdout= */ "pipe", /* stderr= */ "inherit"],
        }
      ).promise;
      this.modulesDir_ = out.trimEnd();
    }

    return this.modulesDir_;
  }

  validate(): Promise<void> {
    return Promise.resolve();
  }

  // Watch isn't supported for Python.
  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async build(): Promise<void> {
    // No-op.
  }

  serve(port: string, env: Record<string, string | undefined>): ChildProcess {
    path.join(__dirname);
    const args = [
      "python3.10",
      path.join(__dirname, "..", "..", "..", "..", "emulator", "emulatorRuntime.py"),
    ];
    return runWithVirtualEnv(args, this.sourceDir, true, {
      env: { ...env, DEBUG: "true", HOST: `unix://${port}` } as unknown as ProcessEnvOptions["env"],
    });
  }

  async serveAdmin(port: number, envs: backend.EnvironmentVariables): Promise<() => Promise<void>> {
    const modulesDir = await this.modulesDir();
    const envWithAdminPort = {
      ...envs,
      ADMIN_PORT: port.toString(),
    };
    const args = ["python3.10", path.join(modulesDir, "serving.py")];
    logger.debug(
      `Running admin server with args: ${JSON.stringify(args)} and env: ${JSON.stringify(
        envWithAdminPort
      )} in ${this.sourceDir}`
    );
    const childProcess = runWithVirtualEnv(args, this.sourceDir, true, {
      env: envWithAdminPort as unknown as ProcessEnvOptions["env"],
    });
    return Promise.resolve(async () => {
      // Tell the process to exit.
      await fetch(`http://localhost:${port}/__/quitquitquit`);
      // Give the process a chance to quit gracefully,
      // otherwise kill it.
      const quitTimeout = setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
      await childProcess.promise; // Resolves on process exit.
      clearTimeout(quitTimeout);
    });
  }

  async discoverBuild(
    _configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables
  ): Promise<Build> {
    let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      const adminPort = await portfinder.getPortPromise({
        port: 8081,
      });
      const killProcess = await this.serveAdmin(adminPort, envs);
      try {
        discovered = await discovery.detectFromPort(adminPort, this.projectId, this.runtime);
      } finally {
        await killProcess();
      }
    }
    return discovered;
  }
}

/**
 * This function is used to create a runtime delegate for the Python runtime.
 * @param context runtimes.DelegateContext
 * @return Delegate Python runtime delegate
 */
export async function tryCreateDelegate(
  context: runtimes.DelegateContext
): Promise<Delegate | undefined> {
  // TODO this can be done better by passing Options to tryCreateDelegate and
  // reading the "functions.source" and ""functions.runtime" values from there
  // to determine the runtime. For the sake of keeping changes to python only
  // this has not been done for now.
  const requirementsTextPath = path.join(context.sourceDir, "requirements.txt");
  if (!fs.existsSync(requirementsTextPath)) {
    logger.debug("Customer code is not Python code.");
    return;
  }
  const runtime: string = context.runtime ? context.runtime : LATEST_VERSION;
  if (!runtimes.isValidRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime as string} is not a valid Python runtime`);
  }
  return Promise.resolve(new Delegate(context.projectId, context.sourceDir, runtime));
}
