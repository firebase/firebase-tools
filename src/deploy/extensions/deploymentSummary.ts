import * as clc from "colorette";

import * as planner from "./planner";
import * as refs from "../../extensions/refs";

/**
 * humanReadable returns a human readable instanceID and reference
 * @param dep An instance spec to get the information from
 * @return a string indicating the instanceID and where it was installed from.
 */
export const humanReadable = (dep: planner.InstanceSpec): string =>
  `${clc.bold(dep.instanceId)} (${
    dep.ref ? `${refs.toExtensionVersionRef(dep.ref)}` : `Installed from local source`
  })`;

const humanReadableUpdate = (from: planner.InstanceSpec, to: planner.InstanceSpec): string => {
  if (
    from.ref &&
    to.ref &&
    from.ref.publisherId === to.ref.publisherId &&
    from.ref.extensionId === to.ref.extensionId
  ) {
    return `\t${clc.bold(from.instanceId)} (${refs.toExtensionVersionRef(from.ref)} => ${
      to.ref?.version || ""
    })`;
  } else {
    const fromRef = from.ref
      ? `${refs.toExtensionVersionRef(from.ref)}`
      : `Installed from local source`;
    const toRef = to.ref ? `${refs.toExtensionVersionRef(to.ref)}` : `Installed from local source`;
    return `\t${clc.bold(from.instanceId)} (${fromRef} => ${toRef})`;
  }
};

/**
 * createsSummary returns a formatted string of instance to be created.
 * @param toCreate a list of instances to create
 * @return a formatted string of instances to create.
 */
export function createsSummary(toCreate: planner.InstanceSpec[]): string {
  const instancesToCreate = toCreate.map((s) => `\t${humanReadable(s)}`).join("\n");
  return toCreate.length
    ? `The following extension instances will be created:\n${instancesToCreate}\n`
    : "";
}

/**
 * updatesSummary returns a formatted string of instances to be updated
 * @param toUpdate a list of instances to be updated
 * @param have a list of extensions that are deployed
 * @return a formatted string of instances to be updated
 */
export function updatesSummary(
  toUpdate: planner.InstanceSpec[],
  have: planner.InstanceSpec[],
): string {
  const instancesToUpdate = toUpdate
    .map((to) => {
      const from = have.find((exists) => exists.instanceId === to.instanceId);
      if (!from) {
        return "";
      }
      return humanReadableUpdate(from, to);
    })
    .join("\n");
  return toUpdate.length
    ? `The following extension instances will be updated:\n${instancesToUpdate}\n`
    : "";
}

/**
 * configureSummary shows a summary of what can be configured.
 * @param toConfigure The list of instances to configure
 * @return a formatted string of what will be configured
 */
export function configuresSummary(toConfigure: planner.InstanceSpec[]): string {
  const instancesToConfigure = toConfigure.map((s) => `\t${humanReadable(s)}`).join("\n");
  return toConfigure.length
    ? `The following extension instances will be configured:\n${instancesToConfigure}\n`
    : "";
}

/**
 * deleteSummary shows a summary of what can be deleted.
 * @param toDelete The list of instances that could be deleted
 * @param isDynamic If we are looking at extensions defined dynamically or not
 * @return A formatted string containing the instances to be deleted
 */
export function deletesSummary(toDelete: planner.InstanceSpec[], isDynamic: boolean): string {
  const instancesToDelete = toDelete.map((s) => `\t${humanReadable(s)}`).join("\n");
  const definedLocation = isDynamic ? "your local source code" : "'firebase.json'";
  return toDelete.length
    ? `The following extension instances are found in your project but do not exist in ${definedLocation}:\n${instancesToDelete}\n`
    : "";
}
