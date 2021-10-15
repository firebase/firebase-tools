import * as path from "path";
import * as semver from "semver";

import { FirebaseError } from "../../error";
import * as extensionsApi from "../../extensions/extensionsApi";
import { getFirebaseProjectParams, substituteParams } from "../../extensions/extensionsHelper";
import * as refs from "../../extensions/refs";
import { readEnvFile } from "../../extensions/paramHelper";
import { logger } from "../../logger";

export interface InstanceSpec {
  instanceId: string;
  ref?: refs.Ref;
  params: Record<string, string>;
}

const ENV_DIRECTORY = "extensions";

export async function have(projectId: string): Promise<InstanceSpec[]> {
  const instances = await extensionsApi.listInstances(projectId);
  return instances.map((i) => {
    const dep: InstanceSpec = {
      instanceId: i.name.split("/").pop()!,
      params: i.config.params,
    };
    if (i.config.extensionRef) {
      const ref = refs.parse(i.config.extensionRef);
      dep.ref = ref;
      dep.ref.version = i.config.extensionVersion;
    }
    return dep;
  });
}

export async function want(
  projectId: string,
  projectDir: string,
  extensions: Record<string, string>
): Promise<InstanceSpec[]> {
  const instanceSpecs: InstanceSpec[] = [];
  const errors: FirebaseError[] = [];
  for (const e of Object.entries(extensions)) {
    try {
      const instanceId = e[0];
      const ref = refs.parse(e[1]);
      ref.version = await resolveVersion(ref);

      const params = readParams(projectDir, instanceId);
      const autoPopulatedParams = await getFirebaseProjectParams(projectId);
      const subbedParams = substituteParams(params, autoPopulatedParams);

      instanceSpecs.push({
        instanceId,
        ref,
        params: subbedParams,
      });
    } catch (err) {
      logger.debug(`Got error reading extensions entry ${e}: ${err}`);
      errors.push(err as FirebaseError);
    }
  }
  if (errors.length) {
    const messages = errors.map((err) => `- ${err.message}`).join("\n");
    throw new FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`);
  }
  return instanceSpecs;
}

/**
 * resolveVersion resolves a semver string to the max matching version.
 * Exported for testing.
 * @param publisherId
 * @param extensionId
 * @param version a semver or semver range
 */
export async function resolveVersion(ref: refs.Ref): Promise<string> {
  if (!ref.version || ref.version == "latest") {
    return "latest";
  }
  const extensionRef = refs.toExtensionRef(ref);
  const versions = await extensionsApi.listExtensionVersions(extensionRef);
  const maxSatisfying = semver.maxSatisfying(
    versions.map((ev) => ev.spec.version),
    ref.version
  );
  if (!maxSatisfying) {
    throw new FirebaseError(
      `No version of ${extensionRef} matches requested version ${ref.version}`
    );
  }
  return maxSatisfying;
}

function readParams(projectDir: string, instanceId: string): Record<string, string> {
  const paramPath = path.join(projectDir, ENV_DIRECTORY, `${instanceId}.env`);
  const params = readEnvFile(paramPath);
  return params as Record<string, string>;
}
