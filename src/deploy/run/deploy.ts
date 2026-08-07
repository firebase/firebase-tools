import { Context, Payload } from "./args";
import { Options } from "../../options";
import * as runv2 from "../../gcp/runv2";
import * as artifactregistry from "../../gcp/artifactregistry";
import * as gcs from "../../gcp/storage";
import { EnvMap } from "../../apphosting/yaml";
import { splitEnvVars, AppHostingRunConfig as RunConfig } from "../../apphosting/config";
import { getSecretNameParts } from "../../apphosting/secrets";
import { EnvVar } from "../../gcp/k8s";
import { logger } from "../../logger";

/**
 * Formats a secret reference into a canonical GCP Secret Manager resource path.
 * If already a full resource path (projects/.../secrets/...), returns it directly.
 * Otherwise, prepends projects/${projectId}/secrets/.
 */
export function formatSecretResourcePath(
  rawSecret: string,
  projectId: string,
): {
  secretPath: string;
  version: string;
} {
  let [secretName, version] = getSecretNameParts(rawSecret);
  if (secretName.includes("/versions/")) {
    const parts = secretName.split("/versions/");
    secretName = parts[0];
    version = parts[1] || version;
  }
  const secretPath = secretName.startsWith("projects/")
    ? secretName
    : `projects/${projectId}/secrets/${secretName}`;
  return { secretPath, version };
}

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
      const { secretPath, version } = formatSecretResourcePath(String(val.secret), projectId);
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

  // TODO: Environment variables and secrets are currently sticky across deployments
  // (new configs overlay onto existing container.env without removing absent keys).
  // Implement a declarative pruning reconciliation mechanism once the deletion lifecycle is finalized.
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
  if ((runConfig as any).vpcAccess) {
    service.template.vpcAccess = (runConfig as any).vpcAccess;
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
): void {
  if (!service.template.containers) {
    service.template.containers = [];
  }
  if (service.template.containers.length === 0) {
    service.template.containers.push({ name: "worker", image: "" });
  }

  const container = service.template.containers[0];
  applyContainerEnv(container, projectId, runtimeEnvMap);
  applyContainerResources(container, runConfig);
  applyServiceScaling(service, runConfig);
}

/**
 * Deploys Cloud Run services by building container images via Cloud Build
 * and creating or updating services in Cloud Run Admin API v2.
 */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  if (!payload.run || !payload.run.services || payload.run.services.length === 0) {
    return;
  }

  const projectId = context.projectId!;

  for (const service of payload.run.services) {
    const region = service.region;

    try {
      // Ensure Artifact Registry repository exists
      await artifactregistry.ensureRepository(projectId, region, "cloud-run-source-deploy");

      // Construct image URI
      const imageUri = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${service.serviceId}:latest`;

      const appHostingConfig = service.appHostingConfig;
      const envRecord = appHostingConfig?.env || {};
      const { build: buildEnvMap, runtime: runtimeEnvMap } = splitEnvVars(envRecord);
      const buildEnv: Record<string, string> = {};
      for (const [key, val] of Object.entries(buildEnvMap)) {
        if (val.value !== undefined) {
          buildEnv[key] = val.value;
        }
      }

      if ((appHostingConfig as any)?.scripts?.build) {
        buildEnv["GOOGLE_NODE_RUN_SCRIPTS"] = (appHostingConfig as any).scripts.build;
      }

      const hasAbiu = !service.clearBaseImage && !!service.baseImageUri;

      // Submit build via Cloud Run Build API
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
      const resolvedBaseImageUri = hasAbiu
        ? buildRes.baseImageUri || service.baseImageUri
        : undefined;

      if (buildRes.baseImageWarning) {
        logger.warn(`Cloud Run ABIU warning: ${buildRes.baseImageWarning}`);
      }

      // Deploy via POST (new service) or PATCH (existing service)
      let existing = service.existingService;
      let newService: Omit<runv2.Service, runv2.ServiceOutputFields>;

      if (existing) {
        try {
          existing = await runv2.getService(projectId, region, service.serviceId);
        } catch {
          // If fetch fails, fall back to cached existing service
        }
        const template = JSON.parse(JSON.stringify(existing.template)) as runv2.RevisionTemplate;
        delete template.revision;
        delete template.scaling;
        delete (template as any).client;
        delete (template as any).clientVersion;

        newService = {
          name: existing.name,
          template,
        };

        // Mutate template with new image
        if (!newService.template.containers) {
          newService.template.containers = [];
        }
        if (newService.template.containers.length === 0) {
          newService.template.containers.push({ name: service.serviceId, image: imageUri });
        } else {
          newService.template.containers[0].image = imageUri;
        }

        // ABIU stickiness handling: only set baseImageUri if explicitly enabled
        if (service.clearBaseImage || !hasAbiu) {
          delete newService.template.containers[0].baseImageUri;
        } else if (resolvedBaseImageUri) {
          newService.template.containers[0].baseImageUri = resolvedBaseImageUri;
        }

        if (!newService.template.labels) newService.template.labels = {};
        newService.template.labels["client.knative.dev/nonce"] = Math.random()
          .toString(36)
          .substring(2, 12);
        if (!newService.template.annotations) newService.template.annotations = {};
        newService.template.annotations["client.knative.dev/user-image"] = imageUri;
        newService.template.annotations["run.googleapis.com/deployed-at"] =
          new Date().toISOString();
        const revisionDescription = (service.message || options.message) as string | undefined;
        if (revisionDescription) {
          newService.template.annotations["run.googleapis.com/description"] = revisionDescription;
        }

        applyAppHostingConfig(projectId, newService, runtimeEnvMap, appHostingConfig?.runConfig);

        const updateMask = ["template"];
        if (newService.scaling) {
          updateMask.push("scaling");
        }
        service.deployResponse = await runv2.updateService(newService, updateMask);
      } else {
        const revisionDescription = (service.message || options.message) as string | undefined;
        newService = {
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
            annotations: revisionDescription
              ? { "run.googleapis.com/description": revisionDescription }
              : {},
          },
          client: "cli-firebase",
        };

        applyAppHostingConfig(projectId, newService, runtimeEnvMap, appHostingConfig?.runConfig);

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
          await gcs.deleteObject(
            `/${service.storageSource.bucket}/${service.storageSource.object}`,
          );
        } catch {
          // ignore cleanup errors
        }
      }
      throw err;
    }
  }
}
