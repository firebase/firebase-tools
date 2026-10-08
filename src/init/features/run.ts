import * as path from "path";
import { Setup } from "..";
import { Config } from "../../config";
import { prereqs, RUN_PERMISSIONS } from "../../deploy/run/prereqs";
import { getExistingService } from "../../deploy/run/util";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import { dirExistsSync } from "../../fsutils";
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

  // If firebase.json already has this service, its saved settings are the defaults.
  const savedEntry = findRunEntry(getRunEntries(config), serviceId, region);

  // A base image turns on automatic base image updates, which are off by default. So there's no
  // default base image, except that an existing service keeps its own.
  const rawBaseImage = await input({
    message: "Which base image should your app use, if any? (e.g. nodejs20, nodejs22)",
    default: existing?.template.containers?.[0]?.baseImageUri,
  });
  const baseImage = (rawBaseImage || "").trim();

  const rootDir = await promptRootDir(config.projectDir, savedEntry?.rootDir ?? "/");

  setup.featureInfo = { ...setup.featureInfo, run: { serviceId, region, baseImage, rootDir } };
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

async function promptRootDir(projectDir: string, defaultDir: string): Promise<string> {
  return input({
    message: "Specify your app's root directory relative to your firebase.json directory",
    default: defaultDir,
    validate: (dir: string) => {
      const absPath = path.join(projectDir, dir);
      if (!dirExistsSync(absPath)) {
        return `Directory ${absPath} does not exist. Please enter a valid directory.`;
      }
      return true;
    },
  });
}

/**
 * Adds the service to firebase.json. Init writes the file once every feature is set up, so a
 * failed init leaves it untouched.
 */
export async function actuate(setup: Setup, config: Config): Promise<void> {
  const info = setup.featureInfo?.run;
  if (!info) {
    return;
  }
  upsertRunConfig(
    {
      serviceId: info.serviceId,
      rootDir: info.rootDir,
      region: info.region,
    },
    config,
  );
}

/**
 * Adds a new service to firebase.json with the default ignore list. If the service is already
 * there (same service ID and region), only its rootDir changes; nothing else in the entry is added
 * or removed.
 * Exported for unit testing.
 */
export function upsertRunConfig(
  service: { serviceId: string; rootDir: string; region: string },
  config: Config,
): void {
  const entries = getRunEntries(config);

  const existing = findRunEntry(entries, service.serviceId, service.region);
  if (existing) {
    existing.rootDir = service.rootDir;
  } else {
    entries.push({ ...service, ignore: DEFAULT_IGNORE });
  }

  // Save a single service as an object, not a one-item list.
  config.set("run", entries.length === 1 ? entries[0] : entries);
}

/**
 * Returns the Cloud Run services in firebase.json as a list. "run" can be one service or a list.
 */
function getRunEntries(config: Config): RunSingle[] {
  return [config.src.run ?? []].flat();
}

/**
 * Finds a service's firebase.json entry. Cloud Run service IDs are only unique within a region,
 * so the region has to match too.
 */
function findRunEntry(
  entries: RunSingle[],
  serviceId: string,
  region: string,
): RunSingle | undefined {
  return entries.find((e) => e.serviceId === serviceId && e.region === region);
}
