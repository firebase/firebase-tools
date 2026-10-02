import { statSync } from "fs";
import * as path from "path";
import { Setup } from "..";
import { Config } from "../../config";
import { deploy } from "../../deploy";
import { prereqs, RUN_PERMISSIONS } from "../../deploy/run/prereqs";
import { getExistingService } from "../../deploy/run/util";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import * as run from "../../gcp/run";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { input, select } from "../../prompt";
import { requirePermissions } from "../../requirePermissions";
import { logBullet } from "../../utils";

const DEFAULT_IGNORE = ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"];
const SERVICE_ID_REGEX = /^[a-z]([-a-z0-9]{0,47}[a-z0-9])?$/;

export interface RunInfo {
  serviceId: string;
  region: string;
  baseImage: string;
  rootDir: string;
  localBuild?: boolean;
}

/**
 * Checks product-level setup, then asks which service to create or update and how to deploy it.
 */
export async function askQuestions(setup: Setup, config: Config, options: Options): Promise<void> {
  const projectId = setup.projectId;
  if (!projectId) {
    throw new FirebaseError("Cloud Run requires a Firebase project. Run firebase use --add first.");
  }
  await requirePermissions({ ...options, projectId }, RUN_PERMISSIONS);
  await prereqs(projectId);

  let existing: runv2.Service | undefined;
  const action = await select({
    message: "Please select an option",
    choices: [
      { name: "Create a new service and deploy", value: "create" },
      { name: "Update an existing service and deploy", value: "update" },
    ],
    default: "create",
  });
  if (action === "update") {
    existing = await promptExistingService(projectId);
  }

  let serviceId: string;
  let region: string;
  if (existing) {
    ({ region, serviceId } = parseServiceName(existing.name));
  } else {
    region = await select({
      message: "Which region should this service be deployed to?",
      choices: await run.listLocations(projectId),
      default: "us-central1",
    });
    serviceId = await promptNewServiceId(projectId, region);
  }

  const localBuild = await select({
    message: "Would you like to build your app locally or remotely?",
    choices: [
      { name: "Build remotely on Cloud Build", value: false },
      { name: "Build locally", value: true },
    ],
    default: false,
  });

  const existingBaseImage = existing?.template.containers?.[0]?.baseImageUri;
  let defaultBaseImage: string | undefined = "nodejs22";
  if (existing) {
    defaultBaseImage = existingBaseImage || (localBuild ? "nodejs22" : undefined);
  }
  const rawBaseImage = await input({
    message: "Which base image should your app use? (e.g. nodejs20, nodejs22)",
    default: defaultBaseImage,
    validate: (img: string) => {
      if (localBuild && !img.trim()) {
        return "Local builds require a base image.";
      }
      return true;
    },
  });
  const baseImage = (rawBaseImage || "").trim();

  const rootDir = await promptRootDir(config.projectDir);

  setup.featureInfo = {
    ...setup.featureInfo,
    run: { serviceId, region, baseImage, rootDir, ...(localBuild && { localBuild }) },
  };
}

async function promptExistingService(projectId: string): Promise<runv2.Service | undefined> {
  const allServices = await runv2.listServices(projectId, /* functionsOnly= */ false);
  // Skip services that another product (e.g. Cloud Functions or App Hosting) manages.
  const services = allServices.filter((s) => !s.labels?.[runv2.CLIENT_NAME_LABEL]);
  if (services.length === 0) {
    logBullet("No Cloud Run services to update. Creating a new service instead.");
    return undefined;
  }
  const choices = services.map((service) => {
    const { serviceId, region } = parseServiceName(service.name);
    return { name: `${serviceId} (${region})`, value: service };
  });
  return select<runv2.Service>({
    message: "Which service would you like to update?",
    choices,
  });
}

/**
 * Extracts the region and service ID from a Cloud Run service resource name
 * (projects/{project}/locations/{region}/services/{serviceId}).
 */
function parseServiceName(name: string): { region: string; serviceId: string } {
  const parts = name.split("/");
  return { region: parts[3], serviceId: parts[5] };
}

async function promptNewServiceId(projectId: string, region: string): Promise<string> {
  return input({
    message: "Please enter a unique ID for your service",
    validate: async (id: string) => {
      if (!SERVICE_ID_REGEX.test(id)) {
        return "Use up to 49 lowercase letters, digits, and hyphens, starting with a letter and not ending with a hyphen.";
      }
      const existing = await getExistingService(projectId, region, id);
      if (existing) {
        return `A service named ${id} already exists in ${region}.`;
      }
      return true;
    },
  });
}

async function promptRootDir(projectDir: string): Promise<string> {
  return input({
    message: "Specify your app's root directory relative to your firebase.json directory",
    default: "/",
    validate: (dir: string) => {
      const absPath = path.join(projectDir, dir);
      const stat = statSync(absPath, { throwIfNoEntry: false });
      if (!stat?.isDirectory()) {
        return `Directory ${absPath} does not exist. Please enter a valid directory.`;
      }
      return true;
    },
  });
}

/**
 * Adds the service to firebase.json and deploys it, since Cloud Run services only change on deploy.
 */
export async function actuate(setup: Setup, config: Config, options: Options): Promise<void> {
  const info = setup.featureInfo?.run;
  if (!info) {
    return;
  }
  upsertRunConfig(
    {
      serviceId: info.serviceId,
      rootDir: info.rootDir,
      region: info.region,
      ...(info.localBuild && { localBuild: true }),
      ignore: DEFAULT_IGNORE,
    },
    config,
  );
  config.writeProjectFile("firebase.json", config.src);
  await deploy(
    ["run"],
    { ...options, projectId: setup.projectId, config, only: `run:${info.serviceId}` },
    { baseImage: info.baseImage || null },
  );
}

/**
 * Adds a service to firebase.json, or updates it in place. Settings that init doesn't ask
 * about (e.g. a custom ignore list) are kept. Exported for unit testing.
 */
export function upsertRunConfig(runConfig: RunSingle, config: Config): void {
  if (!config.src.run) {
    config.set("run", runConfig);
    return;
  }
  const services = Array.isArray(config.src.run) ? [...config.src.run] : [config.src.run];
  const existingIndex = services.findIndex((s) => s.serviceId === runConfig.serviceId);
  if (existingIndex === -1) {
    services.push(runConfig);
  } else {
    const existingConfig = services[existingIndex];
    const updatedConfig: RunSingle = {
      ...existingConfig,
      ...runConfig,
      ignore: existingConfig.ignore ?? runConfig.ignore,
    };
    if (!runConfig.localBuild) {
      delete updatedConfig.localBuild;
    }
    services[existingIndex] = updatedConfig;
  }
  config.set("run", services.length === 1 ? services[0] : services);
}
