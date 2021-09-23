import * as path from "path";
import * as semver from "semver";

import { FirebaseError } from "../../error";
import * as extensionsApi from "../../extensions/extensionsApi";
import { readEnvFile } from "../../extensions/paramHelper";

interface Deployable {
  instanceId: string,
  publisherId?: string,
  extensionId?: string,
  version: string,
  params: Record<string, string>,
}

const ENV_DIRECTORY = "extensions"

export async function have(projectId: string): Promise<Deployable[]> {
  const instances = await extensionsApi.listInstances(projectId);
  return instances.map(i => {
    const dep: Deployable =  {
      instanceId: i.name.split("/").pop()!,
      version: i.config.extensionVersion!,
      params: i.config.params
    }
    if (i.config.extensionRef) {
      const ref = extensionsApi.parseRef(i.config.extensionRef);
      dep.publisherId = ref.publisherId;
      dep.extensionId = ref.extensionId;
    }
    return dep;
  });
}

export async function want(extensions: Record<string, string>, projectDir: string):  Promise<Deployable[]> {
  const deployables: Deployable[] = [];
  const errors: FirebaseError[] = [];
  for (const e of Object.entries(extensions)) {
    try {
      const instanceId = e[0];
      const extensionVersionRef = extensionsApi.parseRef(e[1]);
      const resolvedVersion = await resolveVersion(
        extensionVersionRef.publisherId,
        extensionVersionRef.extensionId,
        extensionVersionRef.version,
      );
      const params = readParams(projectDir, instanceId);
      deployables.push({
        instanceId,
        publisherId: extensionVersionRef.publisherId,
        extensionId: extensionVersionRef.extensionId,
        version: resolvedVersion,
        params,
      });
    } catch (err) {
      console.log(e, err);
      errors.push(err as FirebaseError);
    }
  }
  if (errors.length) {
    const messages = errors.map(e => e.message).join("\n");
    throw new FirebaseError(`Errors while reading 'extensions' in 'firebase.json'\n${messages}`)
  }
  return deployables;
}

/**
 * resolveVersion resolves a semver string to the max matching version.
 * @param publisherId
 * @param extensionId
 * @param version a semver or semver range 
 */
async function resolveVersion(publisherId: string, extensionId: string, version?: string): Promise<string> {
  if (!version || version == "latest") {
    return "latest";
  }
  const extensionRef = `${publisherId}/${extensionId}`;
  const versions = await extensionsApi.listExtensionVersions(extensionRef);
  const maxSatisfying = semver.maxSatisfying(versions.map(ev => ev.spec.version), version);
  if (!maxSatisfying) {
    throw new FirebaseError(`No version of ${extensionRef} matches requested version ${version}`);
  }
  return maxSatisfying;
}

function readParams(projectDir: string, instanceId: string): Record<string, string> {
  const paramPath = path.join(projectDir, ENV_DIRECTORY, `${instanceId}.env`);
  const params = readEnvFile(paramPath);
  return params as Record<string, string>;
}