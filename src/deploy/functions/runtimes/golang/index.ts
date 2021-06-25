import { promisify } from "util";
import * as path from "path";
import * as fs from "fs";
import * as spawn from "cross-spawn";

import { FirebaseError } from "../../../../error";
import { Options } from "../../../../options";
import { logger } from "../../../../logger";
import * as args from "../../args";
import * as backend from "../../backend";
import * as getProjectId from "../../../../getProjectId";
import * as runtimes from "..";

export const ADMIN_SDK = "firebase.google.com/go/v4";
export const FUNCTIONS_SDK = "github.com/FirebaseExtended/firebase-functions-go";

const VERSION_TO_RUNTIME: Record<string, runtimes.Runtime> = {
  "1.13": "go113",
};

export async function tryCreateDelegate(
  context: args.Context,
  options: Options
): Promise<Delegate | undefined> {
  const relativeSourceDir = options.config.get("functions.source") as string;
  const sourceDir = options.config.path(relativeSourceDir);
  const goModPath = path.join(sourceDir, "go.mod");
  const projectId = getProjectId(options);

  let module: Module;
  try {
    const modBuffer = await promisify(fs.readFile)(goModPath);
    module = parseModule(modBuffer.toString("utf8"));
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

  return new Delegate(projectId, sourceDir, runtime, module);
}

// A module can be much more complicated than this, but this is all we need so far.
// For a full reference, see https://golang.org/doc/modules/gomod-ref
interface Module {
  module: string;
  version: string;
  dependencies: Record<string, string>;
}

export function parseModule(mod: string): Module {
  const module: Module = {
    module: "",
    version: "",
    dependencies: {},
  };
  const lines = mod.split("\n");
  let inRequire = false;
  for (const line of lines) {
    if (inRequire) {
      const endRequireMatch = /\)/.exec(line);
      if (endRequireMatch) {
        inRequire = false;
        continue;
      }

      const requireMatch = /([^ ]+) (.*)/.exec(line);
      if (requireMatch) {
        module.dependencies[requireMatch[1]] = requireMatch[2];
        continue;
      }

      if (line.trim()) {
        logger.debug("Don't know how to handle line", line, "inside a mod.go require block");
      }
      continue;
    }
    const modMatch = /^module (.*)$/.exec(line);
    if (modMatch) {
      module.module = modMatch[1];
      continue;
    }
    const versionMatch = /^go (\d+\.\d+)$/.exec(line);
    if (versionMatch) {
      module.version = versionMatch[1];
      continue;
    }

    const requireMatch = /^require ([^ ]+) (.*)$/.exec(line);
    if (requireMatch) {
      module.dependencies[requireMatch[1]] = requireMatch[2];
      continue;
    }

    const requireBlockMatch = /^require +\(/.exec(line);
    if (requireBlockMatch) {
      inRequire = true;
      continue;
    }

    if (line.trim()) {
      logger.debug("Don't know how to handle line", line, "in mod.go");
    }
  }

  if (!module.module) {
    throw new FirebaseError("Module has no name");
  }
  if (!module.version) {
    throw new FirebaseError(`Module ${module.module} has no go version`);
  }

  return module;
}

export class Delegate {
  public readonly name = "golang";

  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: runtimes.Runtime,
    private readonly module: Module
  ) {}
  validate(): Promise<void> {
    throw new FirebaseError("Cannot yet analyze Go source code");
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

  discoverSpec(
    configValues: backend.RuntimeConfigValues,
    envs: backend.EnvironmentVariables
  ): Promise<backend.Backend> {
    throw new FirebaseError("Cannot yet discover function specs");
  }
}
