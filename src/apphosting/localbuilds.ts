import * as path from "path";
import { BuildConfig, Env } from "../gcp/apphosting";
import { localBuild as localAppHostingBuild } from "@apphosting/build";
import { EnvMap } from "./yaml";

/**
 * Triggers a local build of your App Hosting codebase.
 *
 * This function orchestrates the build process using the App Hosting build adapter.
 * It detects the framework (though currently defaults/assumes 'nextjs' in some contexts),
 * generates the necessary build artifacts, and returns metadata about the build.
 *
 * @param projectRoot - The root directory of the project to build.
 * @param framework - The framework to use for the build (e.g., 'nextjs').
 * @returns A promise that resolves to the build output, including:
 *          - `outputFiles`: Paths to the generated build artifacts.
 *          - `annotations`: Metadata annotations relating to the build.
 *          - `buildConfig`: Configuration derived from the build process (e.g. run commands, environment variables).
 */
export async function localBuild(
  projectRoot: string,
  framework: string,
  env: EnvMap = {},
): Promise<{
  outputFiles: string[];
  annotations: Record<string, string>;
  buildConfig: BuildConfig;
}> {
  // We need to inject the environment variables into the process.env
  // because the build adapter uses them to build the app.
  // We'll restore the original process.env after the build is done.
  const originalEnv = process.env;
  const projectNodeModules = path.join(projectRoot, "node_modules");
  const newNodePath = originalEnv.NODE_PATH
    ? `${originalEnv.NODE_PATH}${path.delimiter}${projectNodeModules}`
    : projectNodeModules;

  process.env = {
    ...originalEnv,
    ...toProcessEnv(env),
    NODE_PATH: newNodePath,
  };

  let apphostingBuildOutput;
  try {
    apphostingBuildOutput = await localAppHostingBuild(projectRoot, framework);
  } finally {
    process.env = originalEnv;
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

function toProcessEnv(env: EnvMap): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value.value || ""]),
  ) as NodeJS.ProcessEnv;
}
