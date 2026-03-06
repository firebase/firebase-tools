import { FirebaseError } from "../../error";
import * as runtimes from "./runtimes";
import * as supported from "./runtimes/supported";
import * as backend from "./backend";
import { logger } from "../../logger";
import * as yaml from "js-yaml";

export async function getFunctionsManifest(
  sourceDir: string,
  projectDir: string,
  projectId: string,
  runtime: string | undefined,
  envs: backend.EnvironmentVariables,
  format: "internal" | "terraform" | "designcenter",
): Promise<Record<string, string>> {
  if (format !== "internal") {
    throw new FirebaseError(`The ${format} format export is not yet supported`);
  }

  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir,
    projectDir,
    runtime: (runtime || supported.latest("nodejs")) as supported.Runtime, // runtimes.getRuntimeDelegate handles validating runtime
  };

  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  logger.debug(`Validating ${runtimeDelegate.language} source`);
  supported.guardVersionSupport(runtimeDelegate.runtime);
  await runtimeDelegate.validate();

  logger.debug(`Building ${runtimeDelegate.language} source`);
  await runtimeDelegate.build();

  logger.debug(`Discovering ${runtimeDelegate.language} source`);
  const build = await runtimeDelegate.discoverBuild(
    {}, // Assume empty runtimeConfig
    envs,
  );

  return {
    "functions.yaml": yaml.dump(build),
  };
}
