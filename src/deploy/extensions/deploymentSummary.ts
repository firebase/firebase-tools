import * as clc from "colorette";

import * as planner from "./planner";
import * as refs from "../../extensions/refs";

export const humanReadable = (dep: planner.InstanceSpec) =>
  `${clc.bold(dep.instanceId)} (${
    dep.ref ? `${refs.toExtensionVersionRef(dep.ref)}` : `Installed from local source`
  })`;

const humanReadableUpdate = (from: planner.InstanceSpec, to: planner.InstanceSpec) => {
  if (
    from.ref &&
    to.ref &&
    from.ref.publisherId === to.ref.publisherId &&
    from.ref.extensionId === to.ref.extensionId
  ) {
    return `\t${clc.bold(from.instanceId)} (${refs.toExtensionVersionRef(from.ref!)} => ${
      to.ref?.version
    })`;
  } else {
    const fromRef = from.ref
      ? `${refs.toExtensionVersionRef(from.ref)}`
      : `Installed from local source`;
    const toRef = to.ref ? `${refs.toExtensionVersionRef(to.ref)}` : `Installed from local source`;
    return `\t${clc.bold(from.instanceId)} (${fromRef} => ${toRef})`;
  }
};

export function createsSummary(toCreate: planner.InstanceSpec[]): string {
  const instancesToCreate = toCreate.map((s) => `\t${humanReadable(s)}`).join("\n");
  return toCreate.length
    ? `The following extension instances will be created:\n${instancesToCreate}\n`
    : "";
}

export function updatesSummary(
  toUpdate: planner.InstanceSpec[],
  have: planner.InstanceSpec[],
): string {
  const instancesToUpdate = toUpdate
    .map((to) => {
      const from = have.find((exists) => exists.instanceId === to.instanceId);
      return humanReadableUpdate(from!, to);
    })
    .join("\n");
  return toUpdate.length
    ? `The following extension instances will be updated:\n${instancesToUpdate}\n`
    : "";
}

export function configuresSummary(toConfigure: planner.InstanceSpec[]) {
  const instancesToConfigure = toConfigure.map((s) => `\t${humanReadable(s)}`).join("\n");
  return toConfigure.length
    ? `The following extension instances will be configured:\n${instancesToConfigure}\n`
    : "";
}

export function deletesSummary(toDelete: planner.InstanceSpec[]) {
  const instancesToDelete = toDelete.map((s) => `\t${humanReadable(s)}`).join("\n");
  return toDelete.length
    ? `The following extension instances are not listed in 'firebase.json':\n${instancesToDelete}\n`
    : "";
}
