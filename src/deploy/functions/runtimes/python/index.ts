import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";

import * as portfinder from "portfinder";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import { logger } from "../../../../logger";
import { runWithVirtualEnv } from "../../../../functions/python";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";

const LATEST_VERSION: runtimes.Runtime = "python310";

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

class Delegate implements runtimes.RuntimeDelegate {
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
          "'import firebase_functions; import os; print(os.path.dirname(firebase_functions.__file__))'",
        ],
        this.sourceDir,
        {}
      );
      let out = "";
      child.stdout?.on("data", (chunk: Buffer) => {
        const chunkString = chunk.toString();
        out = out + chunkString;
        logger.debug(chunkString);
      });
      await new Promise((resolve, reject) => {
        child.on("exit", resolve);
        child.on("error", reject);
      });
      this._modulesDir = out;
    }
    return this._modulesDir;
  }

  getPythonBinary(): string {
    if (this.runtime === "python310") {
      return "python3.10";
    } else if (this.runtime === "python311") {
      return "python3.11";
    }
    return "python";
  }

  validate(): Promise<void> {
    // TODO: make sure firebase-functions is included as a dep
    return Promise.resolve();
  }

  // Watch isn't supported for Python.
  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async build(): Promise<void> {
    // No-op.
  }

  async serveAdmin(port: number, envs: backend.EnvironmentVariables): Promise<() => Promise<void>> {
    const modulesDir = await this.modulesDir();
    const envWithAdminPort = {
      ...envs,
      ADMIN_PORT: port.toString(),
    };
    const args = ["python3.10", path.join(modulesDir, "private", "serving.py")];
    logger.debug(
      `Running admin server with args: ${JSON.stringify(args)} and env: ${JSON.stringify(
        envWithAdminPort
      )} in ${this.sourceDir}`
    );
    const childProcess = runWithVirtualEnv(args, this.sourceDir, envWithAdminPort);
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
