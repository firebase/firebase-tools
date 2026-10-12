import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLOUD_RUN_SIZE_LIMIT_BYTES } from "../../apphosting/constants";
import { localBuild, validateLocalBuildNodeVersion } from "../../apphosting/localbuilds";
import { FirebaseError, getErrMsg } from "../../error";
import { AppHostingSingle, RunSingle } from "../../firebaseConfig";
import { Backend } from "../../gcp/apphosting";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { logger } from "../../logger";
import { Options } from "../../options";
import { cloneDeep, logLabeledBullet } from "../../utils";
import { prepareLocalBuildScratchDirectory } from "../apphosting/prepare";
import { createLocalBuildTarArchive, createSourceDeployArchive } from "../apphosting/util";
import { Context, Payload, ServiceDeploy } from "./args";
import { secretNames, toLocalBuildEnv } from "./buildEnv";
import { mainContainer } from "./util";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";
/** Rolling out a revision can take longer than the operation poller's default timeout. */
const ROLLOUT_TIMEOUT_MS = 10 * 60 * 1000;

/** What a new revision runs: an image built on Cloud Build, or a local build's uploaded output. */
type RevisionCode = { image: string } | { builtApp: runv2.StorageSource };

/** Builds each service, locally or on Cloud Build, then rolls it out. */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  const { projectId } = context;
  for (const svc of payload.run?.services || []) {
    // A local build runs in a scratch copy of the source, which is deleted afterwards.
    const scratchDir = svc.config.localBuild
      ? fs.mkdtempSync(path.join(os.tmpdir(), `run-local-build-${svc.config.serviceId}-`))
      : undefined;
    try {
      if (scratchDir) {
        svc.localBuild = await buildLocally(context, options, svc, scratchDir);
      }
      const uploaded = await uploadSource(projectId, options, svc);
      // Cloud Run runs a local build's output as is. Other source is built into an image first.
      const code = svc.localBuild
        ? { builtApp: uploaded }
        : { image: await buildImage(projectId, svc, uploaded) };
      const template = revisionTemplate(svc, code, options.message as string | undefined);
      svc.deployed = svc.existing
        ? await deployRevision(svc.existing, template)
        : await createNewService(projectId, svc.config, template);
    } finally {
      if (scratchDir) {
        removeTempPath(scratchDir);
      }
    }
  }
}

/** Builds the service on this machine, in a scratch copy of its source. */
async function buildLocally(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
  scratchDir: string,
): Promise<NonNullable<ServiceDeploy["localBuild"]>> {
  const { config } = svc;
  const { serviceId, region } = config;
  const cfg = toAppHostingConfig(config);
  // App Hosting's check reads the Node.js version from a backend's runtime, e.g. "nodejs22".
  validateLocalBuildNodeVersion(
    { runtime: { value: svc.baseImage?.split("/").pop() } } as Backend,
    path.join(options.config.projectDir, cfg.rootDir),
  );
  logLabeledBullet("run", `Starting local build for service ${serviceId} in ${region}`);
  const secrets = secretNames(svc.buildEnv || {});
  if (secrets.length) {
    logLabeledBullet(
      "run",
      `Reading build secrets ${secrets.join(", ")} with your credentials. Their values may be ` +
        `included in the build output.`,
    );
  }
  await prepareLocalBuildScratchDirectory(options.config.projectDir, scratchDir, cfg);
  const { outputFiles, buildConfig } = await localBuild(
    context.projectId,
    scratchDir,
    toLocalBuildEnv(svc.buildEnv || {}),
    // Unlike App Hosting, Cloud Run doesn't ask users to confirm build secrets in local builds.
    { rootDir: config.rootDir, allowLocalBuildSecrets: true },
  );
  // Keep the env vars that the app needs at runtime, not just during the build.
  const env = (buildConfig.env || [])
    .filter(
      (e) =>
        e.variable &&
        e.value !== undefined &&
        (!e.availability || e.availability.includes("RUNTIME")),
    )
    .map((e) => ({ name: e.variable, value: e.value! }));
  return { scratchDir, outputFiles, runCommand: buildConfig.runCommand, env };
}

/** Uploads the service's source, or its local build's output, to the region's source bucket. */
async function uploadSource(
  projectId: string,
  options: Options,
  svc: ServiceDeploy,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = svc.config;
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

  const cfg = toAppHostingConfig(svc.config);
  // The archive is a tmp file, so it's deleted when the CLI exits.
  const archive = svc.localBuild
    ? await createLocalBuildTarArchive(cfg, svc.localBuild.scratchDir, svc.localBuild.outputFiles)
    : await createSourceDeployArchive(cfg, path.join(options.config.projectDir, cfg.rootDir));
  logLabeledBullet(
    "run",
    `Uploading ${svc.localBuild ? "built app" : "source"} for service ${serviceId} in ${region}...`,
  );
  const { bucket, object } = await gcs.uploadObject(
    { file: archive, stream: fs.createReadStream(archive) },
    bucketName,
    svc.localBuild ? gcs.ContentType.TAR : gcs.ContentType.ZIP,
    svc.localBuild ? CLOUD_RUN_SIZE_LIMIT_BYTES : undefined,
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
  const buildpackBuild: runv2.BuildpacksBuild = {
    environmentVariables: {
      // Prepare rejects build secrets for builds on Cloud Build, so these are all plain values.
      ...(svc.buildEnv as Record<string, string> | undefined),
      // Use App Hosting's buildpacks, which need to know where to write the output bundle.
      X_GOOGLE_TARGET_PLATFORM: "fah",
      FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
    },
  };
  // Only images built for a base image can have their base image updated automatically.
  if (svc.baseImage) {
    buildpackBuild.baseImage = svc.baseImage;
    buildpackBuild.enableAutomaticUpdates = true;
  }
  await runv2.submitBuild(projectId, region, { storageSource: source, imageUri, buildpackBuild });
  return imageUri;
}

/**
 * Returns the revision to roll out: the live revision's settings (env vars, service account,
 * scaling, etc.) with the new code, base image, and deploy message.
 * Exported for testing.
 */
export function revisionTemplate(
  svc: ServiceDeploy,
  code: RevisionCode,
  message?: string,
): runv2.RevisionTemplate {
  const { serviceId, region } = svc.config;
  // Cloud Run runs a local build's output from source, on top of the base image.
  const image = "image" in code ? code.image : "scratch";
  const template: runv2.RevisionTemplate = svc.existing
    ? cloneDeep(svc.existing.template)
    : { containers: [{ name: serviceId, image }] };
  // The live template names the live revision. Drop the name so Cloud Run creates a new revision.
  delete template.revision;
  const container = mainContainer(template);
  if (!container) {
    throw new FirebaseError(`Service ${serviceId} in ${region} has no containers.`);
  }
  container.image = image;
  if ("builtApp" in code) {
    container.sourceCode = { cloudStorageSource: code.builtApp };
    const cmd = svc.localBuild?.runCommand?.trim();
    if (cmd) {
      container.command = cmd.split(/\s+/);
    } else {
      delete container.command;
    }
    // Add the env vars the build says the app needs, unless the service already sets them.
    const existingNames = new Set((container.env || []).map((e) => e.name));
    const newEnv = (svc.localBuild?.env || []).filter((e) => !existingNames.has(e.name));
    if (newEnv.length) {
      container.env = [...(container.env || []), ...newEnv];
    }
  } else if (container.sourceCode) {
    // The service was last deployed from a local build, which set these.
    delete container.sourceCode;
    delete container.command;
  }
  // Prepare already resolved svc.baseImage: the service's current base image, unless this deploy
  // sets or clears it. A new service has none unless init sets one, so automatic base image
  // updates are off by default.
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

/** Creates a new service with its first revision. */
function createNewService(
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

/** Adapts a Cloud Run config so that it can reuse App Hosting's local build and archive helpers. */
function toAppHostingConfig(config: RunSingle): AppHostingSingle {
  return {
    backendId: config.serviceId,
    rootDir: config.rootDir || "",
    // Leave this undefined (not []) so App Hosting applies its default ignore list.
    ignore: config.ignore as string[],
    localBuild: config.localBuild,
  };
}

/**
 * Deletes a temporary directory. Failures are only logged: a leftover temp directory shouldn't
 * fail a deploy that succeeded or hide the error from one that didn't.
 */
function removeTempPath(tempPath: string): void {
  try {
    fs.rmSync(tempPath, { recursive: true, force: true });
  } catch (err: unknown) {
    logger.debug(`Failed to clean up ${tempPath}: ${getErrMsg(err)}`);
  }
}
