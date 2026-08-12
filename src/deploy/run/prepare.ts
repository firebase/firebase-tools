import { needProjectId } from "../../projectUtils";
import { prereqs } from "./prereqs";
import * as path from "path";
import * as runv2 from "../../gcp/runv2";
import { fileExistsSync } from "../../fsutils";
import { AppHostingYamlConfig } from "../../apphosting/yaml";
import { FirebaseError } from "../../error";
import {
  Context,
  DEFAULT_RUN_IGNORE,
  Payload,
  RunConfig,
  RunDeployOptions,
  RunServiceSpec,
} from "./args";

/**
 * Validates CLI flags to ensure incompatible options are not specified simultaneously.
 */
function validateCliFlags(options: RunDeployOptions): {
  runtimeOpt?: string;
  clearOpt: boolean;
} {
  const runtimeOpt = options.runtime || options.baseImage;
  const clearOpt = !!(options.clearRuntime || options.clearBaseImage);

  if (runtimeOpt !== undefined && runtimeOpt !== "" && clearOpt) {
    throw new FirebaseError(
      "Cannot specify both --runtime/--base-image and --clear-runtime/--clear-base-image.",
    );
  }

  return { runtimeOpt, clearOpt };
}

/**
 * Filters the list of configured Cloud Run services based on the `--only run:<serviceId>` flag.
 */
function filterTargetConfigs(
  rawRunConfigs: RunConfig | RunConfig[] | undefined,
  onlyOpt?: string,
): RunConfig[] {
  if (!rawRunConfigs || (Array.isArray(rawRunConfigs) && rawRunConfigs.length === 0)) {
    throw new FirebaseError(
      "No Cloud Run services configured in firebase.json. Run 'firebase init run' to set up a service.",
    );
  }

  let configs = Array.isArray(rawRunConfigs) ? rawRunConfigs : [rawRunConfigs];
  const onlyString = onlyOpt || "";
  const runFilterTargets = onlyString
    .split(",")
    .filter((t) => t.startsWith("run:") || t === "run")
    .map((t) => (t.includes(":") ? t.split(":")[1] : ""));

  const hasSpecificServiceFilter = runFilterTargets.some((t) => t.length > 0);
  const targetedServiceIds = new Set(runFilterTargets.filter((t) => t.length > 0));

  if (hasSpecificServiceFilter) {
    const configuredServiceIds = new Set(configs.map((c) => c.serviceId));
    const missingServiceIds = Array.from(targetedServiceIds).filter((id) => !configuredServiceIds.has(id));
    if (missingServiceIds.length > 0) {
      throw new FirebaseError(
        `Cloud Run service(s) '${missingServiceIds.join(", ")}' not found in firebase.json. Configured services: ${Array.from(configuredServiceIds).join(", ")}`,
      );
    }
    configs = configs.filter((c) => targetedServiceIds.has(c.serviceId));
  }

  return configs;
}

/**
 * Resolves ABIU base image URI with precedence:
 * 1. CLI flags (`--clear-runtime` / `--clear-base-image` vs `--runtime` / `--base-image`)
 * 2. Existing Cloud Run service revision template (gcloud-style stickiness)
 */
function resolveBaseImage(
  existingService: runv2.Service | undefined,
  runtimeOpt?: string,
  clearOpt?: boolean,
): { baseImageUri?: string; clearBaseImage: boolean } {
  if (clearOpt || runtimeOpt === "") {
    return { baseImageUri: undefined, clearBaseImage: true };
  }
  if (runtimeOpt !== undefined) {
    return { baseImageUri: runtimeOpt, clearBaseImage: false };
  }
  if (existingService?.template?.containers?.[0]?.baseImageUri) {
    return {
      baseImageUri: existingService.template.containers[0].baseImageUri,
      clearBaseImage: false,
    };
  }
  return { baseImageUri: undefined, clearBaseImage: false };
}

/**
 * Prepares Cloud Run deployment by validating configurations, filtering targeted services,
 * fetching existing services, resolving base images and App Hosting configurations.
 */
export async function prepare(context: Context, options: RunDeployOptions, payload: Payload): Promise<void> {
  const projectId = needProjectId(options);
  context.projectId = projectId;

  const { runtimeOpt, clearOpt } = validateCliFlags(options);
  const rawRunConfigs = options.config
    ? (options.config.get("run") as RunConfig | RunConfig[] | undefined)
    : undefined;

  const configs = filterTargetConfigs(rawRunConfigs, options.only);

  await prereqs(options, projectId);

  const services: RunServiceSpec[] = [];
  payload.run = {
    services,
  };

  for (const config of configs) {
    const serviceId = config.serviceId;
    if (!serviceId) {
      throw new FirebaseError("Cloud Run serviceId must be specified in firebase.json.");
    }

    const region =
      options.primaryRegion ||
      options.region ||
      process.env.FIREBASE_RUN_REGION ||
      config.region ||
      config["primary-region"] ||
      "us-central1";

    let existingService: runv2.Service | undefined;
    try {
      existingService = await runv2.getService(projectId, region, serviceId);
    } catch (err: unknown) {
      if ((err as { status?: number })?.status !== 404) {
        throw err;
      }
    }

    const { baseImageUri, clearBaseImage } = resolveBaseImage(
      existingService,
      runtimeOpt,
      clearOpt,
    );

    const sourceDir = options.config.path(config.source || config.rootDir || ".");
    const yamlPath = path.join(sourceDir, "apphosting.yaml");
    let appHostingConfig: AppHostingYamlConfig | undefined;
    if (fileExistsSync(yamlPath)) {
      appHostingConfig = await AppHostingYamlConfig.loadFromFile(yamlPath);
    }

    services.push({
      serviceId,
      region,
      source: sourceDir,
      ignore: Array.from(new Set([...DEFAULT_RUN_IGNORE, ...(config.ignore || [])])),
      existingService,
      baseImageUri,
      clearBaseImage,
      appHostingConfig,
      message: options.message as string | undefined,
      serviceAccount: options.serviceAccount || config.serviceAccount,
    });
  }
}
