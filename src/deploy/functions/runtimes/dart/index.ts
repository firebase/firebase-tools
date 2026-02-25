import * as fs from "fs";
import * as path from "path";
import { promisify } from "util";
import * as spawn from "cross-spawn";
import { ChildProcess } from "child_process";

import * as runtimes from "..";
import * as backend from "../../backend";
import * as discovery from "../discovery";
import * as supported from "../supported";
import { logger } from "../../../../logger";
import { FirebaseError } from "../../../../error";
import { logLabeledBullet } from "../../../../utils";
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
  public readonly bin = "dart";

  private buildRunnerProcess: ChildProcess | null = null;

  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: supported.Runtime & supported.RuntimeOf<"dart">,
  ) {}

  async validate(): Promise<void> {
    const pubspecYamlPath = path.join(this.sourceDir, "pubspec.yaml");
    try {
      await fs.promises.access(pubspecYamlPath, fs.constants.R_OK);
    } catch (err: any) {
      throw new FirebaseError(`Failed to read pubspec.yaml at ${pubspecYamlPath}: ${err.message}`);
    }
  }

  async build(): Promise<void> {
    // Run build_runner to generate up-to-date functions.yaml
    logLabeledBullet("functions", "running build_runner...");

    const buildRunnerProcess = spawn(
      this.bin,
      ["run", "build_runner", "build", "--delete-conflicting-outputs"],
      {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    buildRunnerProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(`[build_runner] ${chunk.toString("utf8").trim()}`);
    });
    buildRunnerProcess.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`[build_runner] ${chunk.toString("utf8").trim()}`);
    });

    await new Promise<void>((resolve, reject) => {
      buildRunnerProcess.on("exit", (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(
            new FirebaseError(
              `build_runner failed with exit code ${code}. ` +
                `Make sure your Dart project is properly configured.`,
            ),
          );
        }
      });
      buildRunnerProcess.on("error", reject);
    });

    // Cross-compile Dart to a Linux x86_64 executable for Cloud Run.
    // Requires Dart 3.8+ for --target-os and --target-arch support.
    const binDir = path.join(this.sourceDir, "bin");
    await fs.promises.mkdir(binDir, { recursive: true });

    logLabeledBullet("functions", "compiling Dart to linux-x64 executable...");

    const compileProcess = spawn(
      this.bin,
      [
        "compile",
        "exe",
        "lib/main.dart",
        "-o",
        "bin/server",
        "--target-os=linux",
        "--target-arch=x64",
      ],
      {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    compileProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(`[dart compile] ${chunk.toString("utf8").trim()}`);
    });
    compileProcess.stderr?.on("data", (chunk: Buffer) => {
      logger.debug(`[dart compile] ${chunk.toString("utf8").trim()}`);
    });

    await new Promise<void>((resolve, reject) => {
      compileProcess.on("exit", (code) => {
        if (code === 0 || code === null) {
          resolve();
        } else {
          reject(
            new FirebaseError(
              `Dart compilation failed with exit code ${code}. ` +
                `Make sure your Dart project compiles successfully with: ` +
                `dart compile exe lib/main.dart --target-os=linux --target-arch=x64`,
            ),
          );
        }
      });
      compileProcess.on("error", reject);
    });

    logLabeledBullet("functions", "Dart compilation complete.");
  }

  /**
   * Start build_runner in watch mode for hot reload.
   * Returns a cleanup function that stops the build_runner process.
   * The returned promise resolves once the initial build completes.
   */
  async watch(): Promise<() => Promise<void>> {
    logger.debug("Starting build_runner watch for Dart functions...");

    const buildRunnerProcess = spawn(
      this.bin,
      ["run", "build_runner", "watch", "--delete-conflicting-outputs"],
      {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.buildRunnerProcess = buildRunnerProcess;

    let initialBuildComplete = false;
    let resolveInitialBuild: () => void;
    let rejectInitialBuild: (err: Error) => void;

    const initialBuildPromise = new Promise<void>((resolve, reject) => {
      resolveInitialBuild = resolve;
      rejectInitialBuild = reject;
    });

    buildRunnerProcess.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8").trim();
      if (output) {
        logger.debug(`[build_runner] ${output}`);
        if (!initialBuildComplete && output.includes("Succeeded after")) {
          initialBuildComplete = true;
          logger.debug("build_runner initial build completed");
          resolveInitialBuild();
        }
      }
    });

    buildRunnerProcess.stderr?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8").trim();
      if (output) {
        logger.debug(`[build_runner] ${output}`);
      }
    });

    buildRunnerProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        logger.debug(`build_runner exited with code ${code}. Initial build failed.`);
        if (!initialBuildComplete) {
          rejectInitialBuild(
            new FirebaseError(
              `build_runner exited with code ${code}. Your Dart functions may not be deployed or emulated correctly.`,
            ),
          );
        }
      }
      this.buildRunnerProcess = null;
    });

    buildRunnerProcess.on("error", (err) => {
      logger.debug(
        `Failed to start build_runner: ${err.message}. Your Dart functions may not be deployed or emulated correctly.`,
      );
      if (!initialBuildComplete) {
        rejectInitialBuild(err);
      }
    });

    await initialBuildPromise;

    // Return cleanup function
    return async () => {
      if (this.buildRunnerProcess && !this.buildRunnerProcess.killed) {
        this.buildRunnerProcess.kill("SIGTERM");
        this.buildRunnerProcess = null;
      }
    };
  }

  async discoverBuild(
    _configValues: backend.RuntimeConfigValues, // eslint-disable-line @typescript-eslint/no-unused-vars
    _envs: backend.EnvironmentVariables, // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<Build> {
    const yamlDir = this.sourceDir;
    const yamlPath = path.join(yamlDir, "functions.yaml");
    let discovered = await discovery.detectFromYaml(yamlDir, this.projectId, this.runtime);

    if (!discovered) {
      logger.debug("functions.yaml not found, running build_runner to generate it...");
      const buildRunnerProcess = spawn(this.bin, ["run", "build_runner", "build"], {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      });

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

      discovered = await discovery.detectFromYaml(yamlDir, this.projectId, this.runtime);
      if (!discovered) {
        throw new FirebaseError(
          `Could not find functions.yaml at ${yamlPath} after running build_runner. ` +
            `Make sure your Dart project is properly configured with firebase_functions.`,
        );
      }
    }

    // Normalize "run" → "gcfv2" for emulator compatibility.
    // The emulator doesn't support "run" platform, but production deploys need it.
    const isEmulator = !!process.env["FIREBASE_EMULATOR_HUB"];
    if (isEmulator) {
      for (const ep of Object.values(discovered.endpoints)) {
        if (ep.platform === "run") {
          ep.platform = "gcfv2";
        }
      }
    }

    return discovered;
  }
}
