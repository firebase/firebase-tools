import { ParsedTriggerDefinition } from "../../emulator/functionsEmulatorShared";
import * as paramHelper from "../paramHelper";
import * as specHelper from "./specHelper";
import * as triggerHelper from "./triggerHelper";
import { ExtensionSpec, Param, ParamType } from "../types";
import * as extensionsHelper from "../extensionsHelper";
import * as planner from "../../deploy/extensions/planner";
import { needProjectId } from "../../projectUtils";
import { SecretEnvVar } from "../../deploy/functions/backend";

/**
 * TODO: Better name? Also, should this be in extensionsEmulator instead?
 */
export async function getExtensionFunctionInfo(
  instance: planner.DeploymentInstanceSpec,
  paramValues: Record<string, string>,
): Promise<{
  runtime: string;
  extensionTriggers: ParsedTriggerDefinition[];
  nonSecretEnv: Record<string, string>;
  secretEnvVariables: SecretEnvVar[];
}> {
  const spec = await planner.getExtensionSpec(instance);
  const functionResources = specHelper.getFunctionResourcesWithParamSubstitution(spec, paramValues);
  const extensionTriggers: ParsedTriggerDefinition[] = functionResources
    .map((r) => triggerHelper.functionResourceToEmulatedTriggerDefintion(r, instance.systemParams))
    .map((trigger) => {
      trigger.name = `ext-${instance.instanceId}-${trigger.name}`;
      return trigger;
    });
  const runtime = specHelper.getRuntime(functionResources);

  const nonSecretEnv = getNonSecretEnv(spec.params ?? [], paramValues);
  const secretEnvVariables = getSecretEnvVars(spec.params ?? [], paramValues);
  return {
    extensionTriggers,
    runtime,
    nonSecretEnv,
    secretEnvVariables,
  };
}

const isSecretParam = (p: Param) =>
  p.type === extensionsHelper.SpecParamType.SECRET || p.type === ParamType.SECRET;

/**
 * getNonSecretEnv checks extension spec for secret params, and returns env without those secret params
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
export function getNonSecretEnv(
  params: Param[],
  paramValues: Record<string, string>,
): Record<string, string> {
  const getNonSecretEnv: Record<string, string> = Object.assign({}, paramValues);
  const secretParams = params.filter(isSecretParam);
  for (const p of secretParams) {
    delete getNonSecretEnv[p.param];
  }
  return getNonSecretEnv;
}

/**
 * getSecretEnvVars checks which params are secret, and returns a list of SecretEnvVar for each one that is is in use
 * @param params A list of params to check for secret params
 * @param paramValues A Record of all params to their values
 */
export function getSecretEnvVars(
  params: Param[],
  paramValues: Record<string, string>,
): SecretEnvVar[] {
  const secretEnvVar: SecretEnvVar[] = [];
  const secretParams = params.filter(isSecretParam);
  for (const s of secretParams) {
    if (paramValues[s.param]) {
      const [, projectId, , secret, , version] = paramValues[s.param].split("/");
      secretEnvVar.push({
        key: s.param,
        secret,
        projectId,
        version,
      });
    }
    // TODO: Throw an error if a required secret is missing?
  }
  return secretEnvVar;
}

/**
 * Exported for testing
 */
export function getParams(options: any, extensionSpec: ExtensionSpec) {
  const projectId = needProjectId(options);
  const userParams = paramHelper.readEnvFile(options.testParams);
  const autoParams = {
    PROJECT_ID: projectId,
    EXT_INSTANCE_ID: extensionSpec.name,
    DATABASE_INSTANCE: projectId,
    DATABASE_URL: `https://${projectId}.firebaseio.com`,
    STORAGE_BUCKET: `${projectId}.appspot.com`,
  };
  const unsubbedParamsWithoutDefaults = Object.assign(autoParams, userParams);

  const unsubbedParams = extensionsHelper.populateDefaultParams(
    unsubbedParamsWithoutDefaults,
    extensionSpec.params,
  );
  // Run a substitution to support params that reference other params.
  return extensionsHelper.substituteParams<Record<string, string>>(unsubbedParams, unsubbedParams);
}
