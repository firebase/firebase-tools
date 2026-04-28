import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Availability, BuildConfig, Env } from "../gcp/apphosting";

import { localBuild as localAppHostingBuild } from "@apphosting/build";
import { EnvMap } from "./yaml";
import { loadSecret } from "./secrets/index";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { wrappedSafeLoad } from "../utils";
import { getOrDownloadUniversalMaker } from "./universalMakerDownload";

interface UniversalMakerOutput {
  command: string;
  args: string[];
  language: string;
  runtime: string;
  envVars?: Record<string, string | number | boolean>;
}

/**
 * Runs the Universal Maker binary to build the project.
 */
export async function runUniversalMaker(
  projectRoot: string,
  framework?: string,
): Promise<AppHostingBuildOutput> {
  const universalMakerBinary = await getOrDownloadUniversalMaker();
  executeUniversalMakerBinary(universalMakerBinary, projectRoot);
  return processUniversalMakerOutput(projectRoot, framework);
}

/**
 * Orchestrates the Universal Maker binary execution, including setting up temporary
 * output directories, injecting FAH-specific environment variables, and handling
 * binary-level execution errors (e.g., permission issues).
 */
function executeUniversalMakerBinary(universalMakerBinary: string, projectRoot: string): void {
  try {
    const bundleOutput = path.join(projectRoot, "bundle_output");
    if (fs.existsSync(bundleOutput)) {
      fs.rmSync(bundleOutput, { recursive: true, force: true });
    }
    fs.mkdirSync(bundleOutput, { recursive: true });

    const res = childProcess.spawnSync(
      universalMakerBinary,
      ["-application_dir", projectRoot, "-output_dir", projectRoot, "-output_format", "json"],
      {
        env: {
          ...process.env,
          X_GOOGLE_TARGET_PLATFORM: "fah",
          FIREBASE_OUTPUT_BUNDLE_DIR: bundleOutput,
        },
        stdio: "pipe",
      },
    );

    if (res.stdout) {
      logger.debug("[Universal Maker stdout]:\n" + res.stdout.toString());
    }
    if (res.stderr) {
      logger.debug("[Universal Maker stderr]:\n" + res.stderr.toString());
    }

    if (res.error) {
      throw res.error;
    }
    if (res.status !== 0) {
      throw new FirebaseError(`Universal Maker failed with exit code ${res.status ?? "unknown"}.`);
    }
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "EACCES") {
      throw new FirebaseError(
        `Failed to execute the Universal Maker binary at ${universalMakerBinary} due to permission constraints. Please assure you have set execution permissions (e.g., chmod +x) on the file.`,
      );
    }
    throw e;
  }
}

/**
 * Parses the metadata and build artifacts produced by Universal Maker.
 *
 * This includes resolving the final run command and artifact paths from the
 * generated bundle.yaml, as well as cleaning up temporary metadata files.
 */
function processUniversalMakerOutput(
  projectRoot: string,
  framework?: string,
): AppHostingBuildOutput {
  const outputFilePath = path.join(projectRoot, "build_output.json");
  if (!fs.existsSync(outputFilePath)) {
    throw new FirebaseError(
      `Universal Maker did not produce the expected output file at ${outputFilePath}`,
    );
  }
  const outputRaw = fs.readFileSync(outputFilePath, "utf-8");
  fs.unlinkSync(outputFilePath); // Clean up temporary metadata file

  const bundleOutput = path.join(projectRoot, "bundle_output");
  const targetAppHosting = path.join(projectRoot, ".apphosting");

  // Universal Maker has a bug where it accidentally empties bundle.yaml if we tell it to output directly to .apphosting.
  // To avoid this, we output to bundle_output first, and then safely move the files over.
  if (fs.existsSync(bundleOutput)) {
    if (!fs.existsSync(targetAppHosting)) {
      fs.mkdirSync(targetAppHosting, { recursive: true });
    }
    const files = fs.readdirSync(bundleOutput);
    for (const file of files) {
      const dest = path.join(targetAppHosting, file);
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { recursive: true, force: true });
      }
      fs.renameSync(path.join(bundleOutput, file), dest);
    }
    fs.rmdirSync(bundleOutput);
  }

  let umOutput: UniversalMakerOutput;
  try {
    umOutput = JSON.parse(outputRaw) as UniversalMakerOutput;
  } catch (e) {
    throw new FirebaseError(`Failed to parse build_output.json: ${(e as Error).message}`);
  }

  let finalRunCommand = `${umOutput.command} ${umOutput.args.join(" ")}`;
  let finalOutputFiles: string[] | undefined;
  const bundleYamlPath = path.join(projectRoot, ".apphosting", "bundle.yaml");
  if (fs.existsSync(bundleYamlPath)) {
    try {
      const bundleRaw = fs.readFileSync(bundleYamlPath, "utf-8");
      // Safely parse the YAML string
      const bundleData = wrappedSafeLoad(bundleRaw) as {
        runConfig?: { runCommand?: string };
        outputFiles?: { serverApp?: { include?: string[] } };
      };

      if (bundleData?.runConfig?.runCommand) {
        finalRunCommand = bundleData.runConfig.runCommand;
      }

      if (bundleData?.outputFiles?.serverApp?.include) {
        finalOutputFiles = bundleData.outputFiles.serverApp.include;
      }
    } catch (e: unknown) {
      logger.debug(`Failed to parse bundle.yaml: ${(e as Error).message}`);
    }
  }

  if (!finalOutputFiles) {
    throw new FirebaseError(
      "Failed to resolve build artifacts. Ensure Universal Maker produced a valid bundle.yaml with outputFiles.",
    );
  }

  return {
    metadata: {
      language: umOutput.language,
      runtime: umOutput.runtime,
      framework: framework || "nextjs",
    },
    runConfig: {
      runCommand: finalRunCommand,
      environmentVariables: Object.entries(umOutput.envVars || {})
        .filter(([k]) => k !== "FIREBASE_OUTPUT_BUNDLE_DIR")
        .map(([k, v]) => ({
          variable: k,
          value: String(v),
          availability: ["RUNTIME"],
        })),
    },
    outputFiles: {
      serverApp: {
        include: finalOutputFiles,
      },
    },
  };
}

export interface AppHostingBuildOutput {
  metadata: Record<string, string | number | boolean>;

  runConfig: {
    runCommand?: string;
    environmentVariables?: Array<{
      variable: string;
      value: string;
      availability: string[];
    }>;
  };
  outputFiles?: {
    serverApp: {
      include: string[];
    };
  };
}

/**
 * Triggers a local build of your App Hosting codebase.
 *
 * This function orchestrates the build process using the App Hosting build adapter.
 *
 * It detects the framework (though currently defaults/assumes 'nextjs' in some contexts),
 * generates the necessary build artifacts, and returns metadata about the build.
 * @param projectId - The project ID to use for resolving secrets.
 * @param projectRoot - The root directory of the project to build.
 * @param framework - The framework to use for the build (e.g., 'nextjs').
 * @param env - The environment configuration map to resolve and inject into the build.
 * @return A promise that resolves to the build output, including:
 *          - `outputFiles`: Paths to the generated build artifacts.
 *          - `annotations`: Metadata annotations relating to the build.
 *          - `buildConfig`: Configuration derived from the build process (e.g. run commands, environment variables).
 */
export async function localBuild(
  projectId: string,
  projectRoot: string,
  framework: string,
  env: EnvMap = {},
  options?: { nonInteractive?: boolean; allowLocalBuildSecrets?: boolean },
): Promise<{
  outputFiles: string[];
  annotations: Record<string, string>;
  buildConfig: BuildConfig;
}> {
  const hasBuildAvailableSecrets = Object.values(env).some(
    (v) => v.secret && (!v.availability || v.availability.includes("BUILD")),
  );

  if (hasBuildAvailableSecrets && !options?.allowLocalBuildSecrets) {
    if (options?.nonInteractive) {
      throw new FirebaseError(
        "Using build-available secrets during a local build in non-interactive mode requires the --allow-local-build-secrets flag.",
      );
    }
    if (
      !(await confirm({
        message:
          "Your build includes secrets that are available to the build environment. Using secrets in local builds may leave sensitive values in local artifacts/temporary files. Do you want to continue?",
        default: false,
      }))
    ) {
      throw new FirebaseError("Cancelled local build due to BUILD-available secrets.");
    }
  }

  // We need to inject the environment variables into the process.env
  // because the build adapter uses them to build the app.
  // We'll restore the original process.env after the build is done.
  const originalEnv = { ...process.env };

  const addedEnv = await toProcessEnv(projectId, env);
  for (const [key, value] of Object.entries(addedEnv)) {
    process.env[key] = value;
  }

  let apphostingBuildOutput: AppHostingBuildOutput;
  try {
    if (experiments.isEnabled("universalMaker")) {
      apphostingBuildOutput = await runUniversalMaker(projectRoot, framework);
    } else {
      const buildResult = await localAppHostingBuild(projectRoot, framework);
      apphostingBuildOutput = {
        metadata: Object.fromEntries(
          Object.entries(buildResult.metadata || {}).map(([k, v]) => [
            k,
            v as string | number | boolean,
          ]),
        ),
        runConfig: buildResult.runConfig,
        outputFiles: buildResult.outputFiles,
      };
    }
  } finally {
    for (const key in process.env) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    for (const [key, value] of Object.entries(originalEnv)) {
      process.env[key] = value;
    }
  }

  const annotations: Record<string, string> = Object.fromEntries(
    Object.entries(apphostingBuildOutput.metadata).map(([key, value]) => [key, String(value)]),
  );

  const discoveredEnv: Env[] | undefined =
    apphostingBuildOutput.runConfig.environmentVariables?.map(
      ({ variable, value, availability }) => ({
        variable,
        value,
        availability: availability as Availability[],
      }),
    );

  return {
    outputFiles: apphostingBuildOutput.outputFiles?.serverApp.include ?? [],
    annotations,
    buildConfig: {
      runCommand: apphostingBuildOutput.runConfig.runCommand,
      env: discoveredEnv ?? [],
    },
  };
}

async function toProcessEnv(projectId: string, env: EnvMap): Promise<NodeJS.ProcessEnv> {
  const entries = await Promise.all(
    Object.entries(env).map(async ([key, value]) => {
      if (value.availability && !value.availability.includes("BUILD")) {
        return null;
      }

      if (value.secret) {
        const resolvedValue = await loadSecret(projectId, value.secret);
        return [key, resolvedValue];
      } else {
        return [key, value.value || ""];
      }
    }),
  );

  const filteredEntries = entries.filter((entry): entry is [string, string] => entry !== null);
  return Object.fromEntries(filteredEntries) as NodeJS.ProcessEnv;
}
