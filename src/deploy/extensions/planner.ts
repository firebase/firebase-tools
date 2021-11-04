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
  extensionVersion?: extensionsApi.ExtensionVersion;
  extension?: extensionsApi.Extension;
}

/**
 * Caching fetcher for the corresponding ExtensionVersion for an instance spec.
 */
export async function getExtensionVersion(
  i: InstanceSpec
): Promise<extensionsApi.ExtensionVersion> {
  if (!i.extensionVersion) {
    if (!i.ref) {
      throw new FirebaseError(
        `Can't get ExtensionVersion for ${i.instanceId} because it has no ref`
      );
    }
    i.extensionVersion = await extensionsApi.getExtensionVersion(refs.toExtensionVersionRef(i.ref));
  }
  return i.extensionVersion;
}

/**
 * Caching fetcher for the corresponding Extension for an instance spec.
 */
export async function getExtension(i: InstanceSpec): Promise<extensionsApi.Extension> {
  if (!i.ref) {
    throw new FirebaseError(`Can't get Extensionfor ${i.instanceId} because it has no ref`);
  }
  if (!i.extension) {
    i.extension = await extensionsApi.getExtension(refs.toExtensionRef(i.ref));
  }
  return i.extension;
}

const ENV_DIRECTORY = "extensions";

/**
 * have checks a project for what extension instances are currently installed,
 * and returns them as a list of instanceSpecs.
 * @param projectId
 */
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

/**
 * want checks firebase.json and the extensions directory for which extensions
 * the user wants installed on their project.
 * @param projectId The project we are deploying to
 * @param projectDir The directory containing firebase.json and extensions/
 * @param extensions The extensions section of firebase.jsonm
 */
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
