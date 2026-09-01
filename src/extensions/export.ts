import { getExtensionVersion, DeploymentInstanceSpec } from "../deploy/extensions/planner";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { logger } from "../logger";
import {
  parseSecretVersionResourceName,
  toSecretVersionResourceName,
  SECRET_VERSION_NAME_REGEX,
} from "../gcp/secretManager";
import { getActiveSecrets } from "./secretsUtils";
import { ExtensionInstance } from "./types";
import { transferSecretToKits, secretHasExtensionsLabel } from "../deploy/extensions/secrets";
import { FirebaseError } from "../error";
import { logLabeledError } from "../utils";

/**
 * parameterizeProject searchs spec.params for any param that include projectId or projectNumber,
 * and replaces it with a parameterized version that can be used on other projects.
 * For example, 'my-project-id.appspot.com' becomes '${param:PROJECT_ID}.appspot.com`
 */
export function parameterizeProject(
  projectId: string,
  projectNumber: string,
  spec: DeploymentInstanceSpec,
): DeploymentInstanceSpec {
  const newParams: Record<string, string> = {};
  for (const [key, val] of Object.entries(spec.params)) {
    const p1 = val.replace(projectId, "${param:PROJECT_ID}");
    const p2 = p1.replace(projectNumber, "${param:PROJECT_NUMBER}");
    newParams[key] = p2;
  }
  const newSpec = { ...spec };
  newSpec.params = newParams;
  return newSpec;
}

/**
 * setSecretParamsToLatest searches spec.params for any secret paramsthat are active, and changes their version to latest.
 * We do this because old secret versions are destroyed on instance update, and to ensure that cross project installs work smoothly.
 */
export async function setSecretParamsToLatest(
  spec: DeploymentInstanceSpec,
): Promise<DeploymentInstanceSpec> {
  const newParams = { ...spec.params };
  const extensionVersion = await getExtensionVersion(spec);
  const activeSecrets = getActiveSecrets(extensionVersion.spec, newParams);
  for (const [key, val] of Object.entries(newParams)) {
    if (activeSecrets.includes(val)) {
      const parsed = parseSecretVersionResourceName(val);
      parsed.versionId = "latest";
      newParams[key] = toSecretVersionResourceName(parsed);
    }
  }
  return { ...spec, params: newParams };
}

/**
 *
 */
export function displayExportInfo(
  withRef: DeploymentInstanceSpec[],
  withoutRef: DeploymentInstanceSpec[],
): void {
  logger.info("The following Extension instances will be saved locally:");
  logger.info("");

  displaySpecs(withRef);

  if (withoutRef.length) {
    logger.info(
      `Your project also has the following instances installed from local sources. These will not be saved to firebase.json:`,
    );
    for (const spec of withoutRef) {
      logger.info(spec.instanceId);
    }
  }
}

/**
 * Displays a summary of the Extension instances and configurations that will be saved locally.
 * @param specs The instances that will be saved locally.
 */
function displaySpecs(specs: DeploymentInstanceSpec[]): void {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    logger.info(`${i + 1}. ${humanReadable(spec)}`);
    logger.info(`Configuration will be written to 'extensions/${spec.instanceId}.env'`);
    for (const p of Object.entries(spec.params)) {
      logger.info(`\t${p[0]}=${p[1]}`);
    }
    if (spec.allowedEventTypes?.length) {
      logger.info(`\tALLOWED_EVENTS=${spec.allowedEventTypes}`);
    }
    if (spec.eventarcChannel) {
      logger.info(`\tEVENTARC_CHANNEL=${spec.eventarcChannel}`);
    }
    logger.info("");
  }
}

/**
 * Translates a currently deployed Extension instance into a Functions environment.
 * This includes setting any default params not set in the deployed instance to their
 * default value, writing any system params under the reserved EXT_MIGRATED_SYSTEM_ prefix,
 * and writing any secret references under the reserved FIREBASE_SECRET_REF_ prefix.
 */
export function functionsEnvFromInstance(instance: ExtensionInstance): Record<string, string> {
  const liveParams = instance.config?.params || {};
  const liveSystemParams = instance.config?.systemParams || {};
  const specParams = instance.config?.source?.spec?.params || [];
  const specSystemParams = instance.config?.source?.spec?.systemParams || [];

  const envs: Record<string, string> = {};

  // Every user param must be available, so we replicate the spec's default behavior if not present
  specParams.forEach((specParam) => {
    if (specParam.type === "SECRET") {
      const renamed = "FIREBASE_SECRET_REF_" + specParam.param;
      envs[renamed] = liveParams[specParam.param];
    } else if (specParam.param in liveParams) {
      envs[specParam.param] = liveParams[specParam.param];
    } else {
      envs[specParam.param] = specParam.default ?? "";
    }
  });

  // System params aren't necessarily defined in the spec, but we do respect any defaults
  for (const [sysParamName, sysParamValue] of Object.entries(liveSystemParams)) {
    let renamed = sysParamName
      .replace(/^firebaseextensions\.v1beta\.(v2)?function\//, "EXT_MIGRATED_SYSTEM_")
      .toUpperCase();
    if (renamed === "EXT_MIGRATED_SYSTEM_LOCATION") {
      renamed = "FUNCTION_DEFAULT_REGION";
    }
    envs[renamed] = sysParamValue;
  }
  for (const specSystemParam of specSystemParams) {
    if (specSystemParam.param in liveSystemParams) {
      continue;
    }
    if ("default" in specSystemParam) {
      let renamed = specSystemParam.param
        .replace(/^firebaseextensions\.v1beta\.(v2)?function\//, "EXT_MIGRATED_SYSTEM_")
        .toUpperCase();
      if (renamed === "EXT_MIGRATED_SYSTEM_LOCATION") {
        renamed = "FUNCTION_DEFAULT_REGION";
      }
      envs[renamed] = specSystemParam.default ?? "";
    }
  }

  // Also pull in ALLOWED_EVENTS and EVENTARC_CHANNEL
  if (typeof instance.config.allowedEventTypes !== "undefined") {
    envs["EXT_SELECTED_EVENTS"] = instance.config.allowedEventTypes.toString();
  }
  if (typeof instance.config.eventarcChannel !== "undefined") {
    envs["EVENTARC_CHANNEL"] = instance.config.eventarcChannel;
  }

  return envs;
}

/**
 * Returns the list of all secrets in an ExtensionInstance that still have the Extensions
 * management label, and will need to be changed for a Kits migration.
 * @return a list of all outstanding secrets, in projectId/secretId format
 */
export async function secretsNeedingEjection(instance: ExtensionInstance): Promise<string[]> {
  const liveParams = instance.config?.params || {};
  const secretParams = (instance.config?.source?.spec?.params ?? []).filter(
    (p) => p.type === "SECRET",
  );

  const checks = secretParams.map(async (specParam) => {
    const secretName = specParam.param;
    const resourceName = liveParams[secretName];
    if (!resourceName) {
      throw new FirebaseError(
        "Secret " +
          secretName +
          " was defined in the extension spec, but is missing in live deployed secrets.",
        { exit: 1 },
      );
    }
    const match = resourceName.match(SECRET_VERSION_NAME_REGEX);
    if (!match?.groups) {
      throw new FirebaseError("Invalid secret version resource name [" + resourceName + "].");
    }
    const projectId = match.groups.project;
    const secretId = match.groups.secret;
    const hasLabel = await secretHasExtensionsLabel(projectId, secretId);
    return hasLabel ? `${projectId}/${secretId}` : undefined;
  });

  const results = await Promise.all(checks);
  return results.filter((r): r is string => r !== undefined);
}

/**
 * Removes the Extensions label from all secrets in an ExtensionInstance and replaces them
 * them with the Functions label.
 * @return {success: string[], fail: string[]}, both in projectId/secretId format
 */
export async function ejectSecretsFromInstance(
  instance: ExtensionInstance,
): Promise<{ success: string[]; fail: string[] }> {
  const success: string[] = [];
  const fail: string[] = [];

  const liveParams = instance.config?.params || {};
  for (const specParam of instance.config?.source?.spec?.params ?? []) {
    if (specParam.type !== "SECRET") {
      continue;
    }
    const secretName = specParam.param;
    const resourceName = liveParams[secretName];
    if (!resourceName) {
      throw new FirebaseError(
        `Secret ${secretName} was defined in the extension spec, but is missing in live deployed secrets.`,
        { exit: 1 },
      );
    }
    const match = resourceName.match(SECRET_VERSION_NAME_REGEX);
    if (!match?.groups) {
      throw new FirebaseError(`Invalid secret version resource name [${resourceName}].`);
    }
    const projectId = match.groups.project;
    const secretId = match.groups.secret;
    const combinedId = `${projectId}/${secretId}`;
    try {
      await transferSecretToKits(projectId, secretId);
      success.push(combinedId);
    } catch (err: unknown) {
      fail.push(combinedId);
      const message = err instanceof Error ? err.message : String(err);
      logLabeledError("extensions", "failed to change labels on " + combinedId + ": " + message);
    }
  }
  return { success: success, fail: fail };
}
