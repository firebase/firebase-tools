import * as fs from "fs";
import * as path from "path";
import * as spawn from "cross-spawn";
import * as yaml from "yaml";

import { FirebaseError } from "../../../../error";
import { logger } from "../../../../logger";
import * as backend from "../../backend";
import * as build from "../../build";
import { DelegateContext } from "..";
import * as supported from "../supported";
import * as discovery from "../discovery";
import * as api from "../../../../api";

/**
 * Create a runtime delegate for the Dart runtime, if applicable.
 */
export async function tryCreateDelegate(
  context: DelegateContext,
): Promise<Delegate | undefined> {
  const pubspecPath = path.join(context.sourceDir, "pubspec.yaml");

  try {
    await fs.promises.access(pubspecPath);
  } catch {
    logger.debug("Customer code is not Dart");
    return undefined;
  }

  const runtime = context.runtime ?? "dart3";
  if (!supported.isRuntime(runtime)) {
    throw new FirebaseError(`Runtime ${runtime as string} is not a valid Dart runtime`);
  }
  if (!supported.runtimeIsLanguage(runtime, "dart")) {
    throw new FirebaseError(
      `Internal error. Trying to construct a dart runtime delegate for runtime ${runtime}`,
    );
  }

  return new Delegate(context.projectId, context.projectDir, context.sourceDir, runtime);
}

export class Delegate {
  public readonly language = "dart";

  constructor(
    private readonly projectId: string,
    private readonly projectDir: string,
    private readonly sourceDir: string,
    public readonly runtime: supported.Runtime,
  ) {}

  get bin(): string {
    // On some systems, we might need the full path to dart
    // Try to use 'dart' directly first
    return "dart";
  }

  async validate(): Promise<void> {
    const pubspecPath = path.join(this.sourceDir, "pubspec.yaml");
    const serverPath = path.join(this.sourceDir, "bin", "server.dart");
    const functionsYamlPath = path.join(this.sourceDir, "lib", "functions.g.yaml");

    try {
      await fs.promises.access(pubspecPath);
    } catch {
      throw new FirebaseError("pubspec.yaml is required for Dart functions");
    }

    try {
      await fs.promises.access(serverPath);
    } catch {
      throw new FirebaseError("bin/server.dart is required for Dart functions");
    }

    // Check for generated functions.g.yaml
    try {
      await fs.promises.access(functionsYamlPath);
    } catch {
      throw new FirebaseError(
        "lib/functions.g.yaml not found. Please run 'dart run build_runner build --delete-conflicting-outputs' to generate it",
      );
    }
  }

  async build(): Promise<void> {
    // For now, we'll do the actual compilation during deployment
    // This is because we need to compile for the target platform (Linux)
    logger.debug("Dart build step - compilation will happen during deployment");
  }

  watch(): Promise<() => Promise<void>> {
    // TODO: implement Dart watch mode if needed
    return Promise.resolve(() => Promise.resolve());
  }

  /**
   * Compile the Dart server to a native executable for Linux
   */
  async compileToExecutable(outputPath: string): Promise<void> {
    const serverPath = path.join(this.sourceDir, "bin", "server.dart");
    const exePath = path.join(outputPath, "server");

    logger.info("Compiling Dart server to native executable...");

    const args = [
      "compile",
      "exe",
      "--target-os=linux",
      "--target-arch=x64",
      serverPath,
      "-o",
      exePath,
    ];

    const command = `${this.bin} ${args.join(" ")}`;
    logger.debug(`Running command: ${command}`);
    logger.debug(`Working directory: ${this.sourceDir}`);
    
    // When using shell: true, pass the entire command as a single string
    const childProcess = spawn(command, [], {
      cwd: this.sourceDir,
      stdio: "pipe",
      shell: true, // Use shell to help with PATH resolution
      env: { ...process.env }, // Explicitly pass environment
    });

    let stderr = "";
    childProcess.stderr?.on("data", (chunk: Buffer) => {
      const chunkStr = chunk.toString();
      stderr += chunkStr;
      logger.debug(`dart compile stderr: ${chunkStr}`);
    });

    childProcess.stdout?.on("data", (chunk: Buffer) => {
      logger.debug(`dart compile stdout: ${chunk.toString()}`);
    });

    await new Promise<void>((resolve, reject) => {
      childProcess.on("exit", (code) => {
        if (code === 0) {
          logger.info("Successfully compiled Dart server");
          resolve();
        } else {
          reject(new FirebaseError(`Dart compilation failed with code ${code}: ${stderr}`));
        }
      });
      childProcess.on("error", (err) => {
        if ((err as any).code === "ENOENT") {
          reject(new FirebaseError(
            "Dart SDK not found. Please ensure Dart is installed and available in your PATH.\n" +
            "You can install Dart from: https://dart.dev/get-dart"
          ));
        } else {
          reject(err);
        }
      });
    });
  }

  async discoverBuild(
    config: backend.RuntimeConfigValues,
    env: backend.EnvironmentVariables,
  ): Promise<build.Build> {
    // For Dart, we need to load functions.g.yaml from the lib directory
    const functionsYamlPath = path.join(this.sourceDir, "lib", "functions.g.yaml");
    
    let text: string;
    try {
      text = await fs.promises.readFile(functionsYamlPath, "utf8");
    } catch (err: any) {
      if (err.code === "ENOENT") {
        throw new FirebaseError(
          "Failed to find lib/functions.g.yaml. Please ensure you've run 'dart run build_runner build --delete-conflicting-outputs'",
        );
      }
      throw new FirebaseError("Failed to read functions.g.yaml", { original: err });
    }

    logger.debug("Found functions.g.yaml. Got spec:", text);
    const parsed = yaml.parse(text);
    return discovery.yamlToBuild(parsed, this.projectId, "us-central1", this.runtime);
  }
}