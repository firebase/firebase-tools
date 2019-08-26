import * as _ from "lodash";
import * as clc from "cli-color";
import Table = require("cli-table");

import { listInstances, ModInstance } from "./modsApi";
import { logPrefix } from "./modsHelper";
import * as utils from "../utils";
import * as logger from "../logger";

export async function listMods(projectId: string): Promise<{ instances: ModInstance[] }> {
  const instances = await listInstances(projectId);
  if (instances.length < 1) {
    utils.logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`
    );
    return { instances: [] };
  }

  const table = new Table({
    head: ["Extension Instance ID", "State", "Extension Version", "Create Time", "Update Time"],
    style: { head: ["yellow"] },
  });

  // Order instances newest to oldest.
  const sorted = _.sortBy(instances, "createTime", "asc").reverse();
  sorted.forEach((instance) => {
    table.push([
      _.last(instance.name.split("/")),
      instance.state,
      _.get(instance, "configuration.source.spec.version", ""),
      instance.createTime,
      instance.updateTime,
    ]);
  });

  utils.logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return { instances: sorted };
}
