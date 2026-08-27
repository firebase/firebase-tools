import * as clc from "colorette";
import * as Table from "cli-table3";

import { listInstances } from "./extensionsApi";
import { logger } from "../logger";
import { last, logLabeledBullet } from "../utils";
import { logPrefix } from "./extensionsHelper";
import * as experiments from "../experiments";
import * as extensionsUtils from "./utils";
import {
  getReplacementsRegistry,
  getReplacementPackageName,
  ReplacementRegistrySchema,
} from "./replacementRegistry";

/**
 * Lists the extensions installed under a project
 * @param projectId ID of the project we're querying
 * @return mapping that contains a list of instances under the "instances" key
 */
export async function listExtensions(projectId: string): Promise<Record<string, any>[]> {
  const showReplacements = experiments.isEnabled("extMigrationFeatures");

  let instances: any[];
  let registry: ReplacementRegistrySchema | undefined;

  if (showReplacements) {
    // Fetch installed extensions from GCP and the Function Kit replacements catalog
    // concurrently to minimize latency overhead by running the network calls in parallel.
    [instances, registry] = await Promise.all([
      listInstances(projectId),
      getReplacementsRegistry(),
    ]);
  } else {
    instances = await listInstances(projectId);
  }

  if (instances.length < 1) {
    logLabeledBullet(
      logPrefix,
      `there are no extensions installed on project ${clc.bold(projectId)}.`,
    );
    return [];
  }

  const head = ["Extension", "Publisher", "Instance ID", "State", "Version", "Your last update"];
  if (showReplacements) {
    head.push("Replacement Kit");
  }

  const table = new Table({
    head,
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

    const row = [extension, publisher, instanceId, state, version, updateTime];

    let replacementPackage: string | undefined;
    if (showReplacements && registry) {
      // Resolve replacement package from the catalog (in-memory, fetched once per command).
      replacementPackage = getReplacementPackageName(extension, registry);
      // Highlight available replacements in green; keep unmapped entries blank.
      row.push(replacementPackage ? clc.green(replacementPackage) : "");
    }

    table.push(row);
    formatted.push({
      extension,
      publisher,
      instanceId,
      state,
      version,
      updateTime,
      // In --json output, omit replacementKit when unmapped or when experiment is disabled
      ...(showReplacements && replacementPackage ? { replacementKit: replacementPackage } : {}),
      params: instance.config.params,
      systemParams: instance.config.systemParams,
    });
  });

  logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
  logger.info(table.toString());
  return formatted;
}
