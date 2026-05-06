import { BuildConfig, Env } from "../gcp/apphosting";
import { localBuild as localAppHostingBuild } from "@apphosting/build";
import { EnvMap } from "./yaml";
import { loadSecret } from "./secrets";
import { confirm } from "../prompt";
import { FirebaseError } from "../error";

/**
 * Triggers a local build of your App Hosting codebase.
 *
 * This function orchestrates the build process using the App Hosting build adapter.
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

  let apphostingBuildOutput;
  try {
    apphostingBuildOutput = await localAppHostingBuild(projectRoot, framework);
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
