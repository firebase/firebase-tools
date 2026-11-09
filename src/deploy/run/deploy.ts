import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { validateLocalBuildNodeVersion } from "../../apphosting/localbuilds";
import { FirebaseError } from "../../error";
import { AppHostingSingle, RunSingle } from "../../firebaseConfig";
import { Backend } from "../../gcp/apphosting";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { cloneDeep, logLabeledBullet } from "../../utils";
import { buildLocally } from "../apphosting/localBuild";
import { buildDirectory, createSourceDeployArchive, uploadArchive } from "../apphosting/util";
import { Context, Payload, ServiceDeploy } from "./args";
import { nonSecretValues, secretNames, toLocalBuildEnv } from "./buildEnv";
import { FIREBASE_APP_ANNOTATION, mainContainer } from "./util";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";
/**
 * Rolling out a revision can take longer than the operation poller's default timeout. Cloud Run
 * builds the image first: it can queue the build for 6 minutes, run it for 30, then take 4 to start
 * the revision.
 */
const ROLLOUT_TIMEOUT_MS = 45 * 60 * 1000;
/**
 * Cloud Run's build API is in alpha, so services have to allow alpha features. This only allows
 * them: Cloud Run reports the launch stage of the features that a service actually uses.
 */
const LAUNCH_STAGE = "ALPHA";

/**
 * The image of a container that runs a local build's output. Cloud Run runs the output from Cloud
 * Storage on the service's base image, so the container doesn't need an image of its own.
 */
const NO_IMAGE = "scratch";

/** What a local build produced. */
export interface LocalBuildOutput {
  /** The built app, as a .tar.gz tmp file. */
  archive: string;
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
  const { serviceId, region } = svc.config;
  const { buildFolder, appFolder } = buildDirectory(options.config.projectDir, svc.config.rootDir);
  // The zip is a tmp file, so it's deleted when the CLI exits. The project's .gitignore files above
  // the build folder apply too, like they do for App Hosting's source deploys and local builds.
  const archive = await createSourceDeployArchive(
    toAppHostingConfig(svc.config),
    buildFolder,
    options.config.projectDir,
  );
  const source = await upload(projectId, options, svc.config, archive);
  // Cloud Run pushes the image it builds to this repository, but doesn't create it.
  await artifactregistry.ensureDockerRepository(projectId, region, "cloud-run-source-deploy");
  const imageRepository = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${serviceId}`;
  const message = options.message as string | undefined;
  const template = remoteBuildTemplate(svc, source, imageRepository, appFolder, message);
  logLabeledBullet("run", `Building and deploying service ${serviceId} in ${region}...`);
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
  const build = await buildServiceLocally(context, options, svc);
  const builtApp = await upload(projectId, options, svc.config, build.archive);
  const message = options.message as string | undefined;
  const template = localBuildTemplate(svc, build, builtApp, message);
  svc.deployed = await rollOut(projectId, svc, template);
}

/** Builds the service on this machine, in a scratch copy of its source. */
async function buildServiceLocally(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
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
  const { archive, buildConfig } = await buildLocally({
    projectId: context.projectId,
    projectDir: options.config.projectDir,
    config: cfg,
    env: toLocalBuildEnv(svc.buildEnv || {}),
    // The build runs in a scratch copy of the source, which is deleted afterwards.
    scratchDir: fs.mkdtempSync(path.join(os.tmpdir(), `run-local-build-${serviceId}-`)),
    // Unlike App Hosting, Cloud Run doesn't ask users to confirm build secrets in local builds.
    allowLocalBuildSecrets: true,
  });
  // Set the env vars that Universal Maker says the built app needs at runtime, which localBuild
  // marks RUNTIME (most apps have none). The build's own env vars and secrets aren't in this list.
  const env = (buildConfig.env || [])
    .filter(
      (e) =>
        e.variable &&
        e.value !== undefined &&
        (!e.availability || e.availability.includes("RUNTIME")),
    )
    .map((e) => ({ name: e.variable, value: e.value! }));
  return { archive, runCommand: buildConfig.runCommand, env };
}

/**
 * Uploads the service's source zip, or its local build's tarball, to the region's source bucket,
 * the same way App Hosting uploads to its own bucket.
 */
async function upload(
  projectId: string,
  options: Options,
  config: RunSingle,
  archive: string,
): Promise<runv2.StorageSource> {
  const { serviceId, region } = config;
  const bucketName = await sourceBucket(projectId, options, region);
  const what = config.localBuild ? "built app" : "source";
  logLabeledBullet("run", `Uploading ${what} for service ${serviceId} in ${region}...`);
  return uploadArchive(archive, bucketName, !!config.localBuild);
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

/**
 * Returns the new revision's template, without what its main container runs. The caller adds that:
 * remoteBuildTemplate adds the source for Cloud Run to build, localBuildTemplate adds the local
 * build's output.
 *
 * A new service starts from a template with just a container named after the service. An existing
 * service starts from a copy of its live revision's template, so that the new revision keeps every
 * setting that deploys don't manage: env vars, secrets, service account, CPU, memory, scaling, etc.
 * These are removed from the copy:
 * - `revision`, the live revision's name. Without it, Cloud Run names the new revision.
 * - The main container's `image`, `sourceCode` and `buildConfig`. They say what the live revision
 *   runs, and every deploy replaces them. A container can't have an image and a build config.
 * - The main container's `command`, only if the live revision ran a local build's output. Then it's
 *   that build's start command (see localBuildTemplate). Any other command stays, e.g. one that the
 *   user set with gcloud.
 *
 * Then it sets what this deploy decides:
 * - `baseImageUri`: the base image that prepare resolved, or none.
 * - FIREBASE_CONFIG: from the linked Firebase Web App, or removed if this deploy unlinks the app.
 * - The deploy message annotation: this deploy's message, or none.
 *
 * Exported for testing.
 */
export function revisionTemplate(svc: ServiceDeploy, message?: string): runv2.RevisionTemplate {
  const { serviceId, region } = svc.config;
  const template: runv2.RevisionTemplate = svc.existing
    ? cloneDeep(svc.existing.template)
    : { containers: [{ name: serviceId }] };
  // The live template names the live revision. Drop the name so Cloud Run creates a new revision.
  delete template.revision;
  const container = mainContainer(template);
  if (!container) {
    throw new FirebaseError(`Service ${serviceId} in ${region} has no containers.`);
  }
  if (container.sourceCode && !container.buildConfig) {
    // The live revision ran a local build's output, with the build's start command (see
    // localBuildTemplate). Drop the command too, so the new revision runs what it's built to run.
    delete container.command;
  }
  // Each deploy sets what the container runs: an image that Cloud Run builds, or a local build's
  // output. Drop the live revision's.
  delete container.image;
  delete container.sourceCode;
  delete container.buildConfig;
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
 * Returns the revision to roll out for a remote build: revisionTemplate's, with a main container
 * that Cloud Run builds from the uploaded build folder (see remoteBuildConfig).
 */
function remoteBuildTemplate(
  svc: ServiceDeploy,
  source: runv2.StorageSource,
  imageRepository: string,
  appFolder: string,
  message?: string,
): runv2.RevisionTemplate {
  const template = revisionTemplate(svc, message);
  // revisionTemplate has already checked that there's a container.
  const container = mainContainer(template)!;
  container.sourceCode = { cloudStorageSource: source };
  container.buildConfig = remoteBuildConfig(svc, imageRepository, appFolder);
  return template;
}

/**
 * Returns how Cloud Run builds a remote build's image from the uploaded build folder, with App
 * Hosting's buildpacks. Exported for testing.
 * - `imageRepositoryUri`: the Artifact Registry repository that Cloud Run pushes the image to.
 * - `buildpacksBuild.buildBaseImageUri`: only if the service has a base image, i.e. automatic base
 *   image updates. Cloud Run requires it then. The image is built on the base image that it runs
 *   on, like Cloud Functions does.
 * - `buildpacksBuild.environmentVariables`: env vars for the build only. The container doesn't get
 *   them at runtime. If two have the same name, the later one in this list wins:
 *   1. GOOGLE_BUILDABLE: the app's folder in the build folder (`appFolder`, see buildDirectory in
 *      apphosting/util.ts). Only set if the app is in an Nx or Turborepo monorepo, whose root is
 *      the build folder.
 *   2. The service's build env (see buildEnv.ts), without secrets: Cloud Run's build API only takes
 *      plain values, and prepare already rejects secrets for remote builds.
 *   3. X_GOOGLE_TARGET_PLATFORM=fah, so that the buildpacks build the app like App Hosting does,
 *      with its framework adapters. They then need FIREBASE_OUTPUT_BUNDLE_DIR, the folder to write
 *      App Hosting's output bundle to.
 */
export function remoteBuildConfig(
  svc: ServiceDeploy,
  imageRepository: string,
  appFolder: string,
): runv2.ContainerBuildConfig {
  return {
    imageRepositoryUri: imageRepository,
    buildpacksBuild: {
      ...(svc.baseImage ? { buildBaseImageUri: svc.baseImage } : {}),
      environmentVariables: {
        ...(appFolder ? { GOOGLE_BUILDABLE: appFolder } : {}),
        ...nonSecretValues(svc.buildEnv || {}),
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    },
  };
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
  const template = revisionTemplate(svc, message);
  // revisionTemplate has already checked that there's a container.
  const container = mainContainer(template)!;
  container.image = NO_IMAGE;
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
    launchStage: LAUNCH_STAGE,
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
    launchStage: LAUNCH_STAGE,
  };
  return runv2.updateService(update, {
    updateMask: ["template", "traffic", "annotations", "launchStage"],
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
