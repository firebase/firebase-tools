// import { localBuild as localApphostingBuild } from "@apphosting/build";
import { OutputBundleConfig } from "@apphosting/common";
import { BuildConfig, Env } from "../gcp/apphosting";

export async function localBuild(
  projectRoot: string,
  framework: string,
): Promise<{
  outputFiles: string[];
  annotations: Record<string, string>;
  buildConfig: BuildConfig;
}> {
  const { localBuild: localAppHostingBuild } = await import("@apphosting/build");
  const apphostingBuildOutput: OutputBundleConfig = await localAppHostingBuild(
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
    outputFiles: apphostingBuildOutput.outputFiles?.serverApp.include ?? [],
    annotations,
    buildConfig: {
      runCommand: apphostingBuildOutput.runConfig.runCommand,
      env,
    },
  };
}
