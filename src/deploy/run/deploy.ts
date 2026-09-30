import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { CLOUD_RUN_SIZE_LIMIT_BYTES } from "../../apphosting/constants";
import { localBuild, validateLocalBuildNodeVersion } from "../../apphosting/localbuilds";
import { FirebaseError } from "../../error";
import { Backend } from "../../gcp/apphosting";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as runv2 from "../../gcp/runv2";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import { Options } from "../../options";
import { logLabeledBullet } from "../../utils";
import { prepareLocalBuildScratchDirectory } from "../apphosting/prepare";
import { createLocalBuildTarArchive, createSourceDeployArchive } from "../apphosting/util";
import { Context, Payload, ServiceDeploy } from "./args";
import { secretNames, toLocalBuildEnv } from "./buildEnv";
import {
  copyTemplate,
  deployRevision,
  mainContainer,
  SERVICE_OPERATION_TIMEOUT_MS,
  toAppHostingConfig,
} from "./util";

const DEPLOY_MESSAGE_ANNOTATION = "firebase.google.com/deploy-message";

/**
 * Builds each service (locally or on Cloud Build), uploads it, and deploys it.
 */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  for (const svc of payload.run?.services || []) {
    try {
      if (svc.config.localBuild) {
        svc.localBuild = await buildLocally(context, options, svc);
      }
      svc.deployed = await deployService(context, options, svc);
    } finally {
      if (svc.localBuild) {
        fs.rmSync(svc.localBuild.scratchDir, { recursive: true, force: true });
      }
    }
  }
}

async function buildLocally(
  context: Context,
  options: Options,
  svc: ServiceDeploy,
): Promise<NonNullable<ServiceDeploy["localBuild"]>> {
  const { config } = svc;
  const { serviceId } = config;
  const buildEnv = svc.buildEnv || {};
  const cfg = toAppHostingConfig(config);
  validateLocalBuildNodeVersion(
    { runtime: { value: svc.baseImage?.split("/").pop() } } as Backend,
    path.join(options.config.projectDir, cfg.rootDir),
  );
  logLabeledBullet("run", `Starting local build for service ${serviceId}`);
  const secrets = secretNames(buildEnv);
  if (secrets.length) {
    logLabeledBullet(
      "run",
      `Reading build secrets ${secrets.join(", ")} with your credentials. Their values may be ` +
        `included in the build output.`,
    );
  }
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), `run-local-build-${serviceId}-`));
  try {
    await prepareLocalBuildScratchDirectory(options.config.projectDir, scratchDir, cfg);
    const { outputFiles, buildConfig } = await localBuild(
      context.projectId,
      scratchDir,
      toLocalBuildEnv(buildEnv),
      {
        nonInteractive: options.nonInteractive,
        // Unlike App Hosting, Cloud Run doesn't ask users to confirm build secrets in local builds.
        allowLocalBuildSecrets: true,
        rootDir: config.rootDir,
      },
    );
    const env = (buildConfig.env || [])
      .filter(
        (e) =>
          e.variable &&
          e.value !== undefined &&
          (!e.availability || e.availability.includes("RUNTIME")),
      )
      .map((e) => ({ name: e.variable, value: e.value! }));
    return { scratchDir, outputFiles, runCommand: buildConfig.runCommand, env };
  } catch (err: unknown) {
    fs.rmSync(scratchDir, { recursive: true, force: true });
    throw err;
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
  if (svc.localBuild) {
    // Cloud Run runs locally built apps directly from source on top of the base image.
    container.image = "scratch";
    container.sourceCode = { cloudStorageSource: source };
    const cmd = svc.localBuild.runCommand?.trim();
    if (cmd) {
      container.command = cmd.split(/\s+/);
    } else {
      delete container.command;
    }
    if (svc.localBuild.env?.length) {
      const existingNames = new Set((container.env || []).map((e) => e.name));
      const newEnv = svc.localBuild.env.filter((e) => !existingNames.has(e.name));
      if (newEnv.length) {
        container.env = [...(container.env || []), ...newEnv];
      }
    }
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
  if (options.message) {
    template.annotations = {
      ...template.annotations,
      [DEPLOY_MESSAGE_ANNOTATION]: options.message as string,
    };
  } else if (template.annotations) {
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
  try {
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
      // Prepare rejects build secrets for builds on Cloud Build, so these are all plain values.
      environmentVariables: {
        ...(svc.buildEnv as Record<string, string> | undefined),
        X_GOOGLE_TARGET_PLATFORM: "fah",
        FIREBASE_OUTPUT_BUNDLE_DIR: "/workspace/.apphosting",
      },
    },
  });
  return imageUri;
}
