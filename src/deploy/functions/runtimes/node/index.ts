import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

import { FirebaseError } from "../../../../error";
import { Options } from "../../../../options";
import { getRuntimeChoice } from "./parseRuntimeAndValidateSDK";
import * as args from "../../args";
import * as backend from "../../backend";
import * as getProjectId from "../../../../getProjectId";
import * as runtimes from "..";
import * as validate from "./validate";
import { logger } from "../../../../logger";
import * as versioning from "./versioning";
import * as parseTriggers from "./parseTriggers";

export async function tryCreateDelegate(
  context: args.Context,
  options: Options
): Promise<Delegate | undefined> {
  const sourceDirName = options.config.get("functions.source") as string;
  const sourceDir = options.config.path(sourceDirName);
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

  return new Delegate(
    getProjectId(options),
    options.config.projectDir,
    sourceDirName,
    sourceDir,
    runtime
  );
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
    private readonly sourceDirName: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime
  ) {}

  // Using a caching interface because we (may/will) eventually depend on the SDK version
  // to decide whether to use the JS export method of discovery or the HTTP container contract
  // method of discovery.
  _sdkVersion: string = "";
  get sdkVersion() {
    if (!this._sdkVersion) {
      this._sdkVersion = versioning.getFunctionsSDKVersion(this.sourceDir) || "";
    }
    return this._sdkVersion;
  }

  validate(): Promise<void> {
    versioning.checkFunctionsSDKVersion(this.sdkVersion);

    validate.packageJsonIsValid(this.sourceDirName, this.sourceDir, this.projectDir);

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

  async discoverSpec(
    config: backend.RuntimeConfigValues,
    env: backend.EnvironmentVariables
  ): Promise<backend.Backend> {
    return parseTriggers.discoverBackend(this.projectId, this.sourceDir, this.runtime, config, env);
  }
}
