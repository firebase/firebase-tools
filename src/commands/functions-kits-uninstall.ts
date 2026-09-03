import { requireConfig } from "../requireConfig";
import { requireAuth } from "../requireAuth";
import { Command } from "../command";
import { Config } from "../config";
import { listKitConfigs } from "../functions/kits/config";
import { Options } from "../options";
import { join } from "path";
import { ValidatedKitSingle } from "../functions/projectConfig";
import { FirebaseError } from "../error";
import { confirm } from "../prompt";
import { dirname } from "path/posix";
import { FunctionConfig } from "../firebaseConfig";
import { needProjectId } from "../projectUtils";
import { logLabeledWarning } from "../utils";
import { EndpointFilter } from "../deploy/functions/functionsDeployHelper";
import { logger } from "../logger";
import { deleteFunctionsByEndpointFilters } from "../deploy/functions/delete";
import { Context } from "../deploy/functions/args";

export const command = new Command("functions:kits:uninstall")
  .description("uninstall a function kit or kit instance from your project")
  .before(requireConfig)
  .before(requireAuth)
  .option("--kit <kitId>", "")
  .option("--instance <instanceId>", "")
  .action(async (options: Options): Promise<void> => {
    const firebaseConfig = options.config;
    if (options.instance && options.kit) {
      throw new FirebaseError("Cannot specify both --kit and --instance. Please specify only one.");
    }
    if (!options.instance && !options.kit) {
      throw new FirebaseError("Must specify either --kit or --instance.");
    }
    if (typeof options.instance === "string") {
      await handleInstance(options, firebaseConfig);
    }
    if (typeof options.kit === "string") {
      await handleKit(options, firebaseConfig);
    }
  });

async function handleKit(options: Options, config: Config): Promise<void> {
  const kitId = options.kit as string;
  const kits = listKitConfigs(config.src);
  const kitConfig = kits.find((k) => k.kit === kitId);
  if (!kitConfig) {
    throw new FirebaseError(
      `Kit ${kitId} not found in firebase.json. Use functions:kits:list to get all existing kit IDs.`,
    );
  }
  const conservativeDeletion = nonstandardKitLayout(kitConfig);
  logger.debug(`Kit ${kitConfig.kit} uninstall mode: conservativeDeletion=${conservativeDeletion}`);
  if (Object.keys(kitConfig.instances).length > 0) {
    const willBlindDeleteMsg = conservativeDeletion
      ? ""
      : " and permanently remove their source code and configuration";
    if (
      !(await confirm({
        message: `Uninstall will delete all active instances of this kit${willBlindDeleteMsg}. You have the following active instances that will be deleted:
${Object.keys(kitConfig.instances).join(",")}
Do you want to continue with uninstall (y/N)?`,
        default: false,
        nonInteractive: options.nonInteractive,
        force: options.force,
      }))
    ) {
      return;
    }
  }
  await uninstallKit(options, config, kitConfig);
  return;
}

async function handleInstance(options: Options, config: Config): Promise<void> {
  const instanceId = options.instance as string;
  const projectId = needProjectId(options);
  const kits = listKitConfigs(config.src);
  const kitForInstance = kits.find((k) => instanceId in k.instances);
  if (typeof kitForInstance === "undefined") {
    throw new FirebaseError(`Instance ID ${instanceId} not found in firebase.json`);
  }
  const instanceConfigDirPath = kitForInstance.instances[instanceId];
  const conservativeDeletion = nonstandardKitLayout(kitForInstance);
  logger.debug(
    `Kit ${kitForInstance.kit} uninstall mode: conservativeDeletion=${conservativeDeletion}`,
  );

  const projectsWithConfigs: string[] = [];
  const configDirContents = config.lsProjectDir(instanceConfigDirPath);
  const fileNames = configDirContents.filter((f) => f.isFile()).map((f) => f.name);
  for (const fileName of fileNames) {
    if (!fileName.startsWith(".env.")) {
      continue;
    }
    projectsWithConfigs.push(fileName.slice(".env.".length));
  }

  // Cases:
  // - error if instance config dir contains projects but doesn't contain current project
  //   (if instance config dir contains no projects, deploy never happened and it's okay to go straight to teardown)
  // - current project is only project for only instance, so prompt and trigger kit teardown
  // - current project is only project for an instance, so just tear down the instance
  // - only remove .env and function

  if (projectsWithConfigs.length > 0 && !projectsWithConfigs.includes(projectId)) {
    throw new FirebaseError(
      `Instance at ${instanceConfigDirPath} contains no .env file for current project`,
    );
  }
  if (projectsWithConfigs.length === 0 || projectsWithConfigs.length === 1) {
    if (Object.keys(kitForInstance.instances).length > 1) {
      await uninstallInstance(
        options,
        config,
        instanceId,
        instanceConfigDirPath,
        conservativeDeletion,
      );
      return;
    }
    const confirmMsg = `This is the last remaining instance for kit ${kitForInstance.kit}. This will delete all source and configuration code. Proceed? (y/N)`;
    if (
      !(await confirm({
        message: confirmMsg,
        default: false,
        nonInteractive: options.nonInteractive,
        force: options.force,
      }))
    ) {
      return;
    }
    await uninstallKit(options, config, kitForInstance);
    return;
  }
  await uninstallProjectInstance(options, config, projectId, instanceId, instanceConfigDirPath);
}

/*
 * For each .env.<projectId> file present in a Kit instance config folder, call
 * uninstallProjectInstance() helper to tear down the .env file and Functions
 * resources, then remove the instance itself from firebase.json.
 *
 * @param instanceId: must be specified, since configPath is user-overridable
 * @param instanceConfigDirPath: project relative function-kits/<kitId>/config-<instanceId>
 * @param onlyDeleteEmpty: delete the instance config folder only if it's empty after .env deletions
 */
async function uninstallInstance(
  options: Options,
  config: Config,
  instanceId: string,
  instanceConfigDirPath: string,
  onlyDeleteEmpty: boolean,
): Promise<void> {
  const configDirContents = config.lsProjectDir(instanceConfigDirPath);
  const fileNames = configDirContents.filter((f) => f.isFile()).map((f) => f.name);
  for (const fileName of fileNames) {
    if (!fileName.startsWith(".env.")) {
      continue;
    }
    const projectId = fileName.replace(new RegExp("^.env."), "");
    await uninstallProjectInstance(options, config, projectId, instanceId, instanceConfigDirPath);
  }
  if (!onlyDeleteEmpty || configDirEmpty(config, instanceConfigDirPath)) {
    config.deleteProjectDir(instanceConfigDirPath);
  }
  // remove a functions.instances record with the id from firebase.json; kit instance IDs are unique
  let functionsConfig = config.src.functions ?? [];
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
  const epFilters: EndpointFilter[] = [{ codebase: instanceId }];
  const deployContext: Context = { projectId: projectId, filters: epFilters };
  const deletionCount = await deleteFunctionsByEndpointFilters(deployContext, options);
  if (deletionCount === 0) {
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
  const conservativeDeletion = nonstandardKitLayout(kit);
  // instance and .env teardowns
  for (const [instanceId, instanceConfigDir] of Object.entries(kit.instances)) {
    await uninstallInstance(options, config, instanceId, instanceConfigDir, conservativeDeletion);
  }

  // filesystem deletions:
  // conservative mode (directory kits, edited json): delete only config dir if empty and common parent to all instances
  // standard mode (package source installs w/ unedited config): delete entire kit dir
  if (conservativeDeletion) {
    const instanceConfigDirParents = Object.values(kit.instances).map((p) => dirname(p));
    if (
      instanceConfigDirParents.length > 0 &&
      instanceConfigDirParents.every((p) => p === instanceConfigDirParents[0]) &&
      configDirEmpty(config, instanceConfigDirParents[0])
    ) {
      config.deleteProjectDir(instanceConfigDirParents[0]);
    }
  } else {
    // sanity check: all instances and the source directory share the same parent
    const kitRootDirs = [
      dirname(kit.source),
      ...Object.values(kit.instances).map((p) => dirname(p)),
    ];
    if (!kitRootDirs.every((p) => p === kitRootDirs[0])) {
      throw new FirebaseError(
        `aborting kit uninstall: couldn't infer one kit root directory (${[...new Set(kitRootDirs)].join(", ")} in firebase.json)`,
      );
    }
    config.deleteProjectDir(kitRootDirs[0]);
  }

  // firebase.json removal
  let functionsConfig = config.src.functions ?? [];
  if (!Array.isArray(functionsConfig)) {
    functionsConfig = [functionsConfig];
  }
  functionsConfig = functionsConfig.filter((fc: FunctionConfig) => fc.kit !== kit.kit);
  config.set("functions", functionsConfig);
  config.writeProjectFile("firebase.json", config.src);
}

// Returns true if a kit lacks a sourcePackage or has its instance configs or source dir in a location other than what the CLI would have generated.
// If this is the case, blind deletions of directories associate with this kit could delete things the user did not intend to.
function nonstandardKitLayout(kitConfig: ValidatedKitSingle): boolean {
  if (kitConfig.sourcePackage) {
    if (kitConfig.source !== `function-kits/${kitConfig.kit}/source`) {
      return true;
    }
    for (const [instanceId, instanceConfigDirPath] of Object.entries(kitConfig.instances)) {
      if (instanceConfigDirPath !== `function-kits/${kitConfig.kit}/config-${instanceId}`) {
        return true;
      }
    }
    return false;
  }
  return true;
}

function configDirEmpty(config: Config, projectRelativePath: string): boolean {
  const contents = config.lsProjectDir(projectRelativePath).map((dirent) => dirent.name);
  if (contents.length > 0) {
    const digest =
      contents.length > 5
        ? `${contents.slice(0, 5).join(",")}, ...${contents.length - 5} more`
        : contents.join(",");
    logLabeledWarning(
      "functions",
      `Kits instance config directory ${projectRelativePath} still contains files (${digest}); not deleting automatically`,
    );
    return false;
  }
  return true;
}
