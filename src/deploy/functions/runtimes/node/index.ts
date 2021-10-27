import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as portfinder from "portfinder";
import * as spawn from "cross-spawn";
import fetch from "node-fetch";

import { FirebaseError } from "../../../../error";
import { Options } from "../../../../options";
import { getRuntimeChoice } from "./parseRuntimeAndValidateSDK";
import { needProjectId } from "../../../../projectUtils";
import { logger } from "../../../../logger";
import { previews } from "../../../../previews";
import * as args from "../../args";
import * as backend from "../../backend";
import * as runtimes from "..";
import * as validate from "./validate";
import * as versioning from "./versioning";
import * as parseTriggers from "./parseTriggers";
import * as discovery from "../discovery";

/**
 *
 */
export async function tryCreateDelegate(
  context: args.Context,
  options: Options
): Promise<Delegate | undefined> {
  const projectRelativeSourceDir = options.config.get("functions.source") as string;
  const sourceDir = options.config.path(projectRelativeSourceDir);
  const packageJsonPath = path.join(sourceDir, "package.json");

  if (!(await promisify(fs.exists)(packageJsonPath))) {
    logger.debug("Customer code is not Node");
    return undefined;
  }

  // Check what runtime to use, first in firebase.json, then in 'engines' field.
  let runtime = (options.config.get("functions.runtime") as runtimes.Runtime) || "";
  // TODO: This method loads the Functions SDK version which is then manually loaded elsewhere.
  // We should find a way to refactor this code so we're not repeatedly invoking node.
  runtime = getRuntimeChoice(sourceDir, runtime);

  if (!runtime.startsWith("nodejs")) {
    logger.debug(
      "Customer has a package.json but did not get a nodejs runtime. This should not happen"
    );
    throw new FirebaseError(`Unexpected runtime ${runtime}`);
  }

  return new Delegate(needProjectId(options), options.config.projectDir, sourceDir, runtime);
}

// TODO(inlined): Consider moving contents in parseRuntimeAndValidateSDK and validate around.
// Those two files are currently pretty coupled (e.g. they borrow error messages from each other)
// and both files load package.json. Maybe the delegate should be constructed with a package.json and
// that can be passed to both methods.
export class Delegate {
  public readonly name = "nodejs";

  constructor(
    private readonly projectId: string,
    private readonly projectDir: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
  ) {}

  // Using a caching interface because we (may/will) eventually depend on the SDK version
  // to decide whether to use the JS export method of discovery or the HTTP container contract
  // method of discovery.
  _sdkVersion = "";
  get sdkVersion() {
    if (!this._sdkVersion) {
      this._sdkVersion = versioning.getFunctionsSDKVersion(this.sourceDir) || "";
    }
    return this._sdkVersion;
  }

  validate(): Promise<void> {
    versioning.checkFunctionsSDKVersion(this.sdkVersion);

    const relativeDir = path.relative(this.projectDir, this.sourceDir);
    validate.packageJsonIsValid(relativeDir, this.sourceDir, this.projectDir);

    return Promise.resolve();
  }

  async build(): Promise<void> {
    // TODO: consider running npm build or tsc. This is currently redundant with predeploy hooks,
    // so we would need to detect and notify users that they can just use idiomatic options instead.
  }

  watch(): Promise<() => Promise<void>> {
    // TODO: consider running npm run watch if it is defined or tsc watch when tsconfig.json is present.
    return Promise.resolve(() => Promise.resolve());
  }

  serve(
    port: number,
    adminPort: number,
    envs: backend.EnvironmentVariables
  ): Promise<() => Promise<void>> {
    // TODO: Fix command path?
    const childProcess = spawn("node_modules/.bin/firebase-functions", [this.sourceDir], {
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
    childProcess.stdout.on("data", (chunk) => {
      logger.debug(chunk.toString());
    });
    return Promise.resolve(async () => {
      const p = new Promise<void>((resolve, reject) => {
        childProcess.once("exit", resolve);
        childProcess.once("error", reject);
      });

      // If we SIGKILL the child process we're actually going to kill the go
      // runner and the webserver it launched will keep running.
      await fetch(`http://localhost:${adminPort}/quitquitquit`);
      setTimeout(() => {
        if (!childProcess.killed) {
          childProcess.kill("SIGKILL");
        }
      }, 10_000);
      return p;
    });
  }

  async discoverSpec(
    config: backend.RuntimeConfigValues,
    env: backend.EnvironmentVariables
  ): Promise<backend.Backend> {
    if (previews.functionsv2) {
      // TODO: Use container contract only if user code is using supported SDK v.
      console.log("Discovering spec via container contract!");
      let discovered = await discovery.detectFromYaml(this.sourceDir, this.projectId, this.runtime);
      if (!discovered) {
        const getPort = promisify(portfinder.getPort) as () => Promise<number>;
        const port = await getPort();
        (portfinder as any).basePort = port + 1;
        const adminPort = await getPort();

        const kill = await this.serve(port, adminPort, env);
        try {
          discovered = await discovery.detectFromPort(adminPort, this.projectId, this.runtime);
        } finally {
          await kill();
        }
      }
      discovered.environmentVariables = env;
      return discovered;
    }
    return parseTriggers.discoverBackend(this.projectId, this.sourceDir, this.runtime, config, env);
  }
}
