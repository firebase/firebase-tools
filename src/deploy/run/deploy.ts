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

    // Create bucket
    const baseName = `firebase-run-src-${projectNumber}`;
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
      }
    }

    // Submit build
    const build: runv2.Build = {
      storageSource: service.storageSource,
      imageUri,
      buildpackBuild: {
        enableAutomaticUpdates: true,
        environmentVariables: buildEnv,
        ...(service.baseImageUri ? { baseImage: service.baseImageUri } : {}),
      },
    };
    await runv2.submitBuild(projectId, region, build);

    // Deploy via POST or PATCH
    const existing = service.existingService;
    let newService: Omit<runv2.Service, runv2.ServiceOutputFields>;

    if (existing) {
      newService = {
        name: existing.name,
        template: JSON.parse(JSON.stringify(existing.template)) as runv2.RevisionTemplate,
        ...(existing.labels ? { labels: existing.labels } : {}),
        ...(existing.annotations ? { annotations: existing.annotations } : {}),
        ...(existing.ingress ? { ingress: existing.ingress } : {}),
        ...(existing.description ? { description: existing.description } : {}),
        ...(existing.scaling ? { scaling: existing.scaling } : {}),
      };
      delete newService.template.revision;

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
      if (service.baseImageUri !== undefined) {
        newService.template.containers[0].baseImageUri = service.baseImageUri;
      } else {
        delete newService.template.containers[0].baseImageUri;
      }

      applyAppHostingConfig(newService, runtimeEnvMap, appHostingConfig?.runConfig, projectId);

      const updateMask = ["template"];
      if (newService.labels) updateMask.push("labels");
      if (newService.annotations) updateMask.push("annotations");
      if (newService.scaling) updateMask.push("scaling");
      if (newService.ingress) updateMask.push("ingress");
      if (newService.description) updateMask.push("description");

      service.deployResponse = await runv2.updateService(newService, updateMask);
    } else {
      newService = {
        name: `projects/${projectId}/locations/${region}/services/${service.serviceId}`,
        template: {
          containers: [
            {
              name: service.serviceId,
              image: imageUri,
              ...(service.baseImageUri ? { baseImageUri: service.baseImageUri } : {}),
            },
          ],
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
      const secretPath =
        secretName.startsWith("projects/") || !projectId
          ? secretName
          : `projects/${projectId}/secrets/${secretName}`;
      env.push({
        name: key,
        valueSource: {
          secretKeyRef: {
            secret: secretPath,
            version: version,
          },
        },
      });
    }
  }
  if (env.length > 0) {
    container.env = env;
  }

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
  }
}
