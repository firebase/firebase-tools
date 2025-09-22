import { localBuild as localApphostingBuild } from "@apphosting/build";
import { OutputBundleConfig } from "@apphosting/common";
import { BuildConfig, Env, Availability } from "../gcp/apphosting";
import { readFileSync } from "fs";
import { join } from "path";
import { fileExistsSync } from "../fsutils";
import { load } from "js-yaml";
import { FirebaseError } from "../error";


export async function localBuild(
  projectRoot: string, framework: string): Promise<{annotations: Record<string, string>, buildConfig: BuildConfig}> {

    const apphostingBuildOutput: OutputBundleConfig = await localApphostingBuild(projectRoot, framework);

    const annotations: Record<string, string> = {};
    Object.entries(apphostingBuildOutput.metadata).forEach(([key, value]) => {
      annotations[key] = String(value);
    });

    const env: Env[] | undefined = apphostingBuildOutput.runConfig.environmentVariables?.map(
      ( {variable, value, availability} : Env) => {
	return {
	  variable,
	  value,
	  availability,
	};
      });

    return {
      annotations,
      buildConfig: {
	runCommand: apphostingBuildOutput.runConfig.runCommand,
	env,
      },
    }

}
