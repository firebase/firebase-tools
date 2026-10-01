import * as runtimes from "../../deploy/functions/runtimes";
import * as supported from "../../deploy/functions/runtimes/supported";
import * as functionsConfig from "../../functionsConfig";
import * as projectConfig from "../projectConfig";
import * as functionsEnv from "../../functions/env";
import { logger } from "../../logger";
import * as yaml from "js-yaml";
import { needProjectId } from "../../projectUtils";
import { FirebaseError } from "../../error";

export type Exporter = (
  options: any,
  codebase: projectConfig.ValidatedSingle,
) => Promise<Record<string, string>>;

/**
 * Exports the functions.yaml format of the codebase.
 */
export async function getInternalIac(
  options: any,
  codebase: projectConfig.ValidatedSingle,
): Promise<Record<string, string>> {
  if (!codebase.source) {
    throw new FirebaseError("Cannot export a codebase with no source");
  }
  const projectId = needProjectId(options);

  const firebaseConfig = await functionsConfig.getFirebaseConfig(options);
  const firebaseEnvs = functionsEnv.loadFirebaseEnvs(firebaseConfig, projectId);

  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir: options.config.path(codebase.source),
    projectDir: options.config.projectDir,
    runtime: codebase.runtime,
  };

  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  logger.debug(`Validating ${runtimeDelegate.language} source`);
  supported.guardVersionSupport(runtimeDelegate.runtime);
  await runtimeDelegate.validate();

  logger.debug(`Building ${runtimeDelegate.language} source`);
  await runtimeDelegate.build();

  const userEnvOpt: functionsEnv.UserEnvsOpts = {
    functionsSource: options.config.path(codebase.source),
    projectId,
    projectAlias: options.projectAlias,
    projectDir: options.config.projectDir,
  };
  const configDir = projectConfig.resolveConfigDir(codebase, codebase.codebase);
  if (configDir) {
    userEnvOpt.configDir = options.config.path(configDir);
  }
  const userEnvs = functionsEnv.loadUserEnvs(userEnvOpt);

  logger.debug(`Discovering ${runtimeDelegate.language} source`);
  const build = await runtimeDelegate.discoverBuild(
    {}, // Assume empty runtimeConfig
    {
      ...userEnvs,
      ...firebaseEnvs,
    },
  );

  return {
    "functions.yaml": yaml.dump(build),
  };
}
