import { RC } from "../rc";

export function saveEtags(
  rc: RC,
  projectId: string,
  instances: { instanceId: string; etag?: string }[],
): void {
  rc.setEtags(projectId, "extensionInstances", etagsMap(instances));
}

// detectEtagChanges compares the last set of etags stored in .firebaserc to the currently deployed etags,
// and returns the ids on any instances have different etags.
export function detectEtagChanges(
  rc: RC,
  projectId: string,
  instances: { instanceId: string; etag?: string }[],
): string[] {
  const lastDeployedEtags = rc.getEtags(projectId).extensionInstances;
  const currentEtags = etagsMap(instances);
  // If we don't have a record of the last deployed state, detect no changes.
  if (!lastDeployedEtags || !Object.keys(lastDeployedEtags).length) {
    return [];
  }
  // find any instances that changed since last deploy
  const changedExtensionInstances = Object.entries(lastDeployedEtags)
    .filter(([instanceName, etag]) => etag !== currentEtags[instanceName])
    .map((i) => i[0]);
  // find any instances that we installed out of band since last deploy
  const newExtensionInstances = Object.keys(currentEtags).filter(
    (instanceName) => !lastDeployedEtags[instanceName],
  );
  return newExtensionInstances.concat(changedExtensionInstances);
}

function etagsMap(instances: { instanceId: string; etag?: string }[]): Record<string, string> {
  return instances.reduce(
    (acc, i) => {
      if (i.etag) {
        acc[i.instanceId] = i.etag;
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}
