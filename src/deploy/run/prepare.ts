import { needProjectId } from "../../projectUtils";
import { Options } from "../../options";
import { prereqs } from "./prereqs";
import * as runv2 from "../../gcp/runv2";
import { getAppHostingConfiguration } from "../../apphosting/config";

/**
 *
 */
export async function prepare(context: any, options: Options, payload: any): Promise<void> {
  const projectId = needProjectId(options);
  await prereqs(options, projectId);

  let rawRunConfigs = options.config ? options.config.get("run") : undefined;
  if (!rawRunConfigs || (Array.isArray(rawRunConfigs) && rawRunConfigs.length === 0)) {
    const onlyOpt = options.only || "";
    const runTargetOpt = onlyOpt.split(",").find((t) => t.startsWith("run"));
    const serviceId =
      runTargetOpt && runTargetOpt.includes(":") ? runTargetOpt.split(":")[1] : "my-service";
    const region = process.env.FIREBASE_RUN_REGION || "us-central1";
    rawRunConfigs = [
      {
        serviceId,
        region,
        source: ".",
        output: ".run",
        ignore: ["node_modules", ".git"],
      },
    ];
  }

  const configs = Array.isArray(rawRunConfigs) ? rawRunConfigs : [rawRunConfigs];

  payload.run = {
    services: [],
  };

  for (const config of configs) {
    const serviceId = config.serviceId;
    const region = process.env.FIREBASE_RUN_REGION || config.region || "us-central1";
    let existingService: runv2.Service | undefined;
    try {
      existingService = await runv2.getService(projectId, region, serviceId);
    } catch (err: any) {
      if (err.status !== 404) {
        throw err;
      }
    }

    let baseImageUri: string | undefined;
    if (existingService?.template?.containers?.[0]?.baseImageUri) {
      baseImageUri = existingService.template.containers[0].baseImageUri;
    }
    // If the config specifies a baseImage, that overrides.
    if (config.baseImageUri !== undefined) {
      baseImageUri = config.baseImageUri;
    }

    const sourceDir = options.config ? options.config.path(config.source || ".") : process.cwd();
    const appHostingConfig = await getAppHostingConfiguration(sourceDir);

    payload.run.services.push({
      serviceId,
      region,
      source: sourceDir,
      ignore: config.ignore || ["node_modules", ".git", ".next"],
      existingService,
      baseImageUri,
      appHostingConfig,
    });
  }
}
