import * as clc from "cli-color";

import * as refs from "./refs";
import { getProjectNumber } from "../getProjectNumber";
import { Options } from "../options";
import { Config } from "../config";
import { getExtensionVersion, InstanceSpec } from "../deploy/extensions/planner";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { parseSecretVersionResourceName, toSecretVersionResourceName } from "../gcp/secretManager";
import { getActiveSecrets } from "./secretsUtils";
import { writeEnvFiles, writeExtensionsToFirebaseJson } from "./manifestHelper";
/**
 * parameterizeProject searchs spec.params for any param that include projectId or projectNumber,
 * and replaces it with a parameterized version that can be used on other projects.
 * For example, 'my-project-id.appspot.com' becomes '${param:PROJECT_ID}.appspot.com`
 */
export function parameterizeProject(
  projectId: string,
  projectNumber: string,
  spec: InstanceSpec
): InstanceSpec {
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
export async function setSecretParamsToLatest(spec: InstanceSpec): Promise<InstanceSpec> {
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

export function displayExportInfo(withRef: InstanceSpec[], withoutRef: InstanceSpec[]): void {
  logger.info("The following Extension instances will be saved locally:");
  logger.info("");

  displaySpecs(withRef);

  if (withoutRef.length) {
    logger.info(
      `Your project also has the following instances installed from local sources. These will not be saved to firebase.json:`
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
function displaySpecs(specs: InstanceSpec[]): void {
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    logger.info(`${i + 1}. ${humanReadable(spec)}`);
    logger.info(`Configuration will be written to 'extensions/${spec.instanceId}.env'`);
    for (const p of Object.entries(spec.params)) {
      logger.info(`\t${p[0]}=${p[1]}`);
    }
    logger.info("");
  }
}
