import * as clc from "cli-color";

import * as planner from "./planner";
import * as refs from "../../extensions/refs";

export const humanReadable = (dep: planner.InstanceSpec) =>
  `${clc.bold(dep.instanceId)} (${
    dep.ref ? `${refs.toExtensionVersionRef(dep.ref)}` : `Installed from local source`
  })`;

const humanReadableUpdate = (from: planner.InstanceSpec, to: planner.InstanceSpec) => {
  if (
    from.ref?.publisherId == to.ref?.publisherId &&
    from.ref?.extensionId == to.ref?.extensionId
  ) {
    return `\t${clc.bold(from.instanceId)} (${refs.toExtensionVersionRef(from.ref!)} => ${
      to.ref?.version
    })`;
  } else {
    const fromRef = from.ref
      ? `${refs.toExtensionVersionRef(from.ref)}`
      : `Installed from local source`;
    return `\t${clc.bold(from.instanceId)} (${fromRef} => ${refs.toExtensionVersionRef(to.ref!)})`;
  }
};

export function createsSummary(toCreate: planner.InstanceSpec[]): string {
  return toCreate.length
    ? `The following extension instances will be created:\n${toCreate
        .map((s) => `\t${humanReadable(s)}`)
        .join("\n")}\n`
    : "";
}

export function updatesSummary(
  toUpdate: planner.InstanceSpec[],
  have: planner.InstanceSpec[]
): string {
  const summary = toUpdate
    .map((to) => {
      const from = have.find((exists) => exists.instanceId == to.instanceId);
      return humanReadableUpdate(from!, to);
    })
    .join("\n");
  return toUpdate.length ? `The following extension instances will be updated:\n${summary}\n` : "";
}

export function configuresSummary(toConfigure: planner.InstanceSpec[]) {
  return toConfigure.length
    ? `The following extension instances will be configured:\n${toConfigure
        .map((s) => `\t${humanReadable(s)}`)
        .join("\n")}\n`
    : "";
}

export function deletesSummary(toDelete: planner.InstanceSpec[]) {
  return toDelete.length
    ? `The following extension instances are not listed in 'firebase.json':\n${toDelete
        .map((s) => `\t${humanReadable(s)}`)
        .join("\n")}\n`
    : "";
}
