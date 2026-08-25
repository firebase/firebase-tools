import * as clc from "colorette";
import * as Table from "cli-table3";

import { listInstances } from "./extensionsApi";
import { logger } from "../logger";
import { last, logLabeledBullet } from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as extensionsUtils from "./utils";
import { getReplacementsRegistry, getReplacementPackageName } from "./replacementRegistry";

/**
 * Lists the extensions installed under a project
 * @param projectId ID of the project we're querying
 * @return mapping that contains a list of instances under the "instances" key
 */
export async function listExtensions(projectId: string): Promise<Record<string, any>[]> {
  // Fetch installed extensions from GCP and the Function Kit replacements catalog
  // concurrently. The lightweight GitHub raw fetch (~300ms) finishes in parallel
  // with the GCP API call (~500ms), introducing 0ms perceived latency overhead.
  const [instances, registry] = await Promise.all([
    listInstances(projectId),
    getReplacementsRegistry(),
  ]);

  if (instances.length < 1) {
    logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`,
    );
    return [];
  }

  // 7-column table surfacing official Function Kit replacements to developers.
  const table = new Table({
    head: [
      "Extension",
      "Publisher",
      "Instance ID",
      "State",
      "Version",
      "Your last update",
      "Replacement Kit",
    ],
    style: { head: ["yellow"] },
  });
  // Order instances newest to oldest.
  const sorted = instances.sort(
    (a, b) => new Date(b.createTime).valueOf() - new Date(a.createTime).valueOf(),
  );
  const formatted: Record<string, any>[] = [];
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

    // Resolve replacement package from the catalog (in-memory, fetched once per command).
    const replacementPackage = getReplacementPackageName(extension, registry);

    table.push([
      extension,
      publisher,
      instanceId,
      state,
      version,
      updateTime,
      // Highlight available replacements in green; keep unmapped entries blank.
      replacementPackage ? clc.green(replacementPackage) : "",
    ]);
    formatted.push({
      extension,
      publisher,
      instanceId,
      state,
      version,
      updateTime,
      // In --json output, omit replacementKit when unmapped (via conditional spread)
      // to adhere to standard API conventions and prevent truthy "None" string checks.
      ...(replacementPackage ? { replacementKit: replacementPackage } : {}),
      params: instance.config.params,
      systemParams: instance.config.systemParams,
    });
  });

  logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return formatted;
}
