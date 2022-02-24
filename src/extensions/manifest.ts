import * as clc from "cli-color";

import * as refs from "./refs";
import { Config } from "../config";
import { InstanceSpec } from "../deploy/extensions/planner";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { FirebaseError } from "../error";

/**
 * Write a list of instanceSpecs to extensions manifest.
 *
 * The manifest is composed of both the extension instance list in firebase.json, and
 * env-var for each extension instance under ./extensions/*.env
 *
 * @param specs a list of InstanceSpec to write to the manifest
 * @param config existing config in firebase.json
 * @param options.nonInteractive will try to do the job without asking for user input.
 * @param options.force only when this flag is true this will overwrite existing .env files
 * @param allowOverwrite allows overwriting the entire manifest with the new specs
 */
export async function writeToManifest(
  specs: InstanceSpec[],
  config: Config,
  options: { nonInteractive: boolean; force: boolean },
  allowOverwrite: boolean = false
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
    if (allowOverwrite) {
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
  }

  writeExtensionsToFirebaseJson(specs, config);
  await writeEnvFiles(specs, config, options.force);
}

export function loadConfig(options: any): Config {
  const existingConfig = Config.load(options, true);
  if (!existingConfig) {
    throw new FirebaseError(
      "Not currently in a Firebase directory. Please run `firebase init` to create a Firebase directory."
    );
  }
  return existingConfig;
}

/**
 * Checks if an instance name already exists in the manifest.
 */
export function instanceExists(instanceId: string, config: Config): boolean {
  return !!config.get("extensions", {})[instanceId];
}

function writeExtensionsToFirebaseJson(specs: InstanceSpec[], config: Config): void {
  const extensions = config.get("extensions", {});
  for (const s of specs) {
    extensions[s.instanceId] = refs.toExtensionVersionRef(s.ref!);
  }
  config.set("extensions", extensions);
  logger.info("Adding Extensions to " + clc.bold("firebase.json") + "...");
  config.writeProjectFile("firebase.json", config.src);
}

async function writeEnvFiles(
  specs: InstanceSpec[],
  config: Config,
  force?: boolean
): Promise<void> {
  for (const spec of specs) {
    const content = Object.entries(spec.params)
      .map((r) => `${r[0]}=${r[1]}`)
      .join("\n");
    await config.askWriteProjectFile(`extensions/${spec.instanceId}.env`, content, force);
  }
}
