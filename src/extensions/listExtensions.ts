import * as _ from "lodash";
import * as clc from "cli-color";
import Table = require("cli-table");

import { ExtensionInstance, listInstances } from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import * as utils from "../utils";
import * as extensionsUtils from "./utils";
import { logger } from "../logger";

/**
 * Lists the extensions installed under a project
 * @param projectId ID of the project we're querying
 * @return mapping that contains a list of instances under the "instances" key
 */
export async function listExtensions(projectId: string): Promise<any> {
  const instances = await listInstances(projectId);
  if (instances.length < 1) {
    utils.logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`
    );
    return [];
  }

  const table = new Table({
    head: ["Extension", "Publisher", "Instance ID", "State", "Version", "Your last update"],
    style: { head: ["yellow"] },
  });
  // Order instances newest to oldest.
  const sorted = _.sortBy(instances, "createTime", "asc").reverse();
  const formatted: Record<string, string>[] = [];
  sorted.forEach((instance) => {
    let extension = _.get(instance, "config.extensionRef", "");
    let publisher;
    if (extension === "") {
      extension = _.get(instance, "config.source.spec.name", "");
      publisher = "N/A";
    } else {
      publisher = extension.split("/")[0];
    }
    const instanceId = _.last(instance.name.split("/")) ?? "";
    const state =
      instance.state +
      (_.get(instance, "config.source.state", "ACTIVE") === "DELETED" ? " (UNPUBLISHED)" : "");
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

  utils.logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return formatted;
}
