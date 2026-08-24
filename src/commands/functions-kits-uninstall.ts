import { requireConfig } from "../requireConfig";
import { Command } from "../command";
import { Config } from "../config";
import { listKitConfigs } from "../functions/kits/config";
import { Options } from "../options";
import { join } from "path";
import { ValidatedKitSingle } from "../functions/projectConfig";
import { FirebaseError } from "../error";
import { confirm, checkbox, Choice } from "../prompt";
import { reduceFlat } from "../functional";
import { dirname } from "path/posix";
import { Context } from "../deploy/functions/args";
import * as backend from "../deploy/functions/backend";
import * as planner from "../deploy/functions/release/planner";
import * as executor from "../deploy/functions/release/executor";
import * as fabricator from "../deploy/functions/release/fabricator";
import { EndpointFilter, getFunctionLabel } from "../deploy/functions/functionsDeployHelper";
import * as functionsConfig from "../functionsConfig";
import { getProjectNumber } from "../getProjectNumber";
import * as reporter from "../deploy/functions/release/reporter";
import { logger } from "../logger";

export const command = new Command("functions:kits:uninstall")
  .description("uninstall a function kit or kit instance from your project")
  .before(requireConfig)
  .option("--kit <kitId>", "")
  .option("--instance <instanceId>", "")
  .action(async (options: Options): Promise<void> => {
    const firebaseConfig = options.config;
    if (typeof options.instance === "string") {
      await handleInstance(options, firebaseConfig);
    }
    if (typeof options.kit === "string") {
      await handleKit(options, firebaseConfig);
    }
  });

async function handleKit(options: Options, config: Config) {
  const kitId = options.kit as string;
  const kits = listKitConfigs(config.src);

  for (const kitConfig of kits) {
    if (kitConfig.kit === kitId) {
      if (Object.keys(kitConfig.instances).length > 0) {
        if (
          !(await confirm({
            message: `There are active instances in the kit (${Object.keys(kitConfig.instances).join(", ")}). Confirm full uninstall? (y/N)`,
            default: false,
            nonInteractive: options.nonInteractive,
          }))
        ) {
          return;
        }
      }
      await uninstallKit(options, config, kitConfig);
      return;
    }
  }
  throw new FirebaseError(
    `Kit ${kitId} not found in firebase.json. Use functions:kits:list to get all existing kit IDs.`,
  );
}

async function handleInstance(options: Options, config: Config) {
  const instanceId = options.instance as string;
  const kits = listKitConfigs(config.src);

  let instanceConfigDirPath = "";
  let kitForInstance: ValidatedKitSingle;
  for (const kitConfig of kits) {
    if (kitConfig.instances[instanceId]) {
      kitForInstance = kitConfig;
      instanceConfigDirPath = kitConfig.instances[instanceId];
      break;
    }
  }
  if (instanceConfigDirPath === "") {
    throw new FirebaseError(`Instance ID ${instanceId} not found in firebase.json`);
  }
  kitForInstance = kitForInstance!;

  const projectsWithConfigs: string[] = [];
  const configDirContents = config.lsProjectDir(instanceConfigDirPath);
  const fileNames = configDirContents.filter((f) => f.isFile()).map((f) => f.name);
  for (const fileName of fileNames) {
    if (!fileName.startsWith(".env.")) {
      continue;
    }
    projectsWithConfigs.push(fileName.replace(new RegExp("^.env."), ""));
  }

  let projectsToRemove: string[] = [];
  if (projectsWithConfigs.length === 0) {
    throw new FirebaseError(
      `Instance at ${instanceConfigDirPath} has no projects with defined environments`,
    );
  }
  if (projectsWithConfigs.length === 1) {
    projectsToRemove = projectsWithConfigs;
  } else {
    projectsToRemove = await checkbox<string>({
      message: `Instance has multiple project-specific environments defined. Please select the ones to delete:`,
      choices: projectsWithConfigs.map((projectId): Choice<string> => {
        return {
          checked: false,
          name: projectId,
          value: projectId,
        };
      }),
    });
  }

  if (projectsToRemove.length === 0) {
    return;
  }
  if (projectsToRemove.length === projectsWithConfigs.length) {
    if (Object.keys(kitForInstance.instances).length > 1) {
      await uninstallInstance(options, config, instanceId, instanceConfigDirPath);
      return;
    }
    const confirmMsg =
      projectsToRemove.length === 1
        ? `This is the last remaining instance for kit ${kitForInstance.kit}. This will delete all source and configuration code. Proceed? (y/N)`
        : `These are all remaining instances for kit ${kitForInstance.kit}. This will delete all source and configuration code. Proceed? (y/N)`;
    if (
      !(await confirm({
        message: confirmMsg,
        default: false,
        nonInteractive: options.nonInteractive,
      }))
    ) {
      return;
    }
    await uninstallKit(options, config, kitForInstance);
    return;
  }
  for (const projectToRemove of projectsToRemove) {
    await uninstallProjectInstance(
      options,
      config,
      projectToRemove,
      instanceId,
      instanceConfigDirPath,
    );
  }
}

/*
 * For each .env.<projectId> file present in a Kit instance config folder, destroy the
 * Function (project = input, region = env.FIREBASE_FUNCTION_KIT_REGION, id = kitInstanceId)
 * if present, then remove the instance config directory and scrub it from firebase.json
 *
 * @param configPath: project replative function-kits/<kitId>/config-<instanceId>
 * @param instanceId: must be specified, since configPath is user-overridable
 */
async function uninstallInstance(
  options: Options,
  config: Config,
  instanceId: string,
  kitInstancePath: string,
): Promise<void> {
  const configDirContents = config.lsProjectDir(kitInstancePath);
  const fileNames = configDirContents.filter((f) => f.isFile()).map((f) => f.name);
  for (const fileName of fileNames) {
    if (!fileName.startsWith(".env.")) {
      continue;
    }
    const projectId = fileName.replace(new RegExp("^.env."), "");
    await uninstallProjectInstance(options, config, projectId, instanceId, kitInstancePath);
  }
  config.deleteProjectDir(kitInstancePath);
  // remove a functions.instances record with the id from firebase.json; kit instance IDs are unique
  let functionsConfig = config.src.functions!;
  if (!Array.isArray(functionsConfig)) {
    functionsConfig = [functionsConfig];
  }
  for (const stanza of functionsConfig) {
    if (typeof stanza.kit === "undefined") {
      continue;
    }
    const instances = (stanza.instances as Record<string, string>) ?? {};
    for (const configInstanceId of Object.keys(instances)) {
      if (configInstanceId === instanceId) {
        delete stanza.instances[instanceId];
      }
    }
  }
  config.set("functions", functionsConfig);
  config.writeProjectFile("firebase.json", config.src);
}

/*
 * Remove the .env.<projectId> file and deployed Function for a specific project instance

 * @param configPath: project-relative function-kits/<kitId>/config-<instanceId>
 * @param projectId: must be specified, since configPath is user-overridable
 * @param instanceId: must be specified, since configPath is user-overridable
 */
async function uninstallProjectInstance(
  options: Options,
  config: Config,
  projectId: string,
  instanceId: string,
  kitInstancePath: string,
): Promise<void> {
  const envFilePath = join(kitInstancePath, `.env.${projectId}`);
  const context: Context = {
    projectId: projectId,
    filters: [{ codebase: instanceId } as EndpointFilter],
  };
  const haveBackend = await backend.existingBackend(context);
  const plan = await planner.createDeploymentPlan({
    wantBackend: backend.empty(),
    haveBackend: haveBackend,
    codebase: "",
    projectId: context.projectId,
    filters: context.filters,
    deleteAll: true,
  });
  const allEpToDelete = Object.values(plan.regionalChangesets)
    .map((changes) => changes.endpointsToDelete)
    .reduce(reduceFlat, [])
    .sort(backend.compareFunctions);
  if (allEpToDelete.length > 0) {
    const deleteList = allEpToDelete.map((func) => `\t${getFunctionLabel(func)}`).join("\n");
    const confirmDeletion = await confirm({
      message:
        "You are about to delete the following Cloud Functions:\n" +
        deleteList +
        "\n  Are you sure?",
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!confirmDeletion) {
      throw new FirebaseError("Command aborted.");
    }

    const functionExecutor: executor.QueueExecutor = new executor.QueueExecutor({
      retries: 30,
      backoff: 20000,
      concurrency: 40,
      maxBackoff: 40000,
    });
    const appEngineLocation = functionsConfig.getAppEngineLocation(config);
    try {
      const fab = new fabricator.Fabricator({
        functionExecutor,
        runFunctionExecutor: functionExecutor,
        appEngineLocation,
        executor: new executor.QueueExecutor({}),
        sources: {},
        projectNumber: await getProjectNumber({ projectId: context.projectId }),
        projectId: context.projectId,
      });
      const summary = await fab.applyPlan({ default: plan });

      await reporter.logAndTrackDeployStats(summary);
      reporter.printErrors(summary);
    } catch (err: unknown) {
      throw new FirebaseError("Failed to delete functions", {
        original: err as Error,
        exit: 1,
      });
    }
  } else {
    logger.info(
      `No deployed functions found for instance ${instanceId}. This is normal if firebase deploy was never run.`,
    );
  }
  config.deleteProjectFile(envFilePath);
}

/*
 * Remove a Kit, all of its deployed Functions, all of its source and configuration,
 * and its stanza from firebase.json.
 *
 * @param kit: a parsed ValidatedKitSingle from firebase.json
 */
async function uninstallKit(
  options: Options,
  config: Config,
  kit: ValidatedKitSingle,
): Promise<void> {
  // sanity check: all instances and the source directory share the same parent,
  // otherwise we could be very sad when we rm -rf it
  const kitRootDirs = [dirname(kit.source), ...Object.values(kit.instances).map((p) => dirname(p))];
  if (!kitRootDirs.every((p) => p === kitRootDirs[0])) {
    throw new FirebaseError(
      `aborting kit uninstall: couldn't infer one kit root directory (${[...new Set(kitRootDirs)].join(", ")} in firebase.json)`,
    );
  }
  for (const [instanceId, instanceConfigDir] of Object.entries(kit.instances)) {
    await uninstallInstance(options, config, instanceId, instanceConfigDir);
  }
  config.deleteProjectDir(kitRootDirs[0]);
  // remove the top-level record from the functions stanza of firebase.json
  let functionsConfig = config.get("functions", []);
  if (!Array.isArray(functionsConfig)) {
    functionsConfig = [functionsConfig];
  }
  functionsConfig = functionsConfig.filter((fc: any) => fc.kit !== kit.kit);
  config.set("functions", functionsConfig);
  config.writeProjectFile("firebase.json", config.src);
}
