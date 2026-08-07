import { needProjectId } from "../../projectUtils";
import { Options } from "../../options";
import { prereqs } from "./prereqs";
import * as runv2 from "../../gcp/runv2";
import { getAppHostingConfiguration } from "../../apphosting/config";
import { FirebaseError } from "../../error";
import { Context, DEFAULT_RUN_IGNORE, Payload, RunConfig, RunServiceSpec } from "./args";

/**
 * Prepares Cloud Run deployment by validating configurations, filtering targeted services,
 * fetching existing services, resolving base images and App Hosting configurations.
 */
export async function prepare(context: Context, options: Options, payload: Payload): Promise<void> {
  const projectId = needProjectId(options);
  context.projectId = projectId;
  await prereqs(options, projectId);

  const runtimeOpt = ((options as any).runtime || (options as any).baseImage) as string | undefined;
  const clearOpt = !!((options as any).clearRuntime || (options as any).clearBaseImage);

  if (runtimeOpt && clearOpt) {
    throw new FirebaseError(
      "Cannot specify both --runtime/--base-image and --clear-runtime/--clear-base-image.",
    );
  }

  let rawRunConfigs = options.config
    ? (options.config.get("run") as RunConfig | RunConfig[] | undefined)
    : undefined;

  const onlyOpt = options.only || "";
  const runFilterTargets = onlyOpt
    .split(",")
    .filter((t) => t.startsWith("run:") || t === "run")
    .map((t) => (t.includes(":") ? t.split(":")[1] : ""));

  const hasSpecificServiceFilter = runFilterTargets.some((t) => t.length > 0);
  const targetedServiceIds = new Set(runFilterTargets.filter((t) => t.length > 0));

  if (!rawRunConfigs || (Array.isArray(rawRunConfigs) && rawRunConfigs.length === 0)) {
    const serviceId =
      (hasSpecificServiceFilter ? Array.from(targetedServiceIds)[0] : undefined) ||
      ((options as any).service as string | undefined) ||
      "my-service";
    const region =
      ((options as any).primaryRegion as string | undefined) ||
      ((options as any).region as string | undefined) ||
      process.env.FIREBASE_RUN_REGION ||
      "us-central1";
    rawRunConfigs = [
      {
        serviceId,
        region,
        source: ".",
        output: ".run",
        ignore: DEFAULT_RUN_IGNORE,
      },
    ];
  }

  let configs = Array.isArray(rawRunConfigs) ? rawRunConfigs : [rawRunConfigs];

  // Filter multi-service configs by --only run:<serviceId>
  if (hasSpecificServiceFilter) {
    const matchedConfigs = configs.filter((c) => targetedServiceIds.has(c.serviceId));
    if (matchedConfigs.length === 0) {
      throw new FirebaseError(
        `No Cloud Run services in firebase.json match filter '${onlyOpt}'. Configured services: ${configs.map((c) => c.serviceId).join(", ")}`,
      );
    }
    configs = matchedConfigs;
  }

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
      ((options as any).primaryRegion as string | undefined) ||
      ((options as any).region as string | undefined) ||
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

    // ABIU Resolution: CLI flags > config override > sticky existing service
    let baseImageUri: string | undefined;
    let clearBaseImage = false;

    if (clearOpt) {
      clearBaseImage = true;
      baseImageUri = undefined;
    } else if (runtimeOpt) {
      baseImageUri = runtimeOpt;
    } else if (config.baseImageUri || config.baseImage || config.runtime) {
      baseImageUri = config.baseImageUri || config.baseImage || config.runtime;
    } else if (existingService?.template?.containers?.[0]?.baseImageUri) {
      // Stickiness: reuse existing base image from Cloud Run service
      baseImageUri = existingService.template.containers[0].baseImageUri;
    }

    const sourceDir = options.config
      ? options.config.path(config.source || config.rootDir || ".")
      : process.cwd();
    const appHostingConfig = await getAppHostingConfiguration(sourceDir);

    services.push({
      serviceId,
      region,
      source: sourceDir,
      ignore: config.ignore || DEFAULT_RUN_IGNORE,
      existingService,
      baseImageUri,
      clearBaseImage,
      appHostingConfig,
      message: options.message as string | undefined,
    });
  }
}
