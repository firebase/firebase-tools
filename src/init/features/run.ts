import * as path from "path";
import { existsSync } from "fs";
import { Setup } from "../index";
import { Config } from "../../config";
import { input } from "../../prompt";
import { logBullet, logSuccess } from "../../utils";
import { readTemplateSync } from "../../templates";
import { FirebaseError } from "../../error";
import { DEFAULT_RUN_IGNORE } from "../../deploy/run/args";
import { RunSingle } from "../../firebaseConfig";

export interface RunInfo {
  serviceId: string;
  region: string;
  rootDir: string;
  outputDir: string;
}

/**
 * Prompts the user for Cloud Run service ID, deployment region, source root, and output directory.
 */
export async function askQuestions(setup: Setup): Promise<void> {
  const projectId = setup.projectId;
  if (!projectId) {
    throw new FirebaseError("Project ID must be set before initializing Cloud Run.");
  }

  logBullet("Configuring Cloud Run...");

  const serviceId = await input({
    message: "What should be the ID of your Cloud Run service?",
    default: "my-service",
  });

  const region = await input({
    message: "Which region should this service be deployed to?",
    default: "us-central1",
  });

  const rootDir = await input({
    message: "What is the root directory of your source code? (relative to firebase.json)",
    default: ".",
  });

  const outputDir = await input({
    message: "Where should the built artifacts be output? (e.g. for --prebuilt)",
    default: ".run",
  });

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.run = {
    serviceId,
    region,
    rootDir,
    outputDir,
  };
}

/**
 * Scaffolds Cloud Run configuration in firebase.json and creates placeholder apphosting.yaml template.
 */
export async function actuate(setup: Setup, config: Config): Promise<void> {
  const runInfo = setup.featureInfo?.run;
  if (!runInfo) {
    return;
  }
  const projectId = setup.projectId;
  if (!projectId) {
    throw new FirebaseError("Project ID must be set before initializing Cloud Run.");
  }

  const { serviceId, region, rootDir, outputDir } = runInfo;

  logBullet("Setting up Cloud Run configuration...");

  // Update firebase.json
  const runConfig: RunSingle = {
    serviceId,
    region,
    source: rootDir,
    output: outputDir,
    ignore: DEFAULT_RUN_IGNORE,
  };

  upsertRunConfig(runConfig, config);
  config.writeProjectFile("firebase.json", config.src);

  // Create placeholder apphosting.yaml
  const projectDir = config.projectDir || ".";
  const absRootDir = path.join(projectDir, rootDir);
  const apphostingYamlPath = path.join(absRootDir, "apphosting.yaml");
  if (!existsSync(apphostingYamlPath)) {
    logBullet(`Creating placeholder apphosting.yaml in ${rootDir}`);
    await config.askWriteProjectFile(
      apphostingYamlPath,
      readTemplateSync("init/apphosting/apphosting.yaml"),
    );
  }

  logSuccess("Cloud Run initialization complete!");
}

/** Exported for unit testing. */
export function upsertRunConfig(runConfig: RunSingle, config: Config): void {
  if (!config.src.run) {
    config.set("run", [runConfig]);
    return;
  }
  if (Array.isArray(config.src.run)) {
    config.set("run", [...config.src.run, runConfig]);
    return;
  }
  config.set("run", [config.src.run, runConfig]);
}
