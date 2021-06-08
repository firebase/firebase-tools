import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as spawn from "cross-spawn";
import * as portfinder from "portfinder";

import { FirebaseError } from "../../../../error";
import { Options } from "../../../../options";
import { logger } from "../../../../logger";
import * as args from "../../args";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as getProjectId from "../../../../getProjectId";
import * as runtimes from "..";
import * as modules from "./modules";
const VERSION_TO_RUNTIME: Record<string, runtimes.Runtime> = {
  "1.13": "go113",
};

export async function tryCreateDelegate(
  context: args.Context,
  options: Options
): Promise<Delegate | undefined> {
  const sourceDirName = options.config.get("functions.source") as string;
  const sourceDir = options.config.path(sourceDirName);
  const goModPath = path.join(sourceDir, "go.mod");
  const projectId = getProjectId(options);

  let module: modules.Module;
  try {
    const modBuffer = await promisify(fs.readFile)(goModPath);
    module = modules.parseModule(modBuffer.toString("utf8"));
  } catch (err) {
    logger.debug("Customer code is not Golang code (or they aren't using modules)");
    return;
  }

  let runtime = options.config.get("functions.runtime");
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

  return new Delegate(projectId, sourceDirName, sourceDir, runtime, module);
}

// A module can be much more complicated than this, but this is all we need so far.
// for a full reference, see https://golang.org/doc/modules/gomod-ref
export class Delegate {
  public readonly name = "golang";

  constructor(
    private readonly projectId: string,
    private readonly sourceDirName: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime,
    private readonly module: modules.Module,
  ) {}
  validate(): Promise<void> {
    // throw new FirebaseError("Cannot yet analyze Go source code");
    return Promise.resolve();
  }

  build(): Promise<void> {
    const res = spawn.sync("go", ["build"], {
      cwd: this.sourceDir,
      stdio: "inherit",
    });
    if (res.error) {
      logger.debug("Got error running go build", res);
      throw new FirebaseError("Failed to build functions source", { children: [res.error] });
    }

    return Promise.resolve();
  }

  watch(): Promise<() => Promise<void>> {
    return Promise.resolve(() => Promise.resolve());
  }

  async serve(port: number, envs: backend.EnvironmentVariables): Promise<() => Promise<void>> {
    const serverFile = path.join(__dirname, "../discovery/mockDiscoveryServer.js");
    const childProcess = spawn("npx", [serverFile], {
      env: {
        ...envs,
        PATH: process.env.PATH,
      },
      stdio: "inherit",
    });
    return () => {
      const p = new Promise<void>((resolve) => {
        childProcess.once("exit", resolve);
      });
      childProcess.kill("SIGTERM");
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
      return p;
    }
  }

  async discoverSpec(
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables
  ): Promise<backend.Backend> {
    let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
    if (!discovered) {
      const port = await promisify(portfinder.getPort)();
      const kill = await this.serve(8080, {
        ...envs,
        "BACKEND": `
        cloudFunctions:
          - apiVersion: 1
            id: HelloWorldFromYAML
            entryPoint: HelloWorld
            trigger:
              allowInsecure: false
        `,
      })
      try {
        discovered = await discovery.detectFromPort(8080, this.projectId, this.runtime);
      } finally {
        await kill();
      }
    }
    discovered.environmentVariables = envs;
    return discovered;
  }
}
