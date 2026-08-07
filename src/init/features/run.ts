import * as ora from "ora";
import * as path from "path";
import { existsSync } from "fs";
import { Setup } from "../index";
import { Config } from "../../config";
import { input } from "../../prompt";
import { logBullet, logSuccess, logWarning } from "../../utils";
import { createService, getService } from "../../gcp/runv2";
import { ensure } from "../../ensureApiEnabled";
import { readTemplateSync } from "../../templates";
import { FirebaseError } from "../../error";

export interface RunInfo {
  serviceId: string;
  region: string;
  rootDir: string;
  outputDir: string;
}

/**
 *
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
 *
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

  logBullet("Setting up Cloud Run service...");

  // Ensure Cloud Run API is enabled
  await ensure(projectId, "run.googleapis.com", "run", true);

  // Update firebase.json
  const runConfig = {
    serviceId,
    region,
    source: rootDir,
    output: outputDir,
    ignore: ["node_modules", ".git", ".next", "firebase-debug.log", "firebase-debug.*.log"],
  };

  if (!config.src.run) {
    config.set("run", [runConfig]);
  } else if (Array.isArray(config.src.run)) {
    config.set("run", [...config.src.run, runConfig]);
  } else {
    config.set("run", [config.src.run, runConfig]);
  }

  config.writeProjectFile("firebase.json", config.src);

  const spinner = ora("Provisioning Cloud Run service...").start();

  try {
    // Try to get service first
    try {
      await getService(projectId, region, serviceId);
      spinner.succeed(`Cloud Run service ${serviceId} already exists.`);
    } catch (err: unknown) {
      if ((err as { status?: number })?.status === 404) {
        // Does not exist, create placeholder
        await createService(projectId, region, serviceId, {
          name: `projects/${projectId}/locations/${region}/services/${serviceId}`,
          description: "Firebase Cloud Run Service",
          ingress: "INGRESS_TRAFFIC_ALL",
          template: {
            containers: [
              {
                name: "placeholder",
                image: "us-docker.pkg.dev/cloudrun/container/hello",
              },
            ],
          },
        });
        spinner.succeed(`Successfully provisioned Cloud Run service ${serviceId}`);
      } else {
        throw err;
      }
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    spinner.fail(`Failed to provision Cloud Run service: ${message}`);
    logWarning("You can still deploy using the CLI, but the initial provisioning failed.");
  }

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
