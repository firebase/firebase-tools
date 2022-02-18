import * as clc from "cli-color";

import * as refs from "./refs";
import { getProjectNumber } from "../getProjectNumber";
import { Options } from "../options";
import { Config } from "../config";
import { getExtensionVersion, InstanceSpec } from "../deploy/extensions/planner";
import { humanReadable } from "../deploy/extensions/deploymentSummary";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import { promptOnce } from "../prompt";
import { parseSecretVersionResourceName, toSecretVersionResourceName } from "../gcp/secretManager";
import { getActiveSecrets } from "./secretsUtils";

/**
 * Write a list of instanceSpecs to extensions manifest.
 * 
 * The manifest is composed of both the extension instance list in firebase.json, and
 * env-var for each extension instance under ./extensions/*.env
 * 
 * @param config existing config in firebase.json
 * 
 * @param options nonInteractive will try to do the job without asking for user input. 
 * But only when force flag is passed this will overwrite existing .env files
 */
export async function writeToManifest(
  have: InstanceSpec[],
  config: Config,
  options: { nonInteractive: boolean; force: boolean },
): Promise<void> {
  if (
    config.has("extensions") &&
    Object.keys(config.get("extensions")).length &&
    !options.nonInteractive &&
    !options.force
  ) {
    const currentExtensions = Object.entries(config.get("extensions"))
      .map((i) => `${i[0]}: ${i[1]}`)
      .join("\n\t");
    const overwrite = await promptOnce({
      type: "list",
      message: `firebase.json already contains extensions:\n${currentExtensions}\nWould you like to overwrite or merge?`,
      choices: [
        { name: "Overwrite", value: true },
        { name: "Merge", value: false },
      ],
    });
    if (overwrite) {
      config.set("extensions", {});
    }
  }

  writeExtensionsToFirebaseJson(have, config);
  await writeEnvFiles(have, config, options.force);
}

function writeExtensionsToFirebaseJson(have: InstanceSpec[], config: Config): void {
  const extensions = config.get("extensions", {});
  for (const s of have) {
    extensions[s.instanceId] = refs.toExtensionVersionRef(s.ref!);
  }
  config.set("extensions", extensions);
  logger.info("Adding Extensions to " + clc.bold("firebase.json") + "...");
  config.writeProjectFile("firebase.json", config.src);
}

async function writeEnvFiles(
  have: InstanceSpec[],
  config: Config,
  force?: boolean
): Promise<void> {
  for (const spec of have) {
    const content = Object.entries(spec.params)
      .map((r) => `${r[0]}=${r[1]}`)
      .join("\n");
    await config.askWriteProjectFile(`extensions/${spec.instanceId}.env`, content, force);
  }
}
