import { BuildConfig, Env } from "../gcp/apphosting";
import { localBuild as localAppHostingBuild } from "@apphosting/build";

/**
 * Triggers a local apphosting build.
 */
export async function localBuild(
  projectRoot: string,
  framework: string,
): Promise<{
  outputFiles: string[];
  annotations: Record<string, string>;
  buildConfig: BuildConfig;
}> {
  const apphostingBuildOutput = await localAppHostingBuild(projectRoot, framework);

  const annotations: Record<string, string> = Object.fromEntries(
    Object.entries(apphostingBuildOutput.metadata).map(([key, value]) => [key, String(value)]),
  );

  const env: Env[] | undefined = apphostingBuildOutput.runConfig.environmentVariables?.map(
    ({ variable, value, availability }) => ({
      variable,
      value,
      availability,
    }),
  );

  return {
    outputFiles: apphostingBuildOutput.outputFiles?.serverApp.include ?? ["poop"],
    annotations,
    buildConfig: {
      runCommand: apphostingBuildOutput.runConfig.runCommand,
      env: env ?? [],
    },
  };
}
