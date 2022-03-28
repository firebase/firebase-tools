import { promisify } from "util";
import fetch from "node-fetch";
import * as fs from "fs";
import * as path from "path";
import * as portfinder from "portfinder";
import * as spawn from "cross-spawn";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as gomod from "./gomod";
import * as runtimes from "..";

const VERSION_TO_RUNTIME: Record<string, runtimes.Runtime> = {
  "1.13": "go113",
};
export const ADMIN_SDK = "firebase.google.com/go/v4";
export const FUNCTIONS_SDK = "github.com/FirebaseExtended/firebase-functions-go";

// Because codegen is a separate binary we won't automatically import it
// when we import the library.
export const FUNCTIONS_CODEGEN = FUNCTIONS_SDK + "/support/codegen";
export const FUNCTIONS_RUNTIME = FUNCTIONS_SDK + "/support/runtime";

export async function tryCreateDelegate(
  context: runtimes.DelegateContext
): Promise<Delegate | undefined> {
  const goModPath = path.join(context.sourceDir, "go.mod");

  let module: gomod.Module;
  try {
    const modBuffer = await promisify(fs.readFile)(goModPath);
    module = gomod.parseModule(modBuffer.toString("utf8"));
  } catch (err: any) {
    logger.debug("Customer code is not Golang code (or they aren't using gomod)");
    return;
  }

  let runtime = context.runtime;
  if (!runtime) {
    if (!module.version) {
      throw new FirebaseError("Could not detect Golang version from go.mod");
    }
    if (!VERSION_TO_RUNTIME[module.version]) {
      throw new FirebaseError(
        `go.mod specifies Golang version ${
          module.version
        } which is unsupported by Google Cloud Functions. Valid values are ${Object.keys(
          VERSION_TO_RUNTIME
        ).join(", ")}`
      );
    }
    runtime = VERSION_TO_RUNTIME[module.version];
  }

  return new Delegate(context.projectId, context.sourceDir, runtime, module);
}

export class Delegate {
  public readonly name = "golang";

  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime,
    private readonly module: gomod.Module
  ) {}
  validate(): Promise<void> {
    return Promise.resolve();
  }

  async build(): Promise<void> {
    try {
      await promisify(fs.mkdir)(path.join(this.sourceDir, "autogen"));
    } catch (err: any) {
      if (err?.code !== "EEXIST") {
        throw new FirebaseError("Failed to create codegen directory", { children: [err] });
      }
    }
    const genBinary = spawn.sync("go", ["run", FUNCTIONS_CODEGEN, this.module.module], {
      cwd: this.sourceDir,
      env: {
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        GOPATH: process.env.GOPATH,
      },
      stdio: [/* stdin=*/ "ignore", /* stdout=*/ "pipe", /* stderr=*/ "pipe"],
    });
    if (genBinary.status !== 0) {
      throw new FirebaseError("Failed to run codegen", {
        children: [new Error(genBinary.stderr.toString())],
      });
    }
    await promisify(fs.writeFile)(
      path.join(this.sourceDir, "autogen", "main.go"),
      genBinary.stdout
    );
  }

  // Watch isn't supported for Go
  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  serve(
    port: number,
    adminPort: number,
    envs: backend.EnvironmentVariables
  ): Promise<() => Promise<void>> {
    const childProcess = spawn("go", ["run", "./autogen"], {
      env: {
        ...envs,
        PORT: port.toString(),
        ADMIN_PORT: adminPort.toString(),
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        GOPATH: process.env.GOPATH,
      },
      cwd: this.sourceDir,
      stdio: [/* stdin=*/ "ignore", /* stdout=*/ "pipe", /* stderr=*/ "inherit"],
    });
    childProcess.stdout?.on("data", (chunk) => {
      logger.debug(chunk.toString());
    });
    return Promise.resolve(async () => {
      const p = new Promise<void>((resolve, reject) => {
        childProcess.once("exit", resolve);
        childProcess.once("error", reject);
      });

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
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables
  ): Promise<backend.Backend> {
    let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      const getPort = promisify(portfinder.getPort) as () => Promise<number>;
      const port = await getPort();
      (portfinder as any).basePort = port + 1;
      const adminPort = await getPort();

      const kill = await this.serve(port, adminPort, envs);
      try {
        discovered = await discovery.detectFromPort(adminPort, this.projectId, this.runtime);
      } finally {
        await kill();
      }
    }
    discovered.environmentVariables = envs;
    return discovered;
  }
}
