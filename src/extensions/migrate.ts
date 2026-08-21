import * as clc from "colorette";
import * as Table from "cli-table3";

import { FirebaseError } from "../error";
import { logger } from "../logger";
import { last, logLabeledBullet } from "../utils";
import { logPrefix } from "./extensionsHelper";
import { listInstances } from "./extensionsApi";
import { ExtensionInstance } from "./types";
import { select } from "../prompt";
import * as replacements from "./replacements.json";

export interface MigrateOptions {
  package?: string;
  extInstance?: string;
  extension?: string;
  nonInteractive?: boolean;
}

export interface ExtensionTableRow {
  extension: string;
  publisher: string;
  instances: string[];
  kitPackage: string;
}

export interface MigratableInstanceInfo {
  instance: ExtensionInstance;
  instanceId: string;
  extensionRef: string;
  kitPackage: string;
}

interface ReplacementEntry {
  status?: string;
  extensionRepositoryUrl?: string;
  npmPackage?: string;
}

/**
 * Returns the mapped kit package for an extension reference, or undefined if not found.
 */
export function getKitPackage(extensionRef: string, packageOverride?: string): string | undefined {
  if (packageOverride) {
    return packageOverride;
  }
  const data = replacements as { replacements?: Record<string, ReplacementEntry> };
  const map = data.replacements || {};

  let entry = map[extensionRef];
  if (!entry && !extensionRef.includes("/")) {
    entry = map[`firebase/${extensionRef}`];
  }
  if (!entry && extensionRef.includes("/")) {
    const shortName = extensionRef.split("/")[1];
    entry = map[shortName];
  }

  if (entry && entry.npmPackage && entry.status === "REPLACEMENT_AVAILABLE") {
    return entry.npmPackage;
  }
  return undefined;
}

/**
 * Extracts instance ID from full instance resource name or config.
 */
export function getInstanceId(instance: ExtensionInstance): string {
  return last(instance.name.split("/")) ?? instance.name;
}

/**
 * Extracts extension reference from instance config.
 */
export function getExtensionRef(instance: ExtensionInstance): string {
  return instance.config.extensionRef || instance.config.source?.spec?.name || "";
}

/**
 * Formats the table of installed extensions and their mapped kit packages.
 */
export function formatExtensionsTable(
  instances: ExtensionInstance[],
  packageOverride?: string,
): { tableString: string; rows: ExtensionTableRow[] } {
  const table = new Table({
    head: ["Extension", "publisher", "Instances", "kit package"],
    style: { head: ["yellow"] },
  });

  const grouped = new Map<string, { publisher: string; instances: string[]; kitPackage: string }>();

  instances.forEach((instance) => {
    const ref = getExtensionRef(instance);
    const instanceId = getInstanceId(instance);
    let publisher = "N/A";
    if (ref.includes("/")) {
      publisher = ref.split("/")[0];
    }
    const kitPkg = getKitPackage(ref, packageOverride) ?? "N/A";

    if (!grouped.has(ref)) {
      grouped.set(ref, { publisher, instances: [], kitPackage: kitPkg });
    }
    grouped.get(ref)!.instances.push(instanceId);
  });

  const rows: ExtensionTableRow[] = [];
  grouped.forEach((data, ref) => {
    table.push([ref, data.publisher, data.instances.join(", "), data.kitPackage]);
    rows.push({
      extension: ref,
      publisher: data.publisher,
      instances: data.instances,
      kitPackage: data.kitPackage,
    });
  });

  return { tableString: table.toString(), rows };
}

/**
 * Returns list of instances that can be migrated (have a mapped kit package).
 */
export function getMigratableInstances(
  instances: ExtensionInstance[],
  packageOverride?: string,
): MigratableInstanceInfo[] {
  const result: MigratableInstanceInfo[] = [];
  for (const instance of instances) {
    const ref = getExtensionRef(instance);
    const instanceId = getInstanceId(instance);
    const kitPkg = getKitPackage(ref, packageOverride);
    if (kitPkg) {
      result.push({
        instance,
        instanceId,
        extensionRef: ref,
        kitPackage: kitPkg,
      });
    }
  }
  return result;
}

/**
 * Helper to prompt instance selection dialog.
 */
export async function promptInstanceSelection(
  migratableInstances: MigratableInstanceInfo[],
  nonInteractive?: boolean,
): Promise<MigratableInstanceInfo> {
  const choices = migratableInstances.map((item) => ({
    name: `${item.instanceId} (${item.extensionRef})`,
    value: item,
  }));

  const selected = await select<MigratableInstanceInfo>({
    message: "Which extension instance would you like to migrate?",
    choices,
    nonInteractive,
  });

  return selected;
}

/**
 * Unique veneer entrypoint for ext:migrate logic.
 */
export async function migrate(projectId: string, options: MigrateOptions): Promise<void> {
  const instances = await listInstances(projectId);

  let selectedInstanceInfo: MigratableInstanceInfo | undefined;

  if (!options.extInstance && !options.extension) {
    if (instances.length === 0) {
      logLabeledBullet(
        logPrefix,
        `All extensions in project ${clc.bold(projectId)} have already been migrated.`,
      );
      return;
    }

    const { tableString } = formatExtensionsTable(instances, options.package);
    logLabeledBullet(logPrefix, `list of extensions installed in ${clc.bold(projectId)}:`);
    logger.info(tableString);

    const migratable = getMigratableInstances(instances, options.package);
    if (migratable.length === 0) {
      throw new FirebaseError(
        "No remaining Extensions have an associated function kit. Please reach out to the extension author to request one",
      );
    }

    selectedInstanceInfo = await promptInstanceSelection(migratable, options.nonInteractive);
  } else if (options.extension) {
    const matchingInstances = instances.filter((inst) => {
      const ref = getExtensionRef(inst);
      return (
        ref === options.extension ||
        (ref.includes("/") && ref.split("/")[1] === options.extension) ||
        (options.extension!.includes("/") && ref === options.extension!.split("/")[1])
      );
    });

    if (matchingInstances.length === 0) {
      throw new FirebaseError(
        `Extension ${options.extension} is not installed on project ${projectId}.`,
      );
    }

    const kitPkg = getKitPackage(options.extension, options.package);
    if (!kitPkg) {
      throw new FirebaseError(
        "This extension does not have an associated function kit. Please reach out to the extension author to request one",
      );
    }

    if (matchingInstances.length === 1) {
      const inst = matchingInstances[0];
      selectedInstanceInfo = {
        instance: inst,
        instanceId: getInstanceId(inst),
        extensionRef: getExtensionRef(inst),
        kitPackage: kitPkg,
      };
    } else {
      const migratableChoices = matchingInstances.map((inst) => ({
        instance: inst,
        instanceId: getInstanceId(inst),
        extensionRef: getExtensionRef(inst),
        kitPackage: kitPkg,
      }));
      selectedInstanceInfo = await promptInstanceSelection(
        migratableChoices,
        options.nonInteractive,
      );
    }
  } else if (options.extInstance) {
    const foundInstance = instances.find((inst) => getInstanceId(inst) === options.extInstance);
    if (!foundInstance) {
      throw new FirebaseError(
        `Extension instance ${options.extInstance} was not found on project ${projectId}.`,
      );
    }

    const ref = getExtensionRef(foundInstance);
    const kitPkg = getKitPackage(ref, options.package);
    if (!kitPkg) {
      throw new FirebaseError(
        "This extension does not have an associated function kit. Please reach out to the extension author to request one",
      );
    }

    selectedInstanceInfo = {
      instance: foundInstance,
      instanceId: getInstanceId(foundInstance),
      extensionRef: ref,
      kitPackage: kitPkg,
    };
  }

  if (selectedInstanceInfo) {
    logLabeledBullet(
      logPrefix,
      `Selected instance ${clc.bold(selectedInstanceInfo.instanceId)} (${selectedInstanceInfo.kitPackage}) for migration.`,
    );
    logger.info("TODO: Draw the rest of the owl");
  }
}
