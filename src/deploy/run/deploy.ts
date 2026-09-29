import * as fs from "fs";
import * as path from "path";
import { CLOUD_RUN_SIZE_LIMIT_BYTES } from "../../apphosting/constants";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { createLocalBuildTarArchive, createSourceDeployArchive } from "../apphosting/util";
import { Context, Payload, ServiceDeploy } from "./args";
import {
  copyTemplate,
  deployRevision,
  mainContainer,
  SERVICE_OPERATION_TIMEOUT_MS,
  toAppHostingConfig,
} from "./util";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";

/**
 * Uploads each service's source (or local build output), builds it if needed, and deploys it.
 */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  for (const svc of payload.run?.services || []) {
    try {
      svc.deployed = await deployService(context, options, svc);
    } finally {
      if (svc.localBuild) {
        fs.rmSync(svc.localBuild.scratchDir, { recursive: true, force: true });
      }
    }
  }
}

async function deployService(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
): Promise<runv2.Service> {
  const { projectId } = context;
  const { serviceId, region } = svc.config;
  const source = await uploadSource(projectId, options, svc);

  const template = svc.existing
    ? copyTemplate(svc.existing)
    : { containers: [{ name: serviceId, image: "" }] };
  const container = mainContainer(template)!;
  if (svc.localBuild) {
    // Cloud Run runs locally built apps directly from source on top of the base image.
    container.image = "scratch";
    container.sourceCode = { cloudStorageSource: source };
    container.command = svc.localBuild.runCommand?.split(" ");
  } else {
    container.image = await buildImage(projectId, svc, source);
    if (container.sourceCode) {
      // This service was previously deployed from a local build.
      delete container.sourceCode;
      delete container.command;
    }
  }
  if (svc.baseImage) {
    container.baseImageUri = svc.baseImage;
  } else {
    delete container.baseImageUri;
  }
  template.annotations = { ...template.annotations };
  if (options.message) {
    template.annotations[DEPLOY_MESSAGE_ANNOTATION] = options.message as string;
  } else {
    delete template.annotations[DEPLOY_MESSAGE_ANNOTATION];
  }

  if (svc.existing) {
    return deployRevision(svc.existing, template);
  }
  return runv2.createService(
    projectId,
    region,
    serviceId,
    {
      name: `projects/${projectId}/locations/${region}/services/${serviceId}`,
      template,
      client: "cli-firebase",
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
    },
    { masterTimeout: SERVICE_OPERATION_TIMEOUT_MS },
  );
}

async function uploadSource(
  projectId: string,
  options: Options,
  svc: ServiceDeploy,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = svc.config;
  const baseName = `firebase-run-src-${await getProjectNumber(options)}-${region.toLowerCase()}`;
  const bucketName = await gcs.upsertBucket({
    product: "run",
    createMessage: `Creating Cloud Storage bucket in ${region} to store Cloud Run source code uploads at ${baseName}...`,
    projectId,
    req: {
      baseName,
      purposeLabel: `run-source-${region.toLowerCase()}`,
      location: region,
      lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 30 } }] },
    },
  });

  const cfg = toAppHostingConfig(svc.config);
  const archive = svc.localBuild
    ? await createLocalBuildTarArchive(cfg, svc.localBuild.scratchDir, svc.localBuild.outputFiles)
    : await createSourceDeployArchive(cfg, path.join(options.config.projectDir, cfg.rootDir));
  logLabeledBullet(
    "run",
    `Uploading ${svc.localBuild ? "built app" : "source"} for service ${serviceId}...`,
  );
  const { bucket, object } = await gcs.uploadObject(
    { file: archive, stream: fs.createReadStream(archive) },
    bucketName,
    svc.localBuild ? gcs.ContentType.TAR : gcs.ContentType.ZIP,
    svc.localBuild ? CLOUD_RUN_SIZE_LIMIT_BYTES : undefined,
  );
  return { bucket, object };
}

async function buildImage(
  projectId: string,
  svc: ServiceDeploy,
  source: runv2.StorageSource,
): Promise<string> {
  const { serviceId, region } = svc.config;
  await artifactregistry.ensureDockerRepository(projectId, region, "cloud-run-source-deploy");
  const imageUri = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${serviceId}:${Date.now()}`;
  logLabeledBullet("run", `Building service ${serviceId}...`);
  await runv2.submitBuild(projectId, region, {
    storageSource: source,
    imageUri,
    buildpackBuild: {
      // Only images built for a base image can have their base image updated automatically.
      ...(svc.baseImage && { baseImage: svc.baseImage, enableAutomaticUpdates: true }),
    },
  });
  return imageUri;
}
