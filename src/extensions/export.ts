import * as clc from "cli-color";

import * as refs from "./refs";
import { Options } from "../options";
import { Config } from "../config";
import { InstanceSpec } from "../deploy/extensions/planner";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { logger } from "../logger";
import { FirebaseError } from "../error";

export function displayExportInfo(withRef: InstanceSpec[], withoutRef: InstanceSpec[]): void {
  logger.info("The following Extension instances will be saved locally:");
  logger.info("");

  for (const spec of withRef) {
    displayParams(spec);
  }
  if (withoutRef.length) {
    logger.info(
      `Your project also has the following instances installed from local sources. These will not be saved to firebase.json:`
    );
    for (const spec of withoutRef) {
      logger.info(spec.instanceId);
    }
  }
}

function displayParams(spec: InstanceSpec): void {
  logger.info(humanReadable(spec));
  logger.info(`Configuration will be written to 'extensions/${spec.instanceId}.env`);
  for (const p of Object.entries(spec.params)) {
    logger.info(`\t${p[0]}: ${p[1]}`);
  }
  logger.info("");
}

function writeExtensionsToFirebaseJson(have: InstanceSpec[], existingConfig: Config): void {
  const extensions = existingConfig.get("extensions", {});
  for (const s of have) {
    extensions[s.instanceId] = refs.toExtensionVersionRef(s.ref!);
  }
  existingConfig.set("extensions", extensions);
  logger.info("Adding Extensions to " + clc.bold("firebase.json") + "...");
  existingConfig.writeProjectFile("firebase.json", existingConfig.src);
}

async function writeEnvFile(spec: InstanceSpec, existingConfig: Config) {
  const content = Object.entries(spec.params)
    .map((r) => `${r[0]}=${r[1]}`)
    .join("\n");
  await existingConfig.askWriteProjectFile(`extensions/${spec.instanceId}.env`, content);
}

export async function writeFiles(have: InstanceSpec[], options: Options) {
  const existingConfig = Config.load(options, true);
  if (!existingConfig) {
    throw new FirebaseError(
      "Not currently in a Firebase directory. Please run `firebase init` to create a Firebase directory."
    );
  }
  writeExtensionsToFirebaseJson(have, existingConfig);
  for (const spec of have) {
    await writeEnvFile(spec, existingConfig);
  }
}
