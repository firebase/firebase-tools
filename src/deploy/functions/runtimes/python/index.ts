import fetch from "node-fetch";
import * as path from "path";
import * as fs from "fs";
import * as portfinder from "portfinder";
import * as spawn from "cross-spawn";

import * as runtimes from "..";
import * as backend from "../../backend";
import { logger } from "../../../../logger";
import { RuntimeConfigValues, EnvironmentVariables, Backend } from "../../backend";
import * as discovery from "../discovery";

const DEFAULT_PYTHON_RUNTIME: runtimes.Runtime = "python39";

class Delegate implements runtimes.RuntimeDelegate {
  public readonly name = "python";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
  ) {}

  // TODO: should this be implemented for Python?
  validate(): Promise<void> {
    return Promise.resolve();
  }

  // Watch isn't supported for Python.
  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  build(): Promise<void> {
    // TODO implement generation of functions.yaml file
    return Promise.resolve();
  }

  serve(
    port: number,
    adminPort: number,
    envs: backend.EnvironmentVariables
  ): Promise<() => Promise<void>> {
    // TODO run generator/functions sdk entry point instead
    const childProcess = spawn("python3", ["functions_admin_http_example.py"], {
      env: {
        ...envs,
        PORT: port.toString(),
        ADMIN_PORT: adminPort.toString(),
        HOME: process.env.HOME,
        PATH: process.env.PATH,
      },
      cwd: this.sourceDir,
      stdio: [/* stdin=*/ "ignore", /* stdout=*/ "pipe", /* stderr=*/ "inherit"],
    });
    childProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(chunk.toString());
    });
    return Promise.resolve(async () => {
      const p = new Promise<void>((resolve, reject) => {
        childProcess.once("exit", resolve);
        childProcess.once("error", reject);
      });
      console.log("FETCHING QUIT");
      // If we SIGKILL the child process we're actually going to kill the go
      // runner and the webserver it launched will keep running.
      await fetch(`http://localhost:${adminPort}/__/quitquitquit`);
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
      return p;
    });
  }

  async discoverSpec(
    configValues: RuntimeConfigValues,
    envs: EnvironmentVariables
  ): Promise<Backend> {
    let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      const port = await portfinder.getPortPromise();
      const adminPort = await portfinder.getPortPromise({
        port: port + 1,
      });
      const kill = await this.serve(port, adminPort, envs);
      try {
        console.log("calling discover from port");
        discovered = await discovery.detectFromPort(adminPort, this.projectId, this.runtime);
        console.log("after discover from port");
      } finally {
        await kill();
      }
    }
    discovered.environmentVariables = envs;
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
  const requirementsTextPath = path.join(context.sourceDir, "requirements.txt");
  if (!fs.existsSync(requirementsTextPath)) {
    logger.debug("Customer code is not Python code.");
    return;
  }
  let runtime = context.runtime;
  if (!runtime) {
    // TODO should we default here?
    // TODO is there a way to get the version of the users project?
    runtime = DEFAULT_PYTHON_RUNTIME;
  }
  const delegate = new Delegate(context.projectId, context.sourceDir, runtime);

  return Promise.resolve(delegate);
}
