import * as fs from "fs";
import * as path from "path";
import { FirebaseError } from "../../error";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { createSourceDeployArchive } from "../apphosting/util";
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
 * Builds each service on Cloud Build, uploads it, and deploys it.
 */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  for (const svc of payload.run?.services || []) {
    svc.deployed = await deployService(context, options, svc);
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
  const container = mainContainer(template);
  if (!container) {
    throw new FirebaseError(`Service ${serviceId} has no containers.`);
  }
  container.image = await buildImage(projectId, svc, source);
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
    if (!Object.keys(template.annotations).length) {
      delete template.annotations;
    }
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
  const archive = await createSourceDeployArchive(
    cfg,
    path.join(options.config.projectDir, cfg.rootDir),
  );
  try {
    logLabeledBullet("run", `Uploading source for service ${serviceId}...`);
    const { bucket, object } = await gcs.uploadObject(
      { file: archive, stream: fs.createReadStream(archive) },
      bucketName,
      gcs.ContentType.ZIP,
    );
    return { bucket, object };
  } finally {
    fs.rmSync(archive, { force: true });
  }
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
      environmentVariables: {
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    },
  });
  return imageUri;
}
