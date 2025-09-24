import { localBuild as localApphostingBuild } from "@apphosting/build";
import { OutputBundleConfig } from "@apphosting/common";
import { BuildConfig, Env } from "../gcp/apphosting";

export async function localBuild(
  projectRoot: string,
  framework: string,
): Promise<{ annotations: Record<string, string>; buildConfig: BuildConfig }> {
  const apphostingBuildOutput: OutputBundleConfig = await localApphostingBuild(
    projectRoot,
    framework,
  );

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
    annotations,
    buildConfig: {
      runCommand: apphostingBuildOutput.runConfig.runCommand,
      env,
    },
  };
}
