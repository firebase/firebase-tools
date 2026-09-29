import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { localBuild } from "../../apphosting/localbuilds";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { prepareLocalBuildScratchDirectory } from "../apphosting/prepare";
import { Context, Payload, ServiceDeploy } from "./args";
import { prereqs } from "./prereqs";
import {
  getExistingService,
  getServiceConfigs,
  mainContainer,
  missingServiceMessage,
  toAppHostingConfig,
} from "./util";

/**
 * Reads each service's current state from Cloud Run, resolves its base image, and runs local builds.
 */
export async function prepare(context: Context, options: Options, payload: Payload): Promise<void> {
  const configs = getServiceConfigs(options);
  if (!configs.length) {
    return;
  }
  await prereqs(context.projectId);
  payload.run = { services: [] };
  for (const config of configs) {
    payload.run.services.push(await prepareService(context, options, config));
  }
}

async function prepareService(
  context: Context,
  options: Options,
  config: RunSingle,
): Promise<ServiceDeploy> {
  const { serviceId, region } = config;
  if (!region) {
    throw new FirebaseError(`Cloud Run service ${serviceId} is missing a region in firebase.json.`);
  }
  const existing = await getExistingService(context.projectId, region, serviceId);
  // Base images are sticky: deploys reuse the service's current base image unless told otherwise.
  const baseImage =
    context.baseImage === undefined
      ? mainContainer(existing?.template)?.baseImageUri
      : context.baseImage || undefined;

  const svc: ServiceDeploy = { config, existing, baseImage };
  if (!config.localBuild) {
    return svc;
  }

  if (!baseImage) {
    if (!existing && context.baseImage === undefined) {
      throw new FirebaseError(missingServiceMessage(config));
    }
    throw new FirebaseError(
      `Local builds require a base image. Set one for service ${serviceId} with ` +
        `"firebase run:services:update --base-image <baseImage> --service ${serviceId}".`,
    );
  }
  logLabeledBullet("run", `Starting local build for service ${serviceId}`);
  const cfg = toAppHostingConfig(config);
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), `run-local-build-${serviceId}-`));
  try {
    await prepareLocalBuildScratchDirectory(options.config.projectDir, scratchDir, cfg);
    const { outputFiles, buildConfig } = await localBuild(
      context.projectId,
      scratchDir,
      {},
      {
        nonInteractive: options.nonInteractive,
        rootDir: config.rootDir,
      },
    );
    svc.localBuild = { scratchDir, outputFiles, runCommand: buildConfig.runCommand };
  } catch (err: unknown) {
    fs.rmSync(scratchDir, { recursive: true, force: true });
    throw err;
  }
  return svc;
}
