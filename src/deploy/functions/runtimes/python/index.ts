import * as fs from "fs";
import * as path from "path";
import fetch from "node-fetch";
import { promisify } from "util";

import * as portfinder from "portfinder";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import { logger } from "../../../../logger";
import { runWithVirtualEnv } from "../../../../functions/python";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";

export const LATEST_VERSION: runtimes.Runtime = "python310";

/**
 * Create a runtime delegate for the Python runtime, if applicable.
 *
 * @param context runtimes.DelegateContext
 * @return Delegate Python runtime delegate
 */
export async function tryCreateDelegate(
  context: runtimes.DelegateContext
): Promise<Delegate | undefined> {
  const requirementsTextPath = path.join(context.sourceDir, "requirements.txt");

  if (!(await promisify(fs.exists)(requirementsTextPath))) {
    logger.debug("Customer code is not Python code.");
    return;
  }
  const runtime = context.runtime ? context.runtime : LATEST_VERSION;
  if (!runtimes.isValidRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime} is not a valid Python runtime`);
  }
  return Promise.resolve(new Delegate(context.projectId, context.sourceDir, runtime));
}

/**
 * Get corresponding python binary name for a given runtime.
 *
 * By default, returns "python"
 */
export function getPythonBinary(runtime: runtimes.Runtime): string {
  if (process.platform === "win32") {
    // There is no easy way to get specific version of python executable in Windows.
    return "python.exe";
  }
  if (runtime === "python310") {
    return "python3.10";
  } else if (runtime === "python311") {
    return "python3.11";
  }
  return "python";
}

export class Delegate implements runtimes.RuntimeDelegate {
  public readonly name = "python";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
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
      const child = runWithVirtualEnv(
        [
          this.bin,
          "-c",
          '"import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))"',
        ],
        this.sourceDir,
        {}
      );
      let out = "";
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
    const args = [this.bin, path.join(modulesDir, "private", "serving.py")];
    logger.debug(
      `Running admin server with args: ${JSON.stringify(args)} and env: ${JSON.stringify(
        envWithAdminPort
      )} in ${this.sourceDir}`
    );
    const childProcess = runWithVirtualEnv(args, this.sourceDir, envWithAdminPort);
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      const chunkString = chunk.toString();
      logger.debug(`stdout: ${chunkString}`);
    });
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      const chunkString = chunk.toString();
      logger.debug(`stderr: ${chunkString}`);
    });
    return Promise.resolve(async () => {
      await fetch(`http://127.0.0.1:${port}/__/quitquitquit`);
      const quitTimeout = setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
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
