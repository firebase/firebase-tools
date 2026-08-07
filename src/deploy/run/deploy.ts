import { Options } from "../../options";
import { archiveDirectory } from "../../archiveDirectory";
import * as gcs from "../../gcp/storage";
import { getProjectNumber } from "../../getProjectNumber";
import * as runv2 from "../../gcp/runv2";
import * as artifactregistry from "../../gcp/artifactregistry";
import { RunConfig, splitEnvVars } from "../../apphosting/config";
import { EnvMap } from "../../apphosting/yaml";
import { EnvVar } from "../../gcp/k8s";
import { needProjectId } from "../../projectUtils";
import { logger } from "../../logger";
import * as gcsm from "../../gcp/secretManager";
import { getSecretNameParts } from "../../apphosting/secrets";
import { Context, Payload } from "./args";

/**
 * Deploys Cloud Run services by building container images via Cloud Build
 * and creating or updating Cloud Run v2 services.
 */
export async function deploy(context: Context, options: Options, payload: Payload): Promise<void> {
  const projectId = context.projectId || needProjectId(options);
  const projectNumber = await getProjectNumber(options);

  if (!payload.run?.services) return;

  for (const service of payload.run.services) {
    const region = service.region;

    // Create regional storage bucket
    const baseName = `firebase-run-src-${projectNumber}-${region}`;
    const bucketName = await gcs.upsertBucket({
      product: "run",
      projectId,
      createMessage: `Creating Cloud Storage bucket to store Run source code...`,
      req: {
        baseName,
        location: region,
        purposeLabel: "run-source",
        lifecycle: { rule: [{ action: { type: "Delete" }, condition: { age: 1 } }] },
      },
    });

    // Zip and upload
    const archive = await archiveDirectory(service.source, {
      ignore: service.ignore,
    });

    const uploadRes = await gcs.uploadObject(
      {
        file: archive.file,
        stream: archive.stream,
      },
      bucketName,
    );

    service.storageSource = {
      bucket: uploadRes.bucket,
      object: uploadRes.object,
      generation: uploadRes.generation || undefined,
    };

    try {
      // Ensure Artifact Registry repository exists
      await artifactregistry.ensureRepository(projectId, region, "cloud-run-source-deploy");

      // Construct image URI
      const imageUri = `${region}-docker.pkg.dev/${projectId}/cloud-run-source-deploy/${service.serviceId}:latest`;

      const appHostingConfig = service.appHostingConfig;
      const envRecord = appHostingConfig?.env || {};
      const { build: buildEnvMap, runtime: runtimeEnvMap } = splitEnvVars(envRecord);
      const firebaseConfigStr = JSON.stringify({
        projectId,
        storageBucket: `${projectId}.appspot.com`,
      });
      const buildEnv: Record<string, string> = {
        FIREBASE_CONFIG: firebaseConfigStr,
      };
      for (const [key, val] of Object.entries(buildEnvMap)) {
        if (val.value !== undefined) {
          buildEnv[key] = val.value;
        } else if (val.secret) {
          try {
            const [secretName, version] = getSecretNameParts(val.secret);
            const secretVal = await gcsm.accessSecretVersion(projectId, secretName, version);
            buildEnv[key] = secretVal;
          } catch (err: any) {
            logger.warn(`Failed to resolve build secret ${key} (${val.secret}): ${err.message}`);
          }
        }
      }

      if ((appHostingConfig as any)?.scripts?.build) {
        buildEnv["GOOGLE_NODE_RUN_SCRIPTS"] = (appHostingConfig as any).scripts.build;
      }

      const hasAbiu = !service.clearBaseImage && !!service.baseImageUri;

      // Submit build via Cloud Run Build API
      const build: runv2.Build = {
        storageSource: service.storageSource,
        imageUri,
        buildpackBuild: {
          enableAutomaticUpdates: hasAbiu,
          environmentVariables: buildEnv,
          ...(hasAbiu ? { baseImage: service.baseImageUri } : {}),
        },
      };

      const buildRes = await runv2.submitBuild(projectId, region, build);
      const resolvedBaseImageUri =
        buildRes.baseImageUri || (hasAbiu ? service.baseImageUri : undefined);

      if (buildRes.baseImageWarning) {
        logger.warn(`Cloud Run ABIU warning: ${buildRes.baseImageWarning}`);
      }

      // Deploy via POST or PATCH
      const existing = service.existingService;
      let newService: Omit<runv2.Service, runv2.ServiceOutputFields>;

      if (existing) {
        const template = JSON.parse(JSON.stringify(existing.template)) as runv2.RevisionTemplate;
        delete template.revision;
        delete template.scaling;
        delete (template as any).client;
        delete (template as any).clientVersion;

        newService = {
          name: existing.name,
          template,
          client: "cli-firebase",
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

        // ABIU stickiness handling
        if (service.clearBaseImage) {
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

        applyAppHostingConfig(newService, runtimeEnvMap, appHostingConfig?.runConfig, projectId);

        service.deployResponse = await runv2.updateService(newService, ["template", "client"]);
      } else {
        const revisionDescription = (service.message || options.message) as string | undefined;
        newService = {
          name: `projects/${projectId}/locations/${region}/services/${service.serviceId}`,
          template: {
            containers: [
              {
                name: service.serviceId,
                image: imageUri,
                ...(!service.clearBaseImage && resolvedBaseImageUri
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

        applyAppHostingConfig(newService, runtimeEnvMap, appHostingConfig?.runConfig, projectId);

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
        } catch (cleanupErr) {
          logger.debug("Failed to clean up staging archive on deployment failure:", cleanupErr);
        }
      }
      throw err;
    }
  }
}

function applyAppHostingConfig(
  service: Omit<runv2.Service, runv2.ServiceOutputFields>,
  runtimeEnvMap: EnvMap,
  runConfig?: RunConfig,
  projectId?: string,
): void {
  if (!service.template.containers) {
    service.template.containers = [];
  }
  if (service.template.containers.length === 0) {
    service.template.containers.push({ name: "worker", image: "" });
  }

  const container = service.template.containers[0];

  // Map runtime and secret env vars
  const env: EnvVar[] = [];
  if (projectId && !runtimeEnvMap["FIREBASE_CONFIG"]) {
    env.push({
      name: "FIREBASE_CONFIG",
      value: JSON.stringify({
        projectId,
        storageBucket: `${projectId}.appspot.com`,
      }),
    });
  }
  for (const [key, val] of Object.entries(runtimeEnvMap)) {
    if (val.value !== undefined) {
      env.push({ name: key, value: val.value });
    } else if (val.secret !== undefined) {
      let secretName = String(val.secret);
      let version = "latest";
      if (secretName.includes("@")) {
        const parts = secretName.split("@");
        secretName = parts[0];
        version = parts[1] || "latest";
      }
      if (secretName.includes("/")) {
        const parts = secretName.split("/");
        secretName = parts[parts.length - 1];
      }
      env.push({
        name: key,
        valueSource: {
          secretKeyRef: {
            secret: secretName,
            version: version,
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
  for (const newVar of env) {
    envMap.set(newVar.name, newVar);
  }
  container.env = Array.from(envMap.values());

  // Map RunConfig
  if (runConfig) {
    if (runConfig.cpu !== undefined || runConfig.memoryMiB !== undefined) {
      if (!container.resources) container.resources = {};
      if (!container.resources.limits) container.resources.limits = {};
      if (runConfig.cpu !== undefined) container.resources.limits.cpu = String(runConfig.cpu);
      if (runConfig.memoryMiB !== undefined)
        container.resources.limits.memory = `${runConfig.memoryMiB}Mi`;
    }
    if (runConfig.minInstances !== undefined || runConfig.maxInstances !== undefined) {
      if (!service.scaling) service.scaling = {};
      if (runConfig.minInstances !== undefined)
        service.scaling.minInstanceCount = runConfig.minInstances;
      if (runConfig.maxInstances !== undefined)
        service.scaling.maxInstanceCount = runConfig.maxInstances;
    }
    if (runConfig.concurrency !== undefined) {
      service.template.maxInstanceRequestConcurrency = runConfig.concurrency;
    }
    if ((runConfig as any).vpcAccess) {
      service.template.vpcAccess = (runConfig as any).vpcAccess;
    }
  }
}
