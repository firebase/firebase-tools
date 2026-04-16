import * as childProcess from "child_process";
import * as fs from "fs";
import * as path from "path";
import { BuildConfig, Env } from "../gcp/apphosting";
import { localBuild as localAppHostingBuild } from "@apphosting/build";
import { EnvMap } from "./yaml";
import { loadSecret } from "./secrets";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";

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
export function runUniversalMaker(projectRoot: string, framework?: string): AppHostingBuildOutput {
  if (!process.env.UNIVERSAL_MAKER_BINARY) {
    throw new FirebaseError(
      "Please specify the path to your Universal Maker binary by establishing the UNIVERSAL_MAKER_BINARY environment variable.",
    );
  }

  try {
    childProcess.spawnSync(
      process.env.UNIVERSAL_MAKER_BINARY,
      ["-application_dir", projectRoot, "-output_dir", projectRoot, "-output_format", "json"],
      {
        env: {
          ...process.env,
          X_GOOGLE_TARGET_PLATFORM: "fah",
          FIREBASE_OUTPUT_BUNDLE_DIR: ".apphosting",
          NPM_CONFIG_REGISTRY: "https://registry.npmjs.org/",
        },
        stdio: "inherit",
      },
    );
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "EACCES") {
      throw new FirebaseError(
        "Failed to execute the Universal Maker binary due to permission constraints. Please assure you have set chmod +x on your file.",
      );
    }
    throw e;
  }

  const outputFilePath = path.join(projectRoot, "build_output.json");
  if (!fs.existsSync(outputFilePath)) {
    throw new FirebaseError(
      `Universal Maker did not produce the expected output file at ${outputFilePath}`,
    );
  }

  const outputRaw = fs.readFileSync(outputFilePath, "utf-8");
  let umOutput: UniversalMakerOutput;
  try {
    umOutput = JSON.parse(outputRaw) as UniversalMakerOutput;
  } catch (e) {
    throw new FirebaseError(`Failed to parse build_output.json: ${(e as Error).message}`);
  }

  return {
    metadata: {
      language: umOutput.language,
      runtime: umOutput.runtime,
      framework: framework || "nextjs",
    },
    runConfig: {
      runCommand: `${umOutput.command} ${umOutput.args.join(" ")}`,
      environmentVariables: Object.entries(umOutput.envVars || {}).map(([k, v]) => ({
        variable: k,
        value: String(v),
        availability: ["RUNTIME"],
      })),
    },
    outputFiles: {
      serverApp: {
        include: [".apphosting"],
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
      apphostingBuildOutput = runUniversalMaker(projectRoot, framework);
    } else {
      apphostingBuildOutput = (await localAppHostingBuild(
        projectRoot,
        framework,
      )) as unknown as AppHostingBuildOutput;
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
        availability,
      }),
    ) as unknown as Env[] | undefined;

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
