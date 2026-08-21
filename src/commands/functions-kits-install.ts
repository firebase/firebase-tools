import * as clc from "colorette";

import { Command } from "../command";
import { FirebaseError, getErrMsg } from "../error";
import { getProjectId } from "../projectUtils";
import { logLabeledBullet, logLabeledSuccess, logLabeledWarning } from "../utils";

import {
  addKitPrefix,
  isKitConfig,
  validateKit,
  validateKitInstanceId,
  ValidatedKitSingle,
} from "../functions/projectConfig";
import * as experiments from "../experiments";
import { logger } from "../logger";
import { Options } from "../options";
import { confirm, input, select } from "../prompt";
import * as build from "../deploy/functions/build";
import * as iam from "../gcp/iam";
import * as self from "./functions-kits-install";
import {
  DEFAULT_TEMPLATE,
  ExistingFunctionsInfo,
  TEMPLATES,
  TemplateType,
  addInstanceToKit,
  addKitToConfig,
  buildAndInstallKit,
  checkPackageHasShrinkwrap,
  extractExistingFunctionsInfo,
  generateUniqueId,
  isKitConfiguredForProject,
  isThirdPartyPackage,
  parseNpmPackageSpecifier,
  sanitizePackageNameToKitName,
  scaffoldKitFiles,
  validateNpmPackageName,
} from "../functions/kits/install";

import * as kitsInstallCore from "../functions/kits/install";

export {
  FUNCTION_KITS_DIR,
  TEMPLATES,
  TemplateType,
  DEFAULT_TEMPLATE,
  ExistingFunctionsInfo,
  ScaffoldedKitPaths,
  ScaffoldKitOptions,
  AddKitInstanceOptions,
  AddKitInstanceResult,
  generateUniqueId,
  parseNpmPackageSpecifier,
  validateNpmPackageName,
  sanitizePackageNameToKitName,
  isThirdPartyPackage,
  checkPackageHasShrinkwrap,
  isKitConfiguredForProject,
  extractExistingFunctionsInfo,
  writeKitPackageJson,
  writeKitIndexTs,
  scaffoldKitFiles,
  buildAndInstallKit,
  addKitToConfig,
  addInstanceToKitConfig,
  scaffoldKit,
  addInstanceToKit,
} from "../functions/kits/install";
export {
  KitEnvValue,
  KitInstanceEnvSeed,
  SeedKitEnvOptions,
  seedKitInstanceEnv,
} from "../functions/kits/env";

/**
 * Discovers the build manifest from the compiled kit source directory.
 */
export async function discoverKitBuild(
  options: FunctionsKitsInstallOptions,
  absSourcePath: string,
): Promise<build.Build> {
  return kitsInstallCore.discoverKitBuild(options, absSourcePath);
}

export interface FunctionsKitsInstallOptions extends Options {
  npm_package?: string;
  template?: string;
}

/**
 * Prompts the user for a kit instance ID with validation against collision with existing instance IDs and codebase names.
 */
export async function promptKitInstanceId(
  baseKitId: string,
  existingInstanceIds: Set<string>,
  existingCodebases: Set<string>,
  nonInteractive?: boolean,
): Promise<string> {
  const instanceCollisions = new Set([...existingInstanceIds, ...existingCodebases]);
  const defaultInstanceId = generateUniqueId(baseKitId, instanceCollisions);

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
      if (existingInstanceIds.has(val)) {
        return `functions kit instance ID must be unique across all kits, but '${val}' was used more than once.`;
      }
      if (existingCodebases.has(val)) {
        return `functions codebase name and kit instance ID must be mutually exclusive, but '${val}' was used as both a codebase name and a kit instance ID.`;
      }
      return true;
    },
  });

  validateKitInstanceId(instanceId);
  if (existingInstanceIds.has(instanceId)) {
    throw new FirebaseError(
      `functions kit instance ID must be unique across all kits, but '${instanceId}' was used more than once.`,
    );
  }
  if (existingCodebases.has(instanceId)) {
    throw new FirebaseError(
      `functions codebase name and kit instance ID must be mutually exclusive, but '${instanceId}' was used as both a codebase name and a kit instance ID.`,
    );
  }

  return instanceId;
}

/**
 * Prompts the user for a kit ID with validation against existing kit IDs.
 */
export async function promptKitId(
  packageName: string,
  existingKitIds: Set<string>,
  nonInteractive?: boolean,
): Promise<string> {
  const baseKitId = sanitizePackageNameToKitName(packageName);
  const defaultKitId = generateUniqueId(baseKitId, existingKitIds);

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
      if (existingKitIds.has(val)) {
        return `functions.kit must be unique but '${val}' was used more than once.`;
      }
      return true;
    },
  });

  validateKit(kitId);
  if (existingKitIds.has(kitId)) {
    throw new FirebaseError(`functions.kit must be unique but '${kitId}' was used more than once.`);
  }

  return kitId;
}

/**
 * Warns about third-party packages or missing shrinkwrap, and prompts for user confirmation before installation.
 */
export async function promptSecurityConfirmation(
  rawPkgName: string,
  packageName: string,
  nonInteractive?: boolean,
): Promise<boolean> {
  const isThirdParty = isThirdPartyPackage(packageName);
  if (isThirdParty) {
    logLabeledWarning(
      "functions",
      `Package ${clc.bold(packageName)} is a third-party kit (outside the @firebase-functions-kits scope).`,
    );
  }

  const hasShrinkwrap = await checkPackageHasShrinkwrap(rawPkgName);
  if (!hasShrinkwrap) {
    logLabeledWarning(
      "functions",
      `Package ${clc.bold(packageName)} does not have an npm-shrinkwrap.json file. npm-shrinkwrap guarantees that you deploy the same version of dependencies that the publisher tested against. Since this kit does not have an npm-shrinkwrap, it is possible that deploys or updates may introduce bugs or vulnerabilities in newer dependency versions that the publisher did not test against.`,
    );
  }

  if (isThirdParty || !hasShrinkwrap) {
    let confirmMessage: string;
    if (isThirdParty && !hasShrinkwrap) {
      confirmMessage = `Are you sure you want to install the third-party kit ${packageName} without locked dependencies?`;
    } else if (isThirdParty) {
      confirmMessage = `Are you sure you want to install the third-party kit ${packageName}?`;
    } else {
      confirmMessage = `Are you sure you want to install ${packageName} without locked dependencies?`;
    }
    const confirmInstallation = await confirm({
      message: confirmMessage,
      default: false,
      nonInteractive,
    });
    if (!confirmInstallation) {
      throw new FirebaseError("Installation cancelled.");
    }
  }

  return isThirdParty;
}

/**
 * Adds a new instance to an existing kit in firebase.json.
 */
async function addInstanceToExistingKit(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
  existingFunctionsInfo: ExistingFunctionsInfo,
): Promise<void> {
  const instanceId = await promptKitInstanceId(
    existingKit.kit,
    existingFunctionsInfo.existingInstanceIds,
    existingFunctionsInfo.existingCodebases,
    options.nonInteractive,
  );

  await addInstanceToKit({
    config: options.config,
    kitId: existingKit.kit,
    instanceId,
  });

  logLabeledSuccess(
    "functions",
    `Function kit instance ${clc.bold(instanceId)} successfully added to kit ${clc.bold(existingKit.kit)}.`,
  );
  await self.printKitFirstDeployReport(
    options,
    instanceId,
    options.config.path(existingKit.source),
  );
}

/**
 * Guides the user on configuring an existing instance for the active project.
 */
export async function promptExistingInstanceForProject(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
): Promise<void> {
  const instanceIds: string[] = Object.keys(existingKit.instances);
  if (instanceIds.length === 0) {
    throw new FirebaseError(`Kit '${existingKit.kit}' has no instances configured.`);
  }

  let selectedInstanceId = "<instance-name>";
  if (instanceIds.length === 1) {
    selectedInstanceId = instanceIds[0];
  } else if (!options.nonInteractive) {
    selectedInstanceId = await select<string>({
      message: "Which instance would you like to configure for this project?",
      choices: instanceIds.map((id) => ({ name: id, value: id })),
    });
  }

  const targetProject = getProjectId(options) || options.project || "<project-name>";
  logLabeledBullet(
    "functions",
    `To create a new instance in this project, deploy the instance dedicated to this project using\n` +
      clc.bold(`firebase deploy --only functions:${selectedInstanceId} --project ${targetProject}`),
  );
}

/**
 * Handles installation when the kit package is already present in firebase.json.
 */
export async function addKitInstanceOrConfigureProject(
  options: FunctionsKitsInstallOptions,
  existingKit: ValidatedKitSingle,
  existingFunctionsInfo: ExistingFunctionsInfo,
): Promise<void> {
  const projectId = getProjectId(options);
  const projectAlias =
    options.rc?.hasProjects && options.project && options.rc.hasProjectAlias(options.project)
      ? options.project
      : undefined;
  const isConfiguredForProject = isKitConfiguredForProject(
    options.config,
    existingKit,
    projectId,
    projectAlias,
  );

  let action: "addInstance" | "addEnv";
  if (!isConfiguredForProject && !options.nonInteractive) {
    const existingInstances = Object.keys(existingKit.instances || {}).join(", ");
    action = await select<"addInstance" | "addEnv">({
      message: `The following instances already exist, but are not configured for this project: ${existingInstances}. What would you like to do?`,
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
      logLabeledBullet(
        "functions",
        `This package is already installed as kit ${existingKit.kit}, creating a new instance.`,
      );
    }
    action = "addInstance";
  }

  if (action === "addInstance") {
    await addInstanceToExistingKit(options, existingKit, existingFunctionsInfo);
    return;
  }

  if (action === "addEnv") {
    await promptExistingInstanceForProject(options, existingKit);
    return;
  }
}

/**
 * Discovers kit endpoints, required APIs, and required roles, and logs a formatted report.
 */
export async function printKitFirstDeployReport(
  options: FunctionsKitsInstallOptions,
  instanceId: string,
  absSourcePath: string,
): Promise<void> {
  let discoveredBuild: build.Build;
  const prefix = addKitPrefix(instanceId);
  try {
    discoveredBuild = await self.discoverKitBuild(options, absSourcePath);
    build.applyPrefix(discoveredBuild, prefix);
  } catch (err: unknown) {
    logger.debug(`Could not discover kit build for reporting: ${getErrMsg(err)}`);
    return;
  }

  const functions = Object.keys(discoveredBuild.endpoints).sort();
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
  printSection("At the first deploy, the following APIs will be enabled in your project:", apis);
  printSection(
    "At the first deploy, the following roles will be granted to the kit service account:",
    roles,
  );
}

export const command = new Command("functions:kits:install")
  .description("install a function kit into your project")
  .option("--npm_package <package>", "NPM package name or specifier to install as a function kit")
  .option(
    `--template [${Object.keys(TEMPLATES).join("|")}]`,
    "template to use for the kit index file",
    DEFAULT_TEMPLATE,
  )
  .action(async (options: FunctionsKitsInstallOptions): Promise<void> => {
    experiments.assertEnabled("kits", "install a function kit");

    if (!options.config) {
      throw new FirebaseError("Not in a Firebase project directory (firebase.json not found).");
    }

    const templateType = (options.template || DEFAULT_TEMPLATE) as TemplateType;
    if (!(templateType in TEMPLATES)) {
      const validTemplates = Object.keys(TEMPLATES)
        .map((t) => `'${t}'`)
        .join(" or ");
      throw new FirebaseError(
        `Invalid template '${templateType}'. Template must be ${validTemplates}.`,
      );
    }

    const rawPkgName = options.npm_package;
    if (!rawPkgName) {
      throw new FirebaseError("set the --npm_package option to a valid NPM package and try again.");
    }

    const { packageName, version } = parseNpmPackageSpecifier(rawPkgName);
    validateNpmPackageName(packageName);

    const existingFunctionsInfo = extractExistingFunctionsInfo(options.config.src.functions);
    const existingKit = existingFunctionsInfo.existingFunctions.find(
      (c): c is ValidatedKitSingle => isKitConfig(c) && c.sourcePackage?.name === packageName,
    );

    if (existingKit) {
      await addKitInstanceOrConfigureProject(options, existingKit, existingFunctionsInfo);
      return;
    }

    const isThirdParty = await promptSecurityConfirmation(
      rawPkgName,
      packageName,
      options.nonInteractive,
    );

    const kitId = await promptKitId(
      packageName,
      existingFunctionsInfo.existingKitIds,
      options.nonInteractive,
    );

    const instanceId = await promptKitInstanceId(
      kitId,
      existingFunctionsInfo.existingInstanceIds,
      existingFunctionsInfo.existingCodebases,
      options.nonInteractive,
    );

    const { sourcePath, configDirPath, absSourcePath } = await scaffoldKitFiles(
      options.config,
      kitId,
      instanceId,
      packageName,
      version,
      templateType,
    );

    await buildAndInstallKit(absSourcePath, isThirdParty);

    addKitToConfig(options.config, kitId, instanceId, packageName, sourcePath, configDirPath);

    logLabeledSuccess("functions", `Function kit ${clc.bold(kitId)} successfully installed.`);
    await self.printKitFirstDeployReport(options, instanceId, absSourcePath);
  });
