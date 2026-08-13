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
export async function askQuestions(setup: Setup, config?: Config, options?: any): Promise<void> {
  const projectId = setup.projectId;
  if (!projectId) {
    throw new FirebaseError("Project ID must be set before initializing Cloud Run.", { exit: 1 });
  }

  logBullet("Configuring Cloud Run...");

  const defaultServiceId =
    options?.service ||
    options?.serviceId ||
    path
      .basename(process.cwd())
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-") ||
    "my-service";

  const serviceId =
    options?.service ||
    options?.serviceId ||
    (await input({
      message: "What should be the ID of your Cloud Run service?",
      default: defaultServiceId,
    }));

  const defaultRegion =
    options?.primaryRegion || options?.region || process.env.FIREBASE_RUN_REGION || "us-central1";

  const region =
    options?.primaryRegion ||
    options?.region ||
    (await input({
      message: "Which region should this service be deployed to?",
      default: defaultRegion,
      validate: (val: string) => {
        if (!/^[a-z0-9-]+$/.test(val)) {
          return "Region must be a valid GCP region string (e.g. us-central1).";
        }
        return true;
      },
    }));

  const rootDir =
    options?.rootDir ||
    options?.source ||
    (await input({
      message: "What is the root directory of your source code? (relative to firebase.json)",
      default: ".",
    }));

  const outputDir =
    options?.outputDir ||
    options?.output ||
    (await input({
      message: "Where should the built artifacts be output? (e.g. for --prebuilt)",
      default: ".run",
    }));

  setup.featureInfo = setup.featureInfo || {};
  setup.featureInfo.run = {
    serviceId,
    region,
    rootDir,
    outputDir,
  };
}

import * as runv2 from "../../gcp/runv2";
import { logger } from "../../logger";

/**
 * Scaffolds Cloud Run configuration in firebase.json, creates placeholder Cloud Run service in GCP,
 * and creates placeholder apphosting.yaml template.
 */
export async function actuate(setup: Setup, config: Config): Promise<void> {
  const runInfo = setup.featureInfo?.run;
  if (!runInfo) {
    return;
  }
  const projectId = setup.projectId;
  if (!projectId) {
    throw new FirebaseError("Project ID must be set before initializing Cloud Run.", { exit: 1 });
  }

  const { serviceId, region, rootDir, outputDir } = runInfo;

  logBullet("Setting up Cloud Run configuration...");

  // 1. Check or create placeholder Cloud Run service in GCP (0% traffic)
  let serviceUrl: string | undefined;
  try {
    const existing = await runv2.getService(projectId, region, serviceId);
    if (existing) {
      serviceUrl = existing.uri;
      logBullet(`Cloud Run service ${serviceId} already exists at ${serviceUrl}`);
    }
  } catch (err: unknown) {
    if ((err as { status?: number })?.status === 404) {
      logBullet(`Creating placeholder Cloud Run service ${serviceId} in ${region}...`);
      try {
        const placeholderService: Omit<runv2.Service, runv2.ServiceOutputFields> = {
          name: `projects/${projectId}/locations/${region}/services/${serviceId}`,
          template: {
            containers: [
              {
                image: "us-docker.pkg.dev/cloudrun/container/hello",
              },
            ],
          },
          invokerIamDisabled: true,
        };

        const created = await runv2.createService(projectId, region, serviceId, placeholderService);
        serviceUrl = created.uri;
        logSuccess(`Reserved Cloud Run service URL: ${serviceUrl}`);
      } catch (createErr: unknown) {
        logger.debug(`Failed to create placeholder Cloud Run service ${serviceId}:`, createErr);
        logBullet(`Note: Cloud Run service will be created on first deploy.`);
      }
    } else {
      logger.debug(`Failed to query Cloud Run service ${serviceId}:`, err);
    }
  }

  if (serviceUrl && setup.instructions) {
    setup.instructions.push(`Your Cloud Run service URL is: ${serviceUrl}`);
  }

  // 2. Update firebase.json
  const runConfig: RunSingle = {
    serviceId,
    region,
    source: rootDir,
    output: outputDir,
    ignore: DEFAULT_RUN_IGNORE,
  };

  upsertRunConfig(runConfig, config);
  config.writeProjectFile("firebase.json", config.src);

  // 3. Create placeholder apphosting.yaml
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
  const existing = Array.isArray(config.src.run) ? config.src.run : [config.src.run];
  const idx = existing.findIndex((s) => s.serviceId === runConfig.serviceId);
  if (idx >= 0) {
    const updated = [...existing];
    updated[idx] = { ...updated[idx], ...runConfig };
    config.set("run", updated);
  } else {
    config.set("run", [...existing, runConfig]);
  }
}
