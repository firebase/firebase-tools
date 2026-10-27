import * as crypto from "crypto";
import * as path from "path";
import * as clc from "colorette";
import * as fs from "fs-extra";

import { Config } from "../../config";
import { FirebaseError, getErrMsg } from "../../error";
import { KitFunctionConfig, FunctionsConfig, KitSourcePackage } from "../../firebaseConfig";
import { getProjectId } from "../../projectUtils";
import {
  cloneDeep,
  deepEqual,
  logLabeledBullet,
  logLabeledSuccess,
  logLabeledWarning,
} from "../../utils";
import {
  addKitPrefix,
  isKitConfig,
  normalizeAndValidate,
  validateKit,
  validateKitInstanceId,
  ValidatedKitSingle,
  ValidatedSingle,
} from "../projectConfig";
import { logger } from "../../logger";
import { input, select } from "../../prompt";
import type { ActiveRuntime } from "../../deploy/functions/runtimes/supported/types";
import * as runtimes from "../../deploy/functions/runtimes";
import * as build from "../../deploy/functions/build";
import * as params from "../../deploy/functions/params";
import * as experiments from "../../experiments";
import * as iam from "../../gcp/iam";
import * as functionsEnv from "../env";
import * as functionsConfig from "../../functionsConfig";
import { partitionUserEnvs } from "../../deploy/functions/prepare";
import { mapObject } from "../../functional";
import { FirebaseConfig } from "../../deploy/functions/args";
import { RC } from "../../rc";
import { KitInstanceEnvSeed, seedKitInstanceEnv } from "./env";
import { removeDirectoryIfEmpty } from "../../fsutils";
import { FUNCTION_KITS_DIR, KitSourceAdapter, resolveSourceAdapter, TemplateType } from "./sources";

export * from "./sources";

export interface ExistingFunctionsInfo {
  existingFunctions: ValidatedSingle[];
  existingKitIds: string[];
  existingCodebases: string[];
  existingInstanceIds: string[];
}

export interface AddKitInstanceOptions {
  config: Config;
  kitId: string;
  instanceId: string;
}

export interface AddKitInstanceResult {
  configDirPath: string;
  absConfigDirPath: string;
}

export interface InstallKitOrInstanceOptions {
  config: Config;
  package?: string;
  directory?: string;
  template?: TemplateType;
  kitId?: string;
  instanceId?: string;
  defaultInstanceId?: string;
  seedEnv?: KitInstanceEnvSeed;
  nonInteractive?: boolean;
  force?: boolean;
  configure?: boolean;
  project?: string;
  projectId?: string;
  rc?: RC;
}

export interface InstallKitOrInstanceResult {
  action: "installedKit" | "addedInstance" | "configuredEnv";
  kitId: string;
  instanceId?: string;
  sourcePath?: string;
  configDirPath?: string;
}

export interface GetUnconfiguredInstancesOptions {
  config: { path: (p: string) => string };
  kit: ValidatedKitSingle;
  projectId?: string;
  projectAlias?: string;
}

export interface PromptKitInstanceIdOptions {
  baseKitId: string;
  existingInstanceIds: string[];
  existingCodebases: string[];
  nonInteractive?: boolean;
  customInstanceId?: string;
}

export interface PromptKitIdOptions {
  baseKitId: string;
  existingKitIds: string[];
  nonInteractive?: boolean;
  customKitId?: string;
}

export interface PromptExistingInstanceOptions {
  existingKit: ValidatedKitSingle;
  unconfiguredInstanceIds: readonly string[];
  nonInteractive?: boolean;
  instanceId?: string;
}

export interface DiscoverKitBuildOptions {
  absSourcePath: string;
  config?: Config;
  project?: string;
  projectId?: string;
  instanceId?: string;
  runtime?: ActiveRuntime;
}

export interface PromptAndWriteKitParamsOptions {
  config: Config;
  projectId?: string;
  projectAlias?: string;
  absConfigDirPath: string;
  absSourcePath: string;
  instanceId: string;
  nonInteractive?: boolean;
  params?: params.Param[];
}

export interface PrintKitFirstDeployReportOptions {
  instanceId: string;
  absSourcePath: string;
  config?: Config;
  project?: string;
  projectId?: string;
  runtime?: ActiveRuntime;
  preDiscoveredBuild?: build.Build;
}

export interface EnsureKitOptions {
  config: Config;
  adapter: KitSourceAdapter;
  existingFunctionsInfo: ExistingFunctionsInfo;
  kitId?: string;
  nonInteractive?: boolean;
  createdPaths?: string[];
}

export interface EnsureKitResult {
  kit: ValidatedKitSingle;
  isNewKit: boolean;
}

export interface ResolveOrCreateInstanceOptions {
  config: Config;
  kit: ValidatedKitSingle;
  isNewKit: boolean;
  existingFunctionsInfo: ExistingFunctionsInfo;
  project?: string;
  projectId?: string;
  rc?: RC;
  instanceId?: string;
  defaultInstanceId?: string;
  nonInteractive?: boolean;
  createdPaths?: string[];
}

export interface ResolvedKitInstance {
  action: "installedKit" | "addedInstance" | "configuredEnv";
  instanceId: string;
  configDirPath: string;
  absConfigDirPath: string;
}

export interface ConfigureInstanceForProjectOptions {
  config: Config;
  kit: ValidatedKitSingle;
  instanceId: string;
  configDirPath: string;
  absConfigDirPath: string;
  action: "installedKit" | "addedInstance" | "configuredEnv";
  project?: string;
  projectId?: string;
  rc?: RC;
  configure?: boolean;
  nonInteractive?: boolean;
  seedEnv?: KitInstanceEnvSeed;
  createdPaths?: string[];
}

/**
 * Generates a unique identifier by appending a random 4-character hex suffix if a collision exists.
 * Ensures the candidate is truncated so the total length does not exceed 40 characters.
 */
export function generateUniqueId(baseId: string, existingIds: string[]): string {
  if (!existingIds.includes(baseId)) {
    return baseId;
  }
  const prefix = baseId.slice(0, 35);
  let candidate = "";
  do {
    const randomSuffix = crypto.randomBytes(2).toString("hex");
    candidate = `${prefix}-${randomSuffix}`;
  } while (existingIds.includes(candidate));
  return candidate;
}

/**
 * Returns the list of instance IDs in the kit that do not have a dotenv file for the specified project.
 */
export function getUnconfiguredInstancesForProject(
  options: GetUnconfiguredInstancesOptions,
): string[] {
  const { config, kit, projectId, projectAlias } = options;
  return Object.entries(kit.instances || {})
    .filter(
      ([, configDir]) =>
        !functionsEnv.hasProjectEnv(config.path(configDir), projectId, projectAlias),
    )
    .map(([instanceId]) => instanceId);
}

/**
 * Extracts and categorizes existing functions, kit IDs, instance IDs, and codebase names from configuration.
 */
export function extractExistingFunctionsInfo(
  configFunctions?: FunctionsConfig,
): ExistingFunctionsInfo {
  const existingFunctions: ValidatedSingle[] =
    configFunctions && (!Array.isArray(configFunctions) || configFunctions.length > 0)
      ? normalizeAndValidate(configFunctions)
      : [];

  const existingKitIds: string[] = [];
  const existingCodebases: string[] = [];
  const existingInstanceIds: string[] = [];

  for (const c of existingFunctions) {
    if (isKitConfig(c)) {
      if (c.kit) {
        existingKitIds.push(c.kit);
      }
      if (c.instances) {
        existingInstanceIds.push(...Object.keys(c.instances));
      }
    } else if (c.codebase) {
      existingCodebases.push(c.codebase);
    }
  }

  return {
    existingFunctions,
    existingKitIds,
    existingCodebases,
    existingInstanceIds,
  };
}

/**
 * Prompts the user for a kit instance ID with validation against collision with existing instance IDs and codebase names.
 */
export async function promptKitInstanceId(options: PromptKitInstanceIdOptions): Promise<string> {
  const { baseKitId, existingInstanceIds, existingCodebases, nonInteractive, customInstanceId } =
    options;
  const instanceCollisions = [...existingInstanceIds, ...existingCodebases];
  const defaultInstanceId = generateUniqueId(baseKitId, instanceCollisions);

  if (customInstanceId) {
    validateKitInstanceId(customInstanceId);
    if (existingInstanceIds.includes(customInstanceId)) {
      throw new FirebaseError(
        `functions kit instance ID must be unique across all kits, but '${customInstanceId}' was used more than once.`,
      );
    }
    if (existingCodebases.includes(customInstanceId)) {
      throw new FirebaseError(
        `functions codebase name and kit instance ID must be mutually exclusive, but '${customInstanceId}' was used as both a codebase name and a kit instance ID.`,
      );
    }
    return customInstanceId;
  }

  const instanceId = await input({
    message: "What would you like to name this instance?",
    default: defaultInstanceId,
    nonInteractive,
    validate: (val: string) => {
      try {
        validateKitInstanceId(val);
      } catch (err: unknown) {
        return getErrMsg(err);
      }
      if (existingInstanceIds.includes(val)) {
        return `functions kit instance ID must be unique across all kits, but '${val}' was used more than once.`;
      }
      if (existingCodebases.includes(val)) {
        return `functions codebase name and kit instance ID must be mutually exclusive, but '${val}' was used as both a codebase name and a kit instance ID.`;
      }
      return true;
    },
  });

  validateKitInstanceId(instanceId);
  if (existingInstanceIds.includes(instanceId)) {
    throw new FirebaseError(
      `functions kit instance ID must be unique across all kits, but '${instanceId}' was used more than once.`,
    );
  }
  if (existingCodebases.includes(instanceId)) {
    throw new FirebaseError(
      `functions codebase name and kit instance ID must be mutually exclusive, but '${instanceId}' was used as both a codebase name and a kit instance ID.`,
    );
  }

  return instanceId;
}

/**
 * Prompts the user for a kit ID with validation against existing kit IDs.
 */
export async function promptKitId(options: PromptKitIdOptions): Promise<string> {
  const { baseKitId, existingKitIds, nonInteractive, customKitId } = options;
  const defaultKitId = generateUniqueId(baseKitId || "kit", existingKitIds);

  if (customKitId) {
    validateKit(customKitId);
    if (existingKitIds.includes(customKitId)) {
      throw new FirebaseError(
        `functions.kit must be unique but '${customKitId}' was used more than once.`,
      );
    }
    return customKitId;
  }

  const kitId = await input({
    message: "What would you like to name this kit?",
    default: defaultKitId,
    nonInteractive,
    validate: (val: string) => {
      try {
        validateKit(val);
      } catch (err: unknown) {
        return getErrMsg(err);
      }
      if (existingKitIds.includes(val)) {
        return `functions.kit must be unique but '${val}' was used more than once.`;
      }
      return true;
    },
  });

  validateKit(kitId);
  if (existingKitIds.includes(kitId)) {
    throw new FirebaseError(`functions.kit must be unique but '${kitId}' was used more than once.`);
  }

  return kitId;
}

/**
 * Prompts the user to select an existing instance of the kit to configure for the project.
 * Restricts selection to instances that are not already configured for the project.
 */
export async function promptExistingInstanceForProject(
  options: PromptExistingInstanceOptions,
): Promise<string> {
  const allInstanceIds: string[] = Object.keys(options.existingKit.instances || {});
  if (allInstanceIds.length === 0) {
    throw new FirebaseError(`Kit '${options.existingKit.kit}' has no instances configured.`);
  }

  if (options.instanceId) {
    if (!allInstanceIds.includes(options.instanceId)) {
      throw new FirebaseError(
        `Instance '${options.instanceId}' does not exist in kit '${options.existingKit.kit}'. Available instances: ${allInstanceIds.join(", ")}`,
      );
    }
    if (!options.unconfiguredInstanceIds.includes(options.instanceId)) {
      throw new FirebaseError(
        `Instance '${options.instanceId}' is already configured for this project.`,
      );
    }
    return options.instanceId;
  }

  if (options.unconfiguredInstanceIds.length === 0) {
    throw new FirebaseError(
      `Kit '${options.existingKit.kit}' has no unconfigured instances for this project.`,
    );
  }

  if (options.unconfiguredInstanceIds.length === 1) {
    const instanceId = options.unconfiguredInstanceIds[0];
    logLabeledBullet(
      "functions",
      `${clc.bold(instanceId)} is the only instance without a configuration. Configuring...`,
    );
    return instanceId;
  }

  return select<string>({
    message: "Which instance would you like to configure for this project?",
    choices: options.unconfiguredInstanceIds,
    nonInteractive: options.nonInteractive,
  });
}

export interface AddKitToConfigOptions {
  config: Config;
  kitId: string;
  sourcePath: string;
  sourcePackage?: KitSourcePackage;
  predeploy?: string[];
  runtime?: ActiveRuntime;
}

/**
 * Appends the newly configured kit into the firebase.json configuration and saves the file.
 */
export function addKitToConfig(options: AddKitToConfigOptions): ValidatedKitSingle {
  const configSrc = options.config.src;
  const newKitConfig: KitFunctionConfig = {
    kit: options.kitId,
    ...(options.sourcePackage ? { sourcePackage: options.sourcePackage } : {}),
    source: options.sourcePath,
    instances: {},
    ...(options.runtime ? { runtime: options.runtime } : {}),
    ...(options.predeploy ? { predeploy: options.predeploy } : {}),
  };

  const functionsRaw = configSrc.functions as KitFunctionConfig | KitFunctionConfig[] | undefined;
  if (!functionsRaw) {
    configSrc.functions = [newKitConfig];
  } else if (Array.isArray(functionsRaw)) {
    functionsRaw.push(newKitConfig);
  } else {
    configSrc.functions = [functionsRaw, newKitConfig];
  }

  options.config.writeProjectFile("firebase.json", configSrc);
  return newKitConfig as ValidatedKitSingle;
}

/**
 * Finds a kit configuration entry in firebase.json (config.src.functions) by its kit ID.
 */
export function findKitConfig(config: Config, kitId: string): KitFunctionConfig | undefined {
  const functions = config.src.functions;
  if (!functions) {
    return undefined;
  }
  if (Array.isArray(functions)) {
    return functions.find(
      (f): f is KitFunctionConfig =>
        typeof f === "object" && f !== null && "kit" in f && f.kit === kitId,
    );
  }
  if (
    typeof functions === "object" &&
    "kit" in functions &&
    (functions as KitFunctionConfig).kit === kitId
  ) {
    return functions as KitFunctionConfig;
  }
  return undefined;
}

export interface AddInstanceToKitConfigOptions {
  config: Config;
  kitId: string;
  instanceId: string;
  configDirPath: string;
}

/**
 * Adds a new instance configuration to an existing kit in firebase.json and saves the file.
 */
export function addInstanceToKitConfig(options: AddInstanceToKitConfigOptions): void {
  const { config, kitId, instanceId, configDirPath } = options;
  const target = findKitConfig(config, kitId);
  if (!target) {
    throw new FirebaseError(`Kit '${kitId}' not found in firebase.json.`);
  }

  target.instances = target.instances || {};
  target.instances[instanceId] = configDirPath;
  config.writeProjectFile("firebase.json", config.src);
}

export interface RevertFunctionsConfigOptions {
  config: Config;
  originalFunctions: FunctionsConfig | undefined;
}

/**
 * Reverts the functions configuration in firebase.json to its original state if it was modified.
 */
export function revertFunctionsConfig(options: RevertFunctionsConfigOptions): void {
  try {
    if (!deepEqual(options.config.src.functions, options.originalFunctions)) {
      if (options.originalFunctions === undefined) {
        delete options.config.src.functions;
      } else {
        options.config.src.functions = options.originalFunctions;
      }
      options.config.writeProjectFile("firebase.json", options.config.src);
    }
  } catch (err: unknown) {
    logger.debug(`Failed to revert firebase.json: ${getErrMsg(err)}`);
  }
}

/**
 * Adds an instance to an existing kit, creates its configuration directory,
 * and updates firebase.json.
 */
export async function addInstanceToKit(
  options: AddKitInstanceOptions,
): Promise<AddKitInstanceResult> {
  const target = findKitConfig(options.config, options.kitId);
  if (!target) {
    throw new FirebaseError(`Kit '${options.kitId}' not found in firebase.json.`);
  }

  const configDirPath = path.join(FUNCTION_KITS_DIR, options.kitId, `config-${options.instanceId}`);
  const absConfigDirPath = options.config.path(configDirPath);

  await fs.ensureDir(absConfigDirPath);

  addInstanceToKitConfig({
    config: options.config,
    kitId: options.kitId,
    instanceId: options.instanceId,
    configDirPath,
  });

  return { configDirPath, absConfigDirPath };
}

/**
 * Discovers the build manifest from the compiled kit source directory.
 */
export async function discoverKitBuild(options: DiscoverKitBuildOptions): Promise<build.Build> {
  const projectId = getProjectId(options) || "";
  const delegateContext: runtimes.DelegateContext = {
    projectId,
    sourceDir: options.absSourcePath,
    projectDir: options.config?.projectDir || "",
    ...(options.runtime ? { runtime: options.runtime } : {}),
  };
  const runtimeDelegate = await runtimes.getRuntimeDelegate(delegateContext);
  const firebaseEnvs = functionsEnv.loadFirebaseEnvs({ projectId }, projectId, options.instanceId);
  return runtimeDelegate.discoverBuild({}, firebaseEnvs);
}

/**
 * Detects missing parameters from the kit instance's dotenv files, prompts the user to fill them in,
 * and writes the resolved values into the instance's .env.<projectId> file.
 */
export async function promptAndWriteKitParams(
  options: PromptAndWriteKitParamsOptions,
): Promise<void> {
  if (!options.params || options.params.length === 0) {
    return;
  }
  if (!options.projectId) {
    logger.debug("Skipping functions kit parameter prompt: no active project ID.");
    return;
  }

  const userEnvOpt: functionsEnv.UserEnvsOpts = {
    configDir: options.absConfigDirPath,
    functionsSource: options.absSourcePath,
    projectDir: options.config.projectDir,
    projectId: options.projectId,
    projectAlias: options.projectAlias,
  };

  const rawUserEnvs = functionsEnv.loadUserEnvs(userEnvOpt);
  const { userEnvs, secretRefs } = partitionUserEnvs(rawUserEnvs);

  const parsedSecretRefs = mapObject<string, build.ParsedSecretRef>(secretRefs, (unparsed) =>
    build.parseSecretRef(unparsed),
  );
  const secretPrefixForInstance = addKitPrefix(options.instanceId);
  for (const secretParam of options.params.filter((p) => params.isSecretParam(p))) {
    secretParam.resourceId = `${secretPrefixForInstance}-${secretParam.name}`;
  }
  build.applyEnvSecretBindingsToParams(options.params, parsedSecretRefs);

  let firebaseConfig: FirebaseConfig = { projectId: options.projectId };
  try {
    firebaseConfig = await functionsConfig.getFirebaseConfig({ projectId: options.projectId });
  } catch (err: unknown) {
    logger.debug(
      `Could not fetch Firebase config for project ${options.projectId}: ${getErrMsg(err)}`,
    );
  }

  const typedUserEnvs = build.envWithTypes(options.params, userEnvs);
  const { paramValues: resolvedEnvs, secretRefs: resolvedSecretRefs } = await params.resolveParams({
    params: options.params,
    firebaseConfig: firebaseConfig,
    userEnvs: typedUserEnvs,
    codebase: options.instanceId,
    nonInteractive: options.nonInteractive,
  });

  functionsEnv.writeResolvedParams(resolvedEnvs, userEnvs, userEnvOpt);
  if (
    experiments.isEnabled("secretEnvParams") &&
    experiments.isEnabled("writeDefaultSecretBindings")
  ) {
    functionsEnv.writeResolvedSecretRefs(resolvedSecretRefs, secretRefs, userEnvOpt);
  }
}

/**
 * Discovers kit endpoints, required APIs, and required roles, and logs a formatted report.
 */
export async function printKitFirstDeployReport(
  options: PrintKitFirstDeployReportOptions,
): Promise<void> {
  let discoveredBuild: build.Build;
  const prefix = addKitPrefix(options.instanceId);
  try {
    discoveredBuild = options.preDiscoveredBuild
      ? cloneDeep(options.preDiscoveredBuild)
      : await discoverKitBuild(options);
    build.applyEndpointPrefix(discoveredBuild, prefix);
  } catch (err: unknown) {
    logger.debug(`Could not discover kit build for reporting: ${getErrMsg(err)}`);
    return;
  }

  const formatScopedName = (name: string): string => {
    const fullPrefix = `${prefix}-`;
    if (name.startsWith(fullPrefix)) {
      return `${fullPrefix}${clc.bold(name.slice(fullPrefix.length))}`;
    }
    return clc.bold(name);
  };

  const functions = Object.keys(discoveredBuild.endpoints).sort().map(formatScopedName);
  const taskQueues = Object.entries(discoveredBuild.endpoints)
    .filter(([, endpoint]) => build.isTaskQueueTriggered(endpoint))
    .map(([id]) => id)
    .sort()
    .map(formatScopedName);
  const channelSet = new Set<string>();
  for (const endpoint of Object.values(discoveredBuild.endpoints)) {
    if (build.isEventTriggered(endpoint) && endpoint.eventTrigger?.channel) {
      channelSet.add(endpoint.eventTrigger.channel);
    }
  }
  const eventarcChannels = Array.from(channelSet).sort();
  const apis = (discoveredBuild.requiredAPIs || []).map((a) => a.api).sort();
  const rawRoles = discoveredBuild.requiredRoles || [];
  const roles = (await Promise.all(rawRoles.map((r) => iam.getRoleName(r)))).sort();

  const printSection = (heading: string, items: string[]): void => {
    if (items.length > 0) {
      logLabeledBullet("functions", `${heading}\n` + items.map((item) => `- ${item}`).join("\n"));
    }
  };

  printSection(
    "At the first deploy, the following functions will be created in your project:",
    functions,
  );
  printSection(
    "At the first deploy, the following Task Queues will be created in your project:",
    taskQueues,
  );
  printSection(
    "At the first deploy, the following Eventarc channels will be created in your project:",
    eventarcChannels,
  );
  printSection("At the first deploy, the following APIs will be enabled in your project:", apis);
  printSection(
    "At the first deploy, the following roles will be granted to the kit service account:",
    roles,
  );

  const hasItems =
    functions.length > 0 ||
    taskQueues.length > 0 ||
    eventarcChannels.length > 0 ||
    apis.length > 0 ||
    roles.length > 0;

  if (hasItems) {
    logLabeledWarning(
      "functions",
      `${clc.bold("Please review the changes above. If you do not want them applied to your project, uninstall this kit before running firebase deploy.")}`,
    );
  }
}

/**
 * Stage 1: Ensures the kit source exists and is registered in firebase.json.
 * If the kit is already registered, returns the existing kit configuration.
 * Otherwise validates the source, prompts for a kit ID, prepares/builds the source,
 * and adds the kit entry to firebase.json.
 */
export async function ensureKit(options: EnsureKitOptions): Promise<EnsureKitResult> {
  const { config, adapter, existingFunctionsInfo, createdPaths = [] } = options;
  const existingKit = adapter.findExistingKit(existingFunctionsInfo.existingFunctions);
  if (existingKit) {
    return { kit: existingKit, isNewKit: false };
  }

  await adapter.validateAndConfirm();

  const kitId = await promptKitId({
    baseKitId: adapter.defaultKitId,
    existingKitIds: existingFunctionsInfo.existingKitIds,
    nonInteractive: options.nonInteractive,
    customKitId: options.kitId,
  });

  const prepared = await adapter.prepareSource(kitId, createdPaths);
  const kit = addKitToConfig({
    config,
    kitId,
    sourcePath: prepared.sourcePath,
    sourcePackage: prepared.sourcePackage,
    predeploy: prepared.predeploy,
    runtime: prepared.runtime,
  });

  return { kit, isNewKit: true };
}

/**
 * Stage 2: Resolves an existing unconfigured instance or creates a new instance for the kit.
 * Packaging-system and directory-source agnostic.
 */
export async function resolveOrCreateInstance(
  options: ResolveOrCreateInstanceOptions,
): Promise<ResolvedKitInstance> {
  const { kit, isNewKit, existingFunctionsInfo, createdPaths = [] } = options;
  const projectId = getProjectId(options) || options.projectId;
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;

  let mode: "addInstance" | "addEnv";
  let unconfiguredInstances: string[] = [];

  if (isNewKit) {
    mode = "addInstance";
  } else {
    unconfiguredInstances = getUnconfiguredInstancesForProject({
      config: options.config,
      kit,
      projectId,
      projectAlias,
    });
    const isConfiguredForProject =
      Object.keys(kit.instances || {}).length > 0 && unconfiguredInstances.length === 0;

    if (
      options.instanceId &&
      kit.instances &&
      Object.prototype.hasOwnProperty.call(kit.instances, options.instanceId)
    ) {
      if (!unconfiguredInstances.includes(options.instanceId)) {
        throw new FirebaseError(
          `Instance '${options.instanceId}' is already configured for this project.`,
        );
      }
      mode = "addEnv";
    } else if (options.instanceId) {
      mode = "addInstance";
    } else if (unconfiguredInstances.length > 0 && !options.nonInteractive) {
      const unconfiguredInstancesList = unconfiguredInstances.join(", ");
      mode = await select<"addInstance" | "addEnv">({
        message: `The following instances already exist, but are not configured for this project: ${unconfiguredInstancesList}. What would you like to do?`,
        choices: [
          {
            name: "Add an instance to the existing kit",
            value: "addInstance",
          },
          {
            name: "Configure an existing instance for this project",
            value: "addEnv",
          },
        ],
      });
    } else {
      if (isConfiguredForProject) {
        const sourceLabel = kit.sourcePackage ? "package" : "directory";
        logLabeledBullet(
          "functions",
          `This ${sourceLabel} is already installed as kit ${kit.kit}, creating a new instance.`,
        );
      }
      mode = "addInstance";
    }
  }

  if (mode === "addInstance") {
    const instanceId = await promptKitInstanceId({
      baseKitId: options.defaultInstanceId ?? kit.kit,
      existingInstanceIds: existingFunctionsInfo.existingInstanceIds,
      existingCodebases: existingFunctionsInfo.existingCodebases,
      nonInteractive: options.nonInteractive,
      customInstanceId: options.instanceId,
    });

    const expectedConfigDirPath = path.join(FUNCTION_KITS_DIR, kit.kit, `config-${instanceId}`);
    const absConfigDirPath = options.config.path(expectedConfigDirPath);
    const absKitDir = options.config.path(path.join(FUNCTION_KITS_DIR, kit.kit));
    if (!createdPaths.includes(absKitDir)) {
      createdPaths.push(absConfigDirPath);
    }

    const result = await addInstanceToKit({
      config: options.config,
      kitId: kit.kit,
      instanceId,
    });

    return {
      action: isNewKit ? "installedKit" : "addedInstance",
      instanceId,
      configDirPath: result.configDirPath,
      absConfigDirPath: result.absConfigDirPath,
    };
  }

  const instanceId = await promptExistingInstanceForProject({
    ...options,
    existingKit: kit,
    unconfiguredInstanceIds: unconfiguredInstances,
  });
  const configDirPath = kit.instances?.[instanceId];
  if (!configDirPath) {
    throw new FirebaseError(
      `Configuration directory for instance '${instanceId}' not found in kit '${kit.kit}'.`,
    );
  }
  const absConfigDirPath = options.config.path(configDirPath);

  return {
    action: "configuredEnv",
    instanceId,
    configDirPath,
    absConfigDirPath,
  };
}

/**
 * Stage 3: Configures the resolved kit instance for the target Firebase project
 * (seeds .env.<projectId>, discovers build parameters, prompts for values, and prints deploy report).
 * Packaging-system and directory-source agnostic.
 */
export async function configureInstanceForProject(
  options: ConfigureInstanceForProjectOptions,
): Promise<void> {
  const { kit, instanceId, absConfigDirPath, action, createdPaths = [] } = options;
  const projectId = getProjectId(options) || options.projectId;
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;
  const absSourcePath = options.config.path(kit.source);

  if (projectId && action === "configuredEnv") {
    const envPath = path.join(absConfigDirPath, `.env.${projectId}`);
    if (!(await fs.pathExists(envPath))) {
      createdPaths.push(envPath);
    }
  }

  if (options.seedEnv?.envs && Object.keys(options.seedEnv.envs).length > 0) {
    await fs.ensureDir(absConfigDirPath);
    seedKitInstanceEnv({
      configDir: absConfigDirPath,
      functionsSource: absSourcePath,
      projectDir: options.config.projectDir,
      projectId: options.seedEnv.projectId,
      projectAlias: options.seedEnv.projectAlias,
      envs: options.seedEnv.envs,
    });
  }

  if (projectId) {
    fs.ensureFileSync(path.join(absConfigDirPath, `.env.${projectId}`));
  }

  let discoveredBuild: build.Build | undefined;
  const shouldConfigure = options.configure !== false;
  if (shouldConfigure) {
    try {
      discoveredBuild = await discoverKitBuild({
        ...options,
        absSourcePath,
        instanceId,
        runtime: kit.runtime,
      });
    } catch (err: unknown) {
      logger.debug(`Could not discover kit build for params prompting: ${getErrMsg(err)}`);
    }

    if (discoveredBuild?.params && discoveredBuild.params.length > 0) {
      await promptAndWriteKitParams({
        config: options.config,
        projectId,
        projectAlias,
        absConfigDirPath,
        absSourcePath,
        instanceId,
        nonInteractive: options.nonInteractive,
        params: discoveredBuild.params,
      });
    }
  }

  if (action === "installedKit") {
    logLabeledSuccess("functions", `Function kit ${clc.bold(kit.kit)} successfully installed.`);
  } else if (action === "addedInstance") {
    logLabeledSuccess(
      "functions",
      `Function kit instance ${clc.bold(instanceId)} successfully added to kit ${clc.bold(kit.kit)}.`,
    );
  } else if (action === "configuredEnv") {
    const projectDisplay = projectId || options.project || "project";
    logLabeledSuccess(
      "functions",
      `Function kit instance ${clc.bold(instanceId)} successfully configured for ${clc.bold(projectDisplay)}.`,
    );
  }

  await printKitFirstDeployReport({
    config: options.config,
    project: options.project,
    projectId: options.projectId,
    instanceId,
    absSourcePath,
    runtime: kit.runtime,
    preDiscoveredBuild: discoveredBuild,
  });
}

/**
 * Orchestrates the complete 3-stage kit installation flow:
 * 1. ensureKit: resolves an existing kit or installs/scaffolds a new kit source.
 * 2. resolveOrCreateInstance: creates a new instance or selects an unconfigured instance.
 * 3. configureInstanceForProject: seeds env, prompts for build params, and prints deploy preview.
 */
export async function installKitOrInstance(
  options: InstallKitOrInstanceOptions,
): Promise<InstallKitOrInstanceResult> {
  const adapter = resolveSourceAdapter(options);

  const originalFunctions = cloneDeep(options.config.src.functions);
  const createdPaths: string[] = [];
  let kitId: string | undefined;

  try {
    const existingFunctionsInfo = extractExistingFunctionsInfo(options.config.src.functions);

    const { kit, isNewKit } = await ensureKit({
      ...options,
      adapter,
      existingFunctionsInfo,
      createdPaths,
    });
    kitId = kit.kit;

    const { action, instanceId, configDirPath, absConfigDirPath } = await resolveOrCreateInstance({
      ...options,
      kit,
      isNewKit,
      existingFunctionsInfo,
      createdPaths,
    });

    await configureInstanceForProject({
      ...options,
      kit,
      instanceId,
      configDirPath,
      absConfigDirPath,
      action,
      createdPaths,
    });

    return {
      action,
      kitId: kit.kit,
      instanceId,
      sourcePath: kit.source,
      configDirPath,
    };
  } catch (err: unknown) {
    await Promise.all(
      createdPaths.map((targetPath) =>
        fs.remove(targetPath).catch((cleanupErr: unknown) => {
          logger.debug(`Failed to clean up path '${targetPath}': ${getErrMsg(cleanupErr)}`);
        }),
      ),
    );
    if (kitId) {
      await removeDirectoryIfEmpty(options.config.path(path.join(FUNCTION_KITS_DIR, kitId)));
    }
    await removeDirectoryIfEmpty(options.config.path(FUNCTION_KITS_DIR));
    revertFunctionsConfig({ config: options.config, originalFunctions });
    throw err;
  }
}
