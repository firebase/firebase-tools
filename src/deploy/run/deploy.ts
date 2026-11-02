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
import { nonSecretValues, secretNames, toLocalBuildEnv } from "./buildEnv";
import { FIREBASE_APP_ANNOTATION, mainContainer } from "./util";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";
/** Rolling out a revision can take longer than the operation poller's default timeout. */
const ROLLOUT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * The image of a container that runs a local build's output. Cloud Run runs the output from Cloud
 * Storage on the service's base image, so the container doesn't need an image of its own.
 */
const NO_IMAGE = "scratch";

/** What a local build produced. */
export interface LocalBuildOutput {
  /** The built files to upload, relative to the scratch directory the build ran in. */
  outputFiles: string[];
  /** The command that starts the app, e.g. "npm run start". */
  runCommand?: string;
  /** The env vars the app needs at runtime. */
  env: NonNullable<runv2.Container["env"]>;
}

/** Builds each service, locally or on Cloud Build, then rolls it out. */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  for (const svc of payload.run?.services || []) {
    if (svc.config.localBuild) {
      await deployLocalBuild(context, options, svc);
    } else {
      await deployRemoteBuild(context, options, svc);
    }
  }
}

/** Uploads the service's source, builds it into an image on Cloud Build, then rolls it out. */
async function deployRemoteBuild(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
): Promise<void> {
  const { projectId } = context;
  const source = await uploadSource(projectId, options, svc.config);
  const image = await buildImage(projectId, svc, source);
  const template = revisionTemplate(svc, image, options.message as string | undefined);
  svc.deployed = await rollOut(projectId, svc, template);
}

/**
 * Builds the service on this machine, uploads the output, then rolls it out. Cloud Run runs the
 * output as is, so nothing is built on Cloud Build.
 */
async function deployLocalBuild(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
): Promise<void> {
  const { projectId } = context;
  // The build runs in a scratch copy of the source, which is deleted afterwards.
  const scratchDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `run-local-build-${svc.config.serviceId}-`),
  );
  try {
    const build = await buildLocally(context, options, svc, scratchDir);
    const builtApp = await uploadBuiltApp(projectId, options, svc.config, scratchDir, build);
    const message = options.message as string | undefined;
    const template = localBuildTemplate(svc, build, builtApp, message);
    svc.deployed = await rollOut(projectId, svc, template);
  } finally {
    removeTempPath(scratchDir);
  }
}

/** Builds the service on this machine, in a scratch copy of its source. */
async function buildLocally(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
  scratchDir: string,
): Promise<LocalBuildOutput> {
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
  return { outputFiles, runCommand: buildConfig.runCommand, env };
}

/** Zips the service's source and uploads it to the region's source bucket. */
async function uploadSource(
  projectId: string,
  options: Options,
  config: RunSingle,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = config;
  const bucketName = await sourceBucket(projectId, options, region);
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

/** Tars a local build's output and uploads it to the region's source bucket. */
async function uploadBuiltApp(
  projectId: string,
  options: Options,
  config: RunSingle,
  scratchDir: string,
  build: LocalBuildOutput,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = config;
  const bucketName = await sourceBucket(projectId, options, region);
  // The tarball is a tmp file, so it's deleted when the CLI exits.
  const archive = await createLocalBuildTarArchive(
    toAppHostingConfig(config),
    scratchDir,
    build.outputFiles,
  );
  logLabeledBullet("run", `Uploading built app for service ${serviceId} in ${region}...`);
  const { bucket, object } = await gcs.uploadObject(
    { file: archive, stream: fs.createReadStream(archive) },
    bucketName,
    gcs.ContentType.TAR,
    // Cloud Run runs the tarball as is, so it has to fit Cloud Run's size limit.
    CLOUD_RUN_SIZE_LIMIT_BYTES,
  );
  return { bucket, object };
}

/**
 * Returns the region's source bucket, creating it if needed. Like App Hosting, each region has one
 * source bucket, which deletes uploads after 30 days.
 */
async function sourceBucket(projectId: string, options: Options, region: string): Promise<string> {
  const baseName = `firebase-run-src-${await getProjectNumber(options)}-${region.toLowerCase()}`;
  return gcs.upsertBucket({
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
      // Cloud Build only takes plain values, so pass only the non-secret env vars. Prepare already
      // rejects secrets for builds on Cloud Build.
      ...nonSecretValues(svc.buildEnv || {}),
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
  const container = mainContainer(template);
  if (!container) {
    throw new FirebaseError(`Service ${serviceId} in ${region} has no containers.`);
  }
  container.image = image;
  if (container.sourceCode) {
    // The live revision ran a local build's output, with the build's start command (see
    // localBuildTemplate). Drop both, so that the new revision runs the new image as built.
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
  // FIREBASE_CONFIG is how the Admin SDK auto-initializes at runtime. The client SDK's
  // FIREBASE_WEBAPP_CONFIG is only needed at build time, so it isn't set on the container.
  // TODO: Stop setting FIREBASE_CONFIG once Cloud Run injects it from the app-id annotation.
  const wasLinked = svc.existing?.annotations?.[FIREBASE_APP_ANNOTATION] !== undefined;
  const otherEnv = (container.env || []).filter((e) => e.name !== "FIREBASE_CONFIG");
  if (svc.autoInit) {
    // An app is linked. Always rewrite FIREBASE_CONFIG from the app's current config, so that
    // changes like enabling Storage reach the service.
    container.env = [...otherEnv, { name: "FIREBASE_CONFIG", value: svc.autoInit.firebaseConfig }];
  } else if (wasLinked) {
    // This deploy unlinks the app (--clear-app): the service had an app, and the deploy has none.
    // Remove the FIREBASE_CONFIG that was set for the app.
    container.env = otherEnv;
  }
  // Otherwise the service was never linked, so a FIREBASE_CONFIG on it is the user's. It stays.
  // The message describes this deploy only, so don't carry over the last one.
  if (message) {
    template.annotations = { ...template.annotations, [DEPLOY_MESSAGE_ANNOTATION]: message };
  } else if (template.annotations) {
    delete template.annotations[DEPLOY_MESSAGE_ANNOTATION];
  }
  return template;
}

/**
 * Returns the revision to roll out for a local build: revisionTemplate's, but running the build's
 * output from Cloud Storage, on the service's base image, with the build's start command.
 * Exported for testing.
 */
export function localBuildTemplate(
  svc: ServiceDeploy,
  build: LocalBuildOutput,
  builtApp: runv2.StorageSource,
  message?: string,
): runv2.RevisionTemplate {
  const template = revisionTemplate(svc, NO_IMAGE, message);
  // revisionTemplate has already checked that there's a container.
  const container = mainContainer(template)!;
  container.sourceCode = { cloudStorageSource: builtApp };
  // Split on any whitespace, so that stray spaces don't become empty arguments.
  const command = build.runCommand?.trim();
  if (command) {
    container.command = command.split(/\s+/);
  } else {
    // The build didn't name a start command, so don't keep one from an earlier revision.
    delete container.command;
  }
  // Set the runtime env vars that the build reports. Like the start command, they describe this
  // build's output, so the build wins: each one replaces any env var of the same name on the
  // service, even one set in the console or with gcloud. The service's other env vars are kept.
  // A var that an earlier build set stays on the service if this build stops reporting it.
  if (build.env.length) {
    const buildNames = new Set(build.env.map((e) => e.name));
    const otherEnv = (container.env || []).filter((e) => !buildNames.has(e.name));
    container.env = [...otherEnv, ...build.env];
  }
  return template;
}

/**
 * Returns the service's annotations after this deploy: its current ones, with the linked Firebase
 * Web App's ID set, or removed if no app is linked. Later deploys read the ID back to reuse the app.
 */
function serviceAnnotationsToDeploy(svc: ServiceDeploy): Record<string, string> {
  const annotations = { ...svc.existing?.annotations };
  if (svc.autoInit) {
    annotations[FIREBASE_APP_ANNOTATION] = svc.autoInit.appId;
  } else {
    delete annotations[FIREBASE_APP_ANNOTATION];
  }
  return annotations;
}

/** Rolls out the new revision: creates the service if it's new, or updates it. */
function rollOut(
  projectId: string,
  svc: ServiceDeploy,
  template: runv2.RevisionTemplate,
): Promise<runv2.Service> {
  const annotations = serviceAnnotationsToDeploy(svc);
  if (svc.existing) {
    return deployRevision(svc.existing, template, annotations);
  }
  return createNewService(projectId, svc.config, template, annotations);
}

/** Creates a new service with its first revision. */
function createNewService(
  projectId: string,
  config: RunSingle,
  template: runv2.RevisionTemplate,
  annotations: Record<string, string>,
): Promise<runv2.Service> {
  const { serviceId, region } = config;
  const service: Omit<runv2.Service, runv2.ServiceOutputFields> = {
    name: `projects/${projectId}/locations/${region}/services/${serviceId}`,
    annotations,
    template,
    client: "cli-firebase",
    // Like an App Hosting backend, the service is public.
    invokerIamDisabled: true,
    ingress: "INGRESS_TRAFFIC_ALL",
  };
  return runv2.createService(projectId, region, serviceId, service, {
    pollTimeoutMs: ROLLOUT_TIMEOUT_MS,
  });
}

/** Rolls out a new revision of an existing service and sends it all traffic. */
function deployRevision(
  service: runv2.Service,
  template: runv2.RevisionTemplate,
  annotations: Record<string, string>,
): Promise<runv2.Service> {
  // Tagged revisions keep their tags (Hosting's pinned rewrites use them), but no traffic.
  const tags = (service.traffic || [])
    .filter((t) => t.tag)
    .map((t) => ({ type: t.type, revision: t.revision, tag: t.tag }));
  const update: Omit<runv2.Service, runv2.ServiceOutputFields> = {
    name: service.name,
    annotations,
    template,
    traffic: [{ type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST", percent: 100 }, ...tags],
  };
  return runv2.updateService(update, {
    updateMask: ["template", "traffic", "annotations"],
    pollTimeoutMs: ROLLOUT_TIMEOUT_MS,
  });
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
