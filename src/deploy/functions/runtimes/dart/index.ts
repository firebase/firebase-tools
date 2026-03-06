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
import { EmulatorRegistry } from "../../../../emulator/registry";
import { Emulators } from "../../../../emulator/types";

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

/**
 * Minimum Dart SDK version required.
 * Dart 3.8+ is needed for cross-compilation flags (--target-os, --target-arch).
 */
const MIN_DART_SDK_VERSION = "3.8.0";

/** Default entry point for Dart functions projects. */
export const DART_ENTRY_POINT = "bin/server.dart";

export class Delegate implements runtimes.RuntimeDelegate {
  public readonly language = "dart";
  public readonly bin = "dart";
  public readonly entryPoint = DART_ENTRY_POINT;

  private static watchModeActive = false;
  private buildRunnerProcess: ChildProcess | null = null;

  constructor(
    private readonly projectId: string,
    private readonly sourceDir: string,
    public readonly runtime: supported.Runtime & supported.RuntimeOf<"dart">,
  ) {}

  async validate(): Promise<void> {
    // Verify the Dart binary exists and meets the minimum version requirement.
    const result = spawn.sync(this.bin, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });

    if (result.error) {
      throw new FirebaseError(
        `Could not find a Dart SDK. Make sure the '${this.bin}' command is available on your PATH.`,
      );
    }

    // `dart --version` outputs e.g. "Dart SDK version: 3.8.0 (stable) ... on "macos_arm64""
    const versionOutput = (result.stdout || result.stderr || "").toString();
    const match = /Dart SDK version:\s*(\d+\.\d+\.\d+)/.exec(versionOutput);
    if (match) {
      const installedVersion = match[1];
      if (installedVersion.localeCompare(MIN_DART_SDK_VERSION, undefined, { numeric: true }) < 0) {
        throw new FirebaseError(
          `Dart SDK version ${installedVersion} is not supported. ` +
            `Firebase Functions for Dart requires Dart ${MIN_DART_SDK_VERSION} or later. ` +
            `Please upgrade your Dart SDK.`,
        );
      }
    } else {
      logger.debug(`Could not parse Dart SDK version from: ${versionOutput}`);
    }

    // Verify pubspec.yaml exists and is readable.
    const pubspecYamlPath = path.join(this.sourceDir, "pubspec.yaml");
    try {
      await fs.promises.access(pubspecYamlPath, fs.constants.R_OK);
    } catch (err: any) {
      throw new FirebaseError(`Failed to read pubspec.yaml at ${pubspecYamlPath}: ${err.message}`);
    }

    // Verify the entry point file exists.
    const entryPointPath = path.join(this.sourceDir, this.entryPoint);
    try {
      await fs.promises.access(entryPointPath, fs.constants.R_OK);
    } catch (err: any) {
      throw new FirebaseError(
        `Could not find entry point at ${entryPointPath}. ` +
          `Firebase Functions for Dart expects your main function in ${this.entryPoint}.`,
      );
    }

    // Run `dart pub get` if dependencies have not been resolved yet.
    const packageConfigPath = path.join(this.sourceDir, ".dart_tool", "package_config.json");
    try {
      await fs.promises.access(packageConfigPath, fs.constants.R_OK);
    } catch {
      logLabeledBullet("functions", "running dart pub get...");
      const pubGetProcess = spawn(this.bin, ["pub", "get"], {
        cwd: this.sourceDir,
        stdio: ["ignore", "pipe", "pipe"],
      });
      pubGetProcess.stdout?.on("data", (chunk: Buffer) => {
        logger.debug(`[dart pub get] ${chunk.toString("utf8").trim()}`);
      });
      pubGetProcess.stderr?.on("data", (chunk: Buffer) => {
        logger.debug(`[dart pub get] ${chunk.toString("utf8").trim()}`);
      });
      await new Promise<void>((resolve, reject) => {
        pubGetProcess.on("exit", (code) => {
          if (code === 0 || code === null) {
            resolve();
          } else {
            reject(
              new FirebaseError(
                `dart pub get failed with exit code ${code}. ` +
                  `Make sure your pubspec.yaml is valid and dependencies are available.`,
              ),
            );
          }
        });
        pubGetProcess.on("error", reject);
      });
    }
  }

  async build(): Promise<void> {
    // If build_runner watch is already running (on any delegate instance),
    // it handles rebuilds automatically. Skip to avoid infinite reload loops.
    if (Delegate.watchModeActive) {
      return;
    }

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
    // Skip compilation when running in the emulator (the emulator runs
    // Dart source directly via `dart run`).
    if (EmulatorRegistry.isRunning(Emulators.FUNCTIONS)) {
      logger.debug("Skipping Dart compilation in emulator mode.");
      return;
    }

    const binDir = path.join(this.sourceDir, "bin");
    await fs.promises.mkdir(binDir, { recursive: true });

    logLabeledBullet("functions", "compiling Dart to linux-x64 executable...");

    const compileProcess = spawn(
      this.bin,
      [
        "compile",
        "exe",
        this.entryPoint,
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
                `dart compile exe ${this.entryPoint} --target-os=linux --target-arch=x64`,
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
  async watch(onRebuild?: () => void): Promise<() => Promise<void>> {
    Delegate.watchModeActive = true;
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

    const buildCompletePattern = /Succeeded after|Built with build_runner/;

    buildRunnerProcess.stdout?.on("data", (chunk: Buffer) => {
      const output = chunk.toString("utf8").trim();
      if (output) {
        logger.debug(`[build_runner] ${output}`);
        if (buildCompletePattern.test(output)) {
          if (!initialBuildComplete) {
            initialBuildComplete = true;
            logger.debug("build_runner initial build completed");
            resolveInitialBuild();
          } else if (onRebuild) {
            // Subsequent rebuild detected — notify the emulator to reload triggers
            onRebuild();
          }
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
    envs: backend.EnvironmentVariables,
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

    // The Dart manifest emits platform "gcfv2" so the emulator treats
    // functions as v2 CloudEvent endpoints (getSignatureType needs "gcfv2").
    // During deploy, convert to "run" so fabricator.ts creates Cloud Run services.
    // The emulator passes FUNCTIONS_EMULATOR=true in envs; deploy does not.
    const isEmulator = envs.FUNCTIONS_EMULATOR === "true";
    if (!isEmulator) {
      for (const ep of Object.values(discovered.endpoints)) {
        if (ep.platform === "gcfv2") {
          (ep as any).platform = "run";
        }
      }
    }

    return discovered;
  }
}
