import * as clc from "colorette";
const Table = require("cli-table");

import { listInstances } from "./extensionsApi";
import { logger } from "../logger";
import { last, logLabeledBullet } from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as extensionsUtils from "./utils";

/**
 * Lists the extensions installed under a project
 * @param projectId ID of the project we're querying
 * @return mapping that contains a list of instances under the "instances" key
 */
export async function listExtensions(projectId: string): Promise<Record<string, string>[]> {
  const instances = await listInstances(projectId);
  if (instances.length < 1) {
    logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`,
    );
    return [];
  }

  const table = new Table({
    head: ["Extension", "Publisher", "Instance ID", "State", "Version", "Your last update"],
    style: { head: ["yellow"] },
  });
  // Order instances newest to oldest.
  const sorted = instances.sort(
    (a, b) => new Date(b.createTime).valueOf() - new Date(a.createTime).valueOf(),
  );
  const formatted: Record<string, string>[] = [];
  sorted.forEach((instance) => {
    let extension = instance.config.extensionRef || "";
    let publisher;
    if (extension === "") {
      extension = instance.config.source.spec.name || "";
      publisher = "N/A";
    } else {
      publisher = extension.split("/")[0];
    }
    const instanceId = last(instance.name.split("/")) ?? "";
    const state =
      instance.state +
      ((instance.config.source.state || "ACTIVE") === "DELETED" ? " (UNPUBLISHED)" : "");
    const version = instance?.config?.source?.spec?.version;
    const updateTime = extensionsUtils.formatTimestamp(instance.updateTime);
    table.push([extension, publisher, instanceId, state, version, updateTime]);
    formatted.push({
      extension,
      publisher,
      instanceId,
      state,
      version,
      updateTime,
    });
  });

  logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return formatted;
}
