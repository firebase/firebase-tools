import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import * as portfinder from "portfinder";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as supported from "../supported";
import { logger } from "../../../../logger";
import { DEFAULT_VENV_DIR, runWithVirtualEnv, virtualEnvCmd } from "../../../../functions/python";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";
import { assertExhaustive } from "../../../../functional";

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

/**
 * Extract the "major.minor" Python version a runtime name (e.g. "python310") expects.
 * Returns undefined for runtime names that don't encode a version (there are none today,
 * but this keeps the check from throwing if that ever changes).
 */
export function getExpectedPythonVersion(
  runtime: supported.Runtime & supported.RuntimeOf<"python">,
): string | undefined {
  const match = /^python(\d)(\d+)$/.exec(runtime);
  if (!match) {
    return undefined;
  }
  return `${match[1]}.${match[2]}`;
}

/**
 * Read the Python version a virtual environment was created with, from its pyvenv.cfg.
 * Returns undefined if the venv (or its version marker) doesn't exist, so callers can
 * fall back to other error messages instead of failing on this best-effort check.
 */
export function getVenvPythonVersion(sourceDir: string, venvDir: string): string | undefined {
  let contents: string;
  try {
    contents = fs.readFileSync(path.join(sourceDir, venvDir, "pyvenv.cfg"), "utf8");
  } catch {
    return undefined;
  }
  // pyvenv.cfg has included a "version" line (e.g. "version = 3.10.12") since Python 3.3.
  // Python 3.11+ additionally writes "version_info", which we also accept.
  const match = /^version(?:_info)?\s*=\s*(\d+)\.(\d+)/m.exec(contents);
  if (!match) {
    return undefined;
  }
  return `${match[1]}.${match[2]}`;
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
        const versionMismatch = this.checkVenvPythonVersionMismatch();
        if (versionMismatch) {
          throw new FirebaseError(versionMismatch);
        }
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

  /**
   * Compares the Python version the venv was actually created with against the version
   * this.runtime expects, so we can surface a clear error instead of the generic
   * "Failed to find location of Firebase Functions SDK" message when they disagree.
   * Returns undefined when no mismatch is detected (or can't be determined).
   */
  private checkVenvPythonVersionMismatch(): string | undefined {
    if (process.platform === "win32") {
      // getPythonBinary() is version-neutral on Windows, so there's nothing to compare.
      return undefined;
    }
    const expected = getExpectedPythonVersion(this.runtime);
    const actual = getVenvPythonVersion(this.sourceDir, DEFAULT_VENV_DIR);
    if (!expected || !actual || expected === actual) {
      return undefined;
    }
    const actualRuntime = `python${actual.replace(".", "")}`;
    return (
      `Python version mismatch: the virtual environment at "${DEFAULT_VENV_DIR}" was created with ` +
      `Python ${actual}, but this project is configured to use Python ${expected} (runtime "${this.runtime}"). ` +
      `Recreate the virtual environment with 'python${expected} -m venv ${DEFAULT_VENV_DIR}', or set ` +
      `"runtime": "${actualRuntime}" in firebase.json to match the Python version already installed.`
    );
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

  async serveAdmin(port: number, envs: backend.EnvironmentVariables) {
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
    const childProcess = runWithVirtualEnv(args, this.sourceDir, envWithAdminPort);
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.info(chunk.toString("utf8"));
    });
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      logger.error(chunk.toString("utf8"));
    });
    return Promise.resolve(async () => {
      try {
        await fetch(`http://127.0.0.1:${port}/__/quitquitquit`);
      } catch (e) {
        logger.debug("Failed to call quitquitquit. This often means the server failed to start", e);
      }
      const quitTimeout = setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
      clearTimeout(quitTimeout);
      return new Promise<void>((resolve, reject) => {
        childProcess.once("exit", resolve);
        childProcess.once("error", reject);
      });
    });
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
