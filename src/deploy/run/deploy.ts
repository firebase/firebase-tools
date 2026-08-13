import { Context, Payload, RunDeployOptions, RunServiceSpec } from "./args";
import * as runv2 from "../../gcp/runv2";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as gcs from "../../gcp/storage";
import { archiveDirectory } from "../../archiveDirectory";
import { getProjectNumber } from "../../getProjectNumber";
import { EnvMap } from "../../apphosting/yaml";
import { splitEnvVars, AppHostingRunConfig as RunConfig } from "../../apphosting/config";
import { toCanonicalSecretResourcePath } from "../../apphosting/secrets";
import { EnvVar } from "../../gcp/k8s";
import { logger } from "../../logger";

/**
 * Applies runtime environment variables and Secret Manager references to a container.
 */
function applyContainerEnv(
  container: runv2.Container,
  projectId: string,
  runtimeEnvMap: EnvMap,
): void {
  const newEnv: EnvVar[] = [];
  for (const [key, val] of Object.entries(runtimeEnvMap)) {
    if (val.value !== undefined) {
      newEnv.push({ name: key, value: val.value });
    } else if (val.secret !== undefined) {
      const { secretPath, version } = toCanonicalSecretResourcePath(String(val.secret), projectId);
      newEnv.push({
        name: key,
        valueSource: {
          secretKeyRef: {
            secret: secretPath,
            version,
          },
        },
      });
    }
  }

  const envMap = new Map<string, EnvVar>();
  if (container.env) {
    for (const existingVar of container.env) {
      envMap.set(existingVar.name, existingVar);
    }
  }
  for (const newVar of newEnv) {
    envMap.set(newVar.name, newVar);
  }
  container.env = Array.from(envMap.values());
}

/**
 * Applies CPU and memory limits from apphosting.yaml runConfig to the container.
 */
function applyContainerResources(container: runv2.Container, runConfig?: RunConfig): void {
  if (!runConfig || (runConfig.cpu === undefined && runConfig.memoryMiB === undefined)) {
    return;
  }
  if (!container.resources) container.resources = {};
  if (!container.resources.limits) container.resources.limits = {};
  if (runConfig.cpu !== undefined) {
    container.resources.limits.cpu = String(runConfig.cpu);
  }
  if (runConfig.memoryMiB !== undefined) {
    container.resources.limits.memory = `${runConfig.memoryMiB}Mi`;
  }
}

/**
 * Applies service-level scaling, concurrency, and VPC settings to a Cloud Run service definition.
 */
function applyServiceScaling(
  service: Omit<runv2.Service, runv2.ServiceOutputFields>,
  runConfig?: RunConfig,
): void {
  if (!runConfig) return;

  if (runConfig.minInstances !== undefined || runConfig.maxInstances !== undefined) {
    if (!service.scaling) service.scaling = {};
    if (runConfig.minInstances !== undefined) {
      service.scaling.minInstanceCount = runConfig.minInstances;
    }
    if (runConfig.maxInstances !== undefined) {
      service.scaling.maxInstanceCount = runConfig.maxInstances;
    }
  }

  if (runConfig.concurrency !== undefined) {
    service.template.maxInstanceRequestConcurrency = runConfig.concurrency;
  }
  if (runConfig.vpcAccess) {
    service.template.vpcAccess = runConfig.vpcAccess;
  }
}

/**
 * Maps apphosting.yaml runtime environment variables, Secret Manager secretKeyRef
 * references, CPU/memory limits, VPC, and service-level instance scaling onto a Cloud Run Service definition.
 */
function applyAppHostingConfig(
  projectId: string,
  service: Omit<runv2.Service, runv2.ServiceOutputFields>,
  runtimeEnvMap: EnvMap,
  runConfig?: RunConfig,
  serviceId?: string,
): void {
  if (!service.template.containers) {
    service.template.containers = [];
  }
  if (service.template.containers.length === 0) {
    service.template.containers.push({ name: serviceId || "worker", image: "" });
  }

  const container =
    (serviceId ? service.template.containers.find((c) => c.name === serviceId) : undefined) ||
    service.template.containers[0];
  applyContainerEnv(container, projectId, runtimeEnvMap);
  applyContainerResources(container, runConfig);
  applyServiceScaling(service, runConfig);
}

/**
 * 1. Packages local source and uploads to the regional staging bucket.
 */
async function packageAndUploadSource(
  projectId: string,
  region: string,
  service: RunServiceSpec,
  options: RunDeployOptions,
): Promise<runv2.StorageSource> {
  const archive = await archiveDirectory(service.source, {
    ignore: service.ignore,
    supportGitIgnore: true,
  });

  const projectNumber = await getProjectNumber(options);
  const baseName = `firebase-run-src-${projectNumber}-${region.toLowerCase()}`;
  const bucketName = await gcs.upsertBucket({
    product: "run",
    createMessage: `Creating Cloud Storage bucket in ${region} to store Cloud Run source code uploads at ${baseName}...`,
    projectId,
    req: {
      baseName,
      purposeLabel: `run-source-${region.toLowerCase()}`,
      location: region,
      lifecycle: {
        rule: [
          {
            action: {
              type: "Delete",
            },
            condition: {
              age: 30,
            },
          },
        ],
      },
    },
  });

  const uploadRes = await gcs.uploadObject(
    {
      file: archive.file,
      stream: archive.stream,
    },
    bucketName,
  );

  return {
    bucket: uploadRes.bucket,
    object: uploadRes.object,
    generation: uploadRes.generation || undefined,
  };
}

/**
 * 2. Prepares build-time environment variables and custom build scripts.
 */
function prepareBuildEnvironment(service: RunServiceSpec): Record<string, string> {
  const appHostingConfig = service.appHostingConfig;
  const envRecord = appHostingConfig?.env || {};
  const { build: buildEnvMap } = splitEnvVars(envRecord);
  const buildEnv: Record<string, string> = {};

  for (const [key, val] of Object.entries(buildEnvMap)) {
    if (val.value !== undefined) {
      buildEnv[key] = val.value;
    }
  }

  if (appHostingConfig?.scripts?.build || appHostingConfig?.buildConfig?.buildCommand) {
    buildEnv["GOOGLE_NODE_RUN_SCRIPTS"] = (appHostingConfig.scripts?.build ||
      appHostingConfig.buildConfig?.buildCommand)!;
  }

  return buildEnv;
}

/**
 * 3. Submits the container build to Cloud Build and resolves the base image URI.
 */
async function submitServiceBuild(
  projectId: string,
  region: string,
  service: RunServiceSpec,
  imageUri: string,
): Promise<{ resolvedBaseImageUri?: string; hasAbiu: boolean }> {
  const hasAbiu = !service.clearBaseImage && !!service.baseImageUri;
  const buildEnv = prepareBuildEnvironment(service);

  const build: runv2.Build = {
    storageSource: service.storageSource!,
    imageUri,
    buildpackBuild: {
      enableAutomaticUpdates: hasAbiu,
      environmentVariables: buildEnv,
      ...(hasAbiu ? { baseImage: service.baseImageUri } : {}),
    },
  };

  const buildRes = await runv2.submitBuild(projectId, region, build);
  if (buildRes.baseImageWarning) {
    logger.warn(`Cloud Run ABIU warning: ${buildRes.baseImageWarning}`);
  }

  return {
    hasAbiu,
    resolvedBaseImageUri: hasAbiu ? buildRes.baseImageUri || service.baseImageUri : undefined,
  };
}

/**
 * 4. Reconciles existing service revision template with new image, labels, and apphosting configs.
 */
function buildUpdatedServiceDefinition(
  existing: runv2.Service,
  service: RunServiceSpec,
  projectId: string,
  imageUri: string,
  hasAbiu: boolean,
  resolvedBaseImageUri?: string,
  message?: string,
): { newService: Omit<runv2.Service, runv2.ServiceOutputFields>; updateMask: string[] } {
  const template = JSON.parse(JSON.stringify(existing.template)) as runv2.RevisionTemplate;
  delete template.revision;
  delete template.scaling;
  delete (template as any).client;
  delete (template as any).clientVersion;

  const newService: Omit<runv2.Service, runv2.ServiceOutputFields> = {
    name: existing.name,
    template,
  };

  if (service.serviceAccount) {
    newService.template.serviceAccount = service.serviceAccount;
  }

  if (!newService.template.containers) {
    newService.template.containers = [];
  }
  let container = newService.template.containers.find((c) => c.name === service.serviceId);
  if (!container) {
    if (newService.template.containers.length === 0) {
      container = { name: service.serviceId, image: imageUri };
      newService.template.containers.push(container);
    } else {
      container = newService.template.containers[0];
    }
  }
  container.image = imageUri;

  if (service.clearBaseImage || !hasAbiu) {
    delete container.baseImageUri;
  } else if (resolvedBaseImageUri) {
    container.baseImageUri = resolvedBaseImageUri;
  }

  if (!newService.template.labels) newService.template.labels = {};
  newService.template.labels["client.knative.dev/nonce"] = Math.random()
    .toString(36)
    .substring(2, 12);
  if (!newService.template.annotations) newService.template.annotations = {};
  newService.template.annotations["client.knative.dev/user-image"] = imageUri;
  newService.template.annotations["run.googleapis.com/deployed-at"] = new Date().toISOString();
  if (message) {
    newService.template.annotations["run.googleapis.com/description"] = message;
  }

  const runtimeEnvMap = splitEnvVars(service.appHostingConfig?.env || {}).runtime;
  applyAppHostingConfig(
    projectId,
    newService,
    runtimeEnvMap,
    service.appHostingConfig?.runConfig,
    service.serviceId,
  );

  newService.traffic = [
    {
      type: "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST",
      percent: 100,
    },
  ];

  const updateMask = ["template", "traffic"];
  if (newService.scaling) {
    updateMask.push("scaling");
  }

  return { newService, updateMask };
}

/**
 * 5. Constructs a new Cloud Run service definition with public ingress.
 */
function buildNewServiceDefinition(
  projectId: string,
  region: string,
  service: RunServiceSpec,
  imageUri: string,
  hasAbiu: boolean,
  resolvedBaseImageUri?: string,
  message?: string,
): Omit<runv2.Service, runv2.ServiceOutputFields> {
  const newService: Omit<runv2.Service, runv2.ServiceOutputFields> = {
    name: `projects/${projectId}/locations/${region}/services/${service.serviceId}`,
    template: {
      containers: [
        {
          name: service.serviceId,
          image: imageUri,
          ...(!service.clearBaseImage && hasAbiu && resolvedBaseImageUri
            ? { baseImageUri: resolvedBaseImageUri }
            : {}),
        },
      ],
      annotations: message ? { "run.googleapis.com/description": message } : {},
      ...(service.serviceAccount ? { serviceAccount: service.serviceAccount } : {}),
    },
    client: "cli-firebase",
    invokerIamDisabled: true,
    ingress: "INGRESS_TRAFFIC_ALL",
  };

  const runtimeEnvMap = splitEnvVars(service.appHostingConfig?.env || {}).runtime;
  applyAppHostingConfig(
    projectId,
    newService,
    runtimeEnvMap,
    service.appHostingConfig?.runConfig,
    service.serviceId,
  );

  return newService;
}

/**
 * Deploys a single Cloud Run service from source.
 */
async function deployService(
  context: Context,
  options: RunDeployOptions,
  service: RunServiceSpec,
): Promise<void> {
  const projectId = context.projectId!;
  const region = service.region;
  const message = (service.message || options.message) as string | undefined;

  try {
    // 1. Ensure Artifact Registry repository exists
    await artifactregistry.ensureRepository(projectId, region, "cloud-run-source-deploy");

    // 2. Package source & upload to GCS staging bucket
    service.storageSource = await packageAndUploadSource(projectId, region, service, options);

    // 3. Construct target image URI & submit Cloud Build
    const imageTag = `${Date.now()}`;
    const imageUri = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${service.serviceId}:${imageTag}`;
    const { hasAbiu, resolvedBaseImageUri } = await submitServiceBuild(
      projectId,
      region,
      service,
      imageUri,
    );

    // 4. Create or update Cloud Run service
    let existing = service.existingService;
    if (existing) {
      try {
        const fresh = await runv2.getService(projectId, region, service.serviceId);
        if (fresh) {
          existing = fresh;
        }
      } catch (err: unknown) {
        if ((err as { status?: number })?.status !== 404) {
          logger.debug(`Failed to fetch latest service state for ${service.serviceId}:`, err);
        }
      }

      const { newService, updateMask } = buildUpdatedServiceDefinition(
        existing,
        service,
        projectId,
        imageUri,
        hasAbiu,
        resolvedBaseImageUri,
        message,
      );
      service.deployResponse = await runv2.updateService(newService, updateMask);
    } else {
      const newService = buildNewServiceDefinition(
        projectId,
        region,
        service,
        imageUri,
        hasAbiu,
        resolvedBaseImageUri,
        message,
      );
      service.deployResponse = await runv2.createService(
        projectId,
        region,
        service.serviceId,
        newService,
      );
    }
  } catch (err) {
    if (service.storageSource) {
      try {
        await gcs.deleteObject(`/${service.storageSource.bucket}/${service.storageSource.object}`);
      } catch {
        // ignore cleanup errors
      }
    }
    throw err;
  }
}

/**
 * Deploys Cloud Run services by building container images via Cloud Build
 * and creating or updating services in Cloud Run Admin API v2.
 */
export async function deploy(
  context: Context,
  options: RunDeployOptions,
  payload: Payload,
): Promise<void> {
  const services = payload.run?.services;
  if (!services || services.length === 0) {
    return;
  }

  for (const service of services) {
    await deployService(context, options, service);
  }
}
