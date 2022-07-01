/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as clc from "cli-color";
import Table = require("cli-table");

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
      `there are no extensions installed on project ${clc.bold(projectId)}.`
    );
    return [];
  }

  const table = new Table({
    head: ["Extension", "Publisher", "Instance ID", "State", "Version", "Your last update"],
    style: { head: ["yellow"] },
  });
  // Order instances newest to oldest.
  const sorted = instances.sort(
    (a, b) => new Date(b.createTime).valueOf() - new Date(a.createTime).valueOf()
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
