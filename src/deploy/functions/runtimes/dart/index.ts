import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as spawn from "cross-spawn";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as supported from "../supported";
import { logger } from "../../../../logger";
import { FirebaseError } from "../../../../error";
import { Build } from "../../build";

/**
 * Create a runtime delegate for the Dart runtime, if applicable.
 * @param context runtimes.DelegateContext
 * @return Delegate Dart runtime delegate
 */
export async function tryCreateDelegate(
  context: runtimes.DelegateContext,
): Promise<Delegate | undefined> {
  const pubspecYamlPath = path.join(context.sourceDir, "pubspec.yaml");

  if (!(await promisify(fs.exists)(pubspecYamlPath))) {
    logger.debug("Customer code is not Dart code.");
    return;
  }
  const runtime = context.runtime ?? supported.latest("dart");
  if (!supported.isRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime as string} is not a valid Dart runtime`);
  }
  if (!supported.runtimeIsLanguage(runtime, "dart")) {
    throw new FirebaseError(
      `Internal error. Trying to construct a dart runtime delegate for runtime ${runtime}`,
      { exit: 1 },
    );
  }
  return Promise.resolve(new Delegate(context.projectId, context.sourceDir, runtime));
}

export class Delegate implements runtimes.RuntimeDelegate {
  public readonly language = "dart";
  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: supported.Runtime & supported.RuntimeOf<"dart">,
  ) {}

  private _bin = "";

  get bin(): string {
    if (this._bin === "") {
      this._bin = "dart";
    }
    return this._bin;
  }

  async validate(): Promise<void> {
    // Basic validation: check that pubspec.yaml exists and is readable
    const pubspecYamlPath = path.join(this.sourceDir, "pubspec.yaml");
    try {
      await fs.promises.access(pubspecYamlPath, fs.constants.R_OK);
      // TODO: could add more validation like checking for firebase_functions dependency
    } catch (err: any) {
      throw new FirebaseError(`Failed to read pubspec.yaml at ${pubspecYamlPath}: ${err.message}`);
    }
  }

  async build(): Promise<void> {
    // No-op: build_runner handles building
    return Promise.resolve();
  }

  watch(): Promise<() => Promise<void>> {
    // No-op: The FunctionsEmulator handles build_runner watch for hot reload
    return Promise.resolve(() => Promise.resolve());
  }

  async discoverBuild(
    _configValues: backend.RuntimeConfigValues, // eslint-disable-line @typescript-eslint/no-unused-vars
    _envs: backend.EnvironmentVariables, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Build> {
    // Use file-based discovery from functions.yaml in the project root
    const yamlDir = this.sourceDir;
    const yamlPath = path.join(yamlDir, "functions.yaml");
    let discovered = await discovery.detectFromYaml(yamlDir, this.projectId, this.runtime);

    if (!discovered) {
      // If the file doesn't exist yet, run build_runner to generate it
      logger.debug("functions.yaml not found, running build_runner to generate it...");
      const buildRunnerProcess = spawn(this.bin, ["run", "build_runner", "build"], {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

      // Log build_runner output
      buildRunnerProcess.stdout?.on("data", (chunk: Buffer) => {
        logger.debug(`[build_runner] ${chunk.toString("utf8")}`);
      });
      buildRunnerProcess.stderr?.on("data", (chunk: Buffer) => {
        logger.debug(`[build_runner] ${chunk.toString("utf8")}`);
      });

      await new Promise<void>((resolve, reject) => {
        buildRunnerProcess.on("exit", (code) => {
          if (code === 0 || code === null) {
            resolve();
          } else {
            reject(
              new FirebaseError(
                `build_runner failed with exit code ${code}. Make sure your Dart project is properly configured.`,
              ),
            );
          }
        });
        buildRunnerProcess.on("error", reject);
      });

      // Try to discover again after build_runner completes
      discovered = await discovery.detectFromYaml(yamlDir, this.projectId, this.runtime);
      if (!discovered) {
        throw new FirebaseError(
          `Could not find functions.yaml at ${yamlPath} after running build_runner. ` +
            `Make sure your Dart project is properly configured with firebase_functions.`,
        );
      }
    }

    // Normalize "run" → "gcfv2" for emulator compatibility.
    // The manifest emits "run" for Cloud Run deployment, but the emulator treats
    // Dart functions identically to gcfv2 — routing is handled via runtime detection.
    for (const ep of Object.values(discovered.endpoints)) {
      if (ep.platform === "run") {
        ep.platform = "gcfv2";
      }
    }

    return discovered;
  }
}
