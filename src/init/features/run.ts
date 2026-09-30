import { existsSync } from "fs";
import * as path from "path";
import { Setup } from "..";
import { Config } from "../../config";
import { deploy } from "../../deploy";
import { prereqs, RUN_PERMISSIONS } from "../../deploy/run/prereqs";
import { getExistingService, mainContainer } from "../../deploy/run/util";
import { FirebaseError } from "../../error";
import { RunSingle } from "../../firebaseConfig";
import * as run from "../../gcp/run";
import * as runv2 from "../../gcp/runv2";
import { Options } from "../../options";
import { input, select } from "../../prompt";
import { requirePermissions } from "../../requirePermissions";
import { logBullet } from "../../utils";

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
    // Skip services that another product (e.g. Cloud Functions or App Hosting) manages.
    const services = (await runv2.listServices(projectId, /* functionsOnly= */ false)).filter(
      (s) => !s.labels?.[runv2.CLIENT_NAME_LABEL],
    );
    if (services.length) {
      existing = await select<runv2.Service>({
        message: "Which service would you like to update?",
        choices: services.map((s) => {
          const [, , , location, , id] = s.name.split("/");
          return { name: `${id} (${location})`, value: s };
        }),
      });
    } else {
      logBullet("No Cloud Run services to update. Creating a new service instead.");
    }
  }

  let serviceId: string;
  let region: string;
  if (existing) {
    [, , , region, , serviceId] = existing.name.split("/");
  } else {
    region = await select({
      message: "Which region should this service be deployed to?",
      choices: await run.listLocations(projectId),
      default: "us-central1",
    });
    serviceId = await input({
      message: "Please enter a unique ID for your service",
      validate: async (id) => {
        if (!/^[a-z]([-a-z0-9]{0,47}[a-z0-9])?$/.test(id)) {
          return "Use up to 49 lowercase letters, digits, and hyphens, starting with a letter and not ending with a hyphen.";
        }
        if (await getExistingService(projectId, region, id)) {
          return `A service named ${id} already exists in ${region}.`;
        }
        return true;
      },
    });
  }

  const localBuild = await select({
    message: "Would you like to build your app locally or remotely?",
    choices: [
      { name: "Build remotely on Cloud Build", value: false },
      { name: "Build locally", value: true },
    ],
    default: false,
  });
  const baseImage = await input({
    message: "Which base image should your app use? (e.g. nodejs20, nodejs22)",
    default:
      (existing ? mainContainer(existing.template)?.baseImageUri : "nodejs22") ||
      (localBuild ? "nodejs22" : undefined),
    validate: (img) => !localBuild || !!img.trim() || "Local builds require a base image.",
  });
  const rootDir = await input({
    message: "Specify your app's root directory relative to your firebase.json directory",
    default: "/",
    validate: (dir) => {
      const absPath = path.join(config.projectDir, dir);
      return (
        existsSync(absPath) ||
        `Directory ${absPath} does not exist. Please enter a valid directory.`
      );
    },
  });

  setup.featureInfo = {
    ...setup.featureInfo,
    run: { serviceId, region, baseImage, rootDir, ...(localBuild && { localBuild }) },
  };
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
      ignore: ["node_modules", ".git", "firebase-debug.log", "firebase-debug.*.log"],
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
 * about (e.g. localBuild or a custom ignore list) are kept. Exported for unit testing.
 */
export function upsertRunConfig(runConfig: RunSingle, config: Config): void {
  const services = [config.src.run || []].flat();
  const i = services.findIndex((c) => c.serviceId === runConfig.serviceId);
  if (i < 0) {
    services.push(runConfig);
  } else {
    const { rootDir, region, localBuild } = runConfig;
    services[i] = {
      ...runConfig,
      ...services[i],
      rootDir,
      region,
      ...(localBuild !== undefined && { localBuild }),
    };
  }
  config.set("run", services.length === 1 ? services[0] : services);
}
