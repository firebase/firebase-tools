import * as fs from "fs";
import * as path from "path";
import { FirebaseError } from "../../error";
import { AppHostingSingle, RunSingle } from "../../firebaseConfig";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { cloneDeep, logLabeledBullet } from "../../utils";
import { createSourceDeployArchive } from "../apphosting/util";
import { Context, Payload, ServiceDeploy } from "./args";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";
/** Rolling out a revision can take longer than the operation poller's default timeout. */
const ROLLOUT_TIMEOUT_MS = 10 * 60 * 1000;

/** Builds each service from source on Cloud Build, then rolls it out. */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  const { projectId } = context;
  for (const svc of payload.run?.services || []) {
    const source = await uploadSource(projectId, options, svc.config);
    const image = await buildImage(projectId, svc, source);
    const template = revisionTemplate(svc, image, options.message as string | undefined);
    svc.deployed = svc.existing
      ? await deployRevision(svc.existing, template)
      : await createService(projectId, svc.config, template);
  }
}

/** Zips the service's source and uploads it to the region's source bucket. */
async function uploadSource(
  projectId: string,
  options: Options,
  config: RunSingle,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = config;
  // Like App Hosting, each region has one source bucket, which deletes uploads after 30 days.
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

  const cfg = toAppHostingConfig(config);
  // The zip is a tmp file, so it's deleted when the CLI exits.
  const archive = await createSourceDeployArchive(
    cfg,
    path.join(options.config.projectDir, cfg.rootDir),
  );
  logLabeledBullet("run", `Uploading source for service ${serviceId} in ${region}...`);
  const { bucket, object } = await gcs.uploadObject(
    { file: archive, stream: fs.createReadStream(archive) },
    bucketName,
    gcs.ContentType.ZIP,
  );
  return { bucket, object };
}

/** Builds the uploaded source into an image on Cloud Build and returns the image's URI. */
async function buildImage(
  projectId: string,
  svc: ServiceDeploy,
  source: runv2.StorageSource,
): Promise<string> {
  const { serviceId, region } = svc.config;
  await artifactregistry.ensureDockerRepository(projectId, region, "cloud-run-source-deploy");
  const imageUri = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${serviceId}:${Date.now()}`;
  logLabeledBullet("run", `Building service ${serviceId} in ${region}...`);
  await runv2.submitBuild(projectId, region, {
    storageSource: source,
    imageUri,
    buildpackBuild: {
      // Only images built for a base image can have their base image updated automatically.
      ...(svc.baseImage && { baseImage: svc.baseImage, enableAutomaticUpdates: true }),
      environmentVariables: {
        // Use App Hosting's buildpacks, which need to know where to write the output bundle.
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    },
  });
  return imageUri;
}

/**
 * Returns the revision to roll out: the live revision's settings (env vars, service account,
 * scaling, etc.) with the new image, base image, and deploy message.
 * Exported for testing.
 */
export function revisionTemplate(
  svc: ServiceDeploy,
  image: string,
  message?: string,
): runv2.RevisionTemplate {
  const { serviceId, region } = svc.config;
  const template: runv2.RevisionTemplate = svc.existing
    ? cloneDeep(svc.existing.template)
    : { containers: [{ name: serviceId, image }] };
  // The live template names the live revision. Drop the name so Cloud Run creates a new revision.
  delete template.revision;
  const container = template.containers?.[0];
  if (!container) {
    throw new FirebaseError(`Service ${serviceId} in ${region} has no containers.`);
  }
  container.image = image;
  if (svc.baseImage) {
    container.baseImageUri = svc.baseImage;
  } else {
    delete container.baseImageUri;
  }
  // The message describes this deploy only, so don't carry over the last one.
  if (message) {
    template.annotations = { ...template.annotations, [DEPLOY_MESSAGE_ANNOTATION]: message };
  } else if (template.annotations) {
    delete template.annotations[DEPLOY_MESSAGE_ANNOTATION];
  }
  return template;
}

/** Creates the service with its first revision. */
function createService(
  projectId: string,
  config: RunSingle,
  template: runv2.RevisionTemplate,
): Promise<runv2.Service> {
  const { serviceId, region } = config;
  return runv2.createService(
    projectId,
    region,
    serviceId,
    {
      name: `projects/${projectId}/locations/${region}/services/${serviceId}`,
      template,
      client: "cli-firebase",
      // Like an App Hosting backend, the service is public.
      invokerIamDisabled: true,
      ingress: "INGRESS_TRAFFIC_ALL",
    },
    { pollTimeoutMs: ROLLOUT_TIMEOUT_MS },
  );
}

/** Rolls out a new revision of an existing service and sends it all traffic. */
function deployRevision(
  service: runv2.Service,
  template: runv2.RevisionTemplate,
): Promise<runv2.Service> {
  // Tagged revisions keep their tags (Hosting's pinned rewrites use them), but no traffic.
  const tags = (service.traffic || [])
    .filter((t) => t.tag)
    .map((t) => ({ type: t.type, revision: t.revision, tag: t.tag }));
  return runv2.updateService(
    {
      name: service.name,
      template,
      traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }, ...tags],
    },
    { updateMask: ["template", "traffic"], pollTimeoutMs: ROLLOUT_TIMEOUT_MS },
  );
}

/** Adapts a Cloud Run config so that it can reuse App Hosting's archive helper. */
function toAppHostingConfig(config: RunSingle): AppHostingSingle {
  return {
    backendId: config.serviceId,
    rootDir: config.rootDir || "",
    // Leave this undefined (not []) so App Hosting applies its default ignore list.
    ignore: config.ignore as string[],
  };
}
