import * as _ from "lodash";
import * as clc from "cli-color";
import Table = require("cli-table");

import { ExtensionInstance, listInstances } from "./extensionsApi";
import { logPrefix } from "./extensionsHelper";
import * as utils from "../utils";
import * as logger from "../logger";
import * as moment from "moment";

export async function listExtensions(
  projectId: string
): Promise<{ instances: ExtensionInstance[] }> {
  const instances = await listInstances(projectId);
  if (instances.length < 1) {
    utils.logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`
    );
    return { instances: [] };
  }

  const table = new Table({
    head: ["Instance ID", "Author", "State", "Version", "Last update"],
    style: { head: ["yellow"] },
  });
  // Order instances newest to oldest.
  const sorted = _.sortBy(instances, "createTime", "asc").reverse();
  sorted.forEach((instance) => {
    table.push([
      _.last(instance.name.split("/")),
      _.get(instance, "config.source.spec.author.authorName", ""),
      instance.state,
      _.get(instance, "config.source.spec.version", ""),
      instance.updateTime ? moment(instance.updateTime).format("YYYY-MM-DD [T]HH:mm:ss") : "",
    ]);
  });

  utils.logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return { instances: sorted };
}
