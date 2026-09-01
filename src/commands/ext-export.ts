import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import * as planner from "../deploy/extensions/planner";
import { saveEtags } from "../extensions/etags";
import {
  displayExportInfo,
  parameterizeProject,
  setSecretParamsToLatest,
  functionsEnvFromInstance,
  ejectSecretsFromInstance,
  secretsNeedingEjection,
} from "../extensions/export";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import * as manifest from "../extensions/manifest";
import { buildBindingOptionsWithBaseValue } from "../extensions/paramHelper";
import { partition } from "../functional";
import { getProjectNumber } from "../getProjectNumber";
import { logger } from "../logger";
import { Options } from "../options";
import { needProjectId } from "../projectUtils";
import { confirm } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import { getInstance } from "../extensions/extensionsApi";
import { last, logLabeledBullet, logLabeledError, logLabeledWarning } from "../utils";
import { ExtensionInstance } from "../extensions/types";
import { writeUserEnvs, UserEnvsOpts, hasUserEnvs } from "../functions/env";
import { mkdirSync } from "fs";
import { resolve } from "path";
import { Config } from "../config";
import { normalizeAndValidate, isKitConfig } from "../functions/projectConfig";
import { FirebaseError } from "../error";
import * as experiments from "../experiments";

export const command = new Command("ext:export")
  .description("export Extension instances installed on a project to a local Firebase directory")
  .option(
    `--mode <target>`,
    `experimental: controls the target system of the export (supports "extensions", "functions")`,
  )
  .option(
    "--instance <instanceId>",
    "scope the export to the single instance with the specified instance id",
  )
  .option(
    "-k, --kit-instance <kitId>",
    "write the .env export from --mode functions to the config path for a kit instance currently defined in firebase.json",
  )
  .option(
    `--outputDir <path>`,
    `override the .env export from --mode functions to a specific arbitrary path`,
  )
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .withForce()
  .action(async (options: Options) => {
    if (experiments.isEnabled("extMigrationFeatures") && options.mode === "functions") {
      // Functions handler:
      // - writes to <instanceId>/.env-<projectId>
      // - does not parametrize project number and ID (e.g "12345678" instead of "{param:PROJECT_NUMBER}")
      // - explicitly sets unspecified user params to the empty string instead of leaving them out (and causing a prompt on first deploy)
      // - coerces system param naming format to be valid .env keys (e.g EXT_MIGRATED_SYSTEM_MEMORY=256 instead of firebaseextensions.v1beta.function/memory=256)
      // - writes references to secrets in the Functions format (e.g FIREBASE_SECRET_REF_API_KEY=foo:latest instead of API_KEY=projects/${param:PROJECT_NUMBER}/secrets/API_KEY/versions/latest)
      // - makes DeploymentInstanceSpec.eventarcChannel and allowedEventTypes available as FIREBASE_EVENTARC_CHANNEL and EXT_SELECTED_EVENTS
      await fnHandler(options);
    } else {
      // Extensions handler:
      // - does none of that
      await extHandler(options);
    }
  });

async function extHandler(options: Options): Promise<void> {
  const projectId = needProjectId(options);
  const projectNumber = await getProjectNumber(options);
  let have = await Promise.all(await planner.have(projectId));

  if (have.length === 0) {
    logger.info(`No extension instances installed on ${projectId}, so there is nothing to export.`);
    return;
  }
  if (options.instance) {
    have = have.filter((s) => s.instanceId === options.instance);
    if (have.length === 0) {
      logger.info(
        `No extension instances installed on ${projectId} match specified instance ID ${options.instance}.`,
      );
      return;
    }
  }

  // If an instance spec is missing a ref, that instance must have been installed from a local source.
  const [withRef, withoutRef] = partition(have, (s) => !!s.ref);
  // Look up the instances that already exist,
  // set any secrets to latest version,
  // and strip project IDs from the param values.
  // Note that this does not, nor should it include instances defined via SDK.
  const withRefSubbed = await Promise.all(
    withRef.map(async (i) => {
      const subbed = await setSecretParamsToLatest(i);
      return parameterizeProject(projectId, projectNumber, subbed);
    }),
  );
  displayExportInfo(withRefSubbed, withoutRef);

  if (
    !options.nonInteractive &&
    !options.force &&
    !(await confirm({
      message: "Do you wish to add these Extension instances to firebase.json?",
      default: true,
    }))
  ) {
    logger.info("Exiting. No changes made.");
    return;
  }

  const manifestSpecs = withRefSubbed.map((spec) => {
    const paramCopy = { ...spec.params, ...spec.systemParams };
    if (spec.eventarcChannel) {
      paramCopy.EVENTARC_CHANNEL = spec.eventarcChannel;
    }
    if (spec.allowedEventTypes) {
      paramCopy.ALLOWED_EVENT_TYPES = spec.allowedEventTypes.join(",");
    }
    return {
      instanceId: spec.instanceId,
      ref: spec.ref,
      params: buildBindingOptionsWithBaseValue(paramCopy),
    };
  });

  const existingConfig = manifest.loadConfig(options);
  await manifest.writeToManifest(
    manifestSpecs,
    existingConfig,
    {
      nonInteractive: options.nonInteractive,
      force: options.force,
    },
    true /** allowOverwrite */,
  );

  saveEtags(options.rc, projectId, have);
}

async function fnHandler(options: Options): Promise<void> {
  if (!options.instance) {
    logger.info(
      `ext:export must specify an --instance <instanceId> option when exporting to Functions. Use ext:list to find your instance IDs.`,
    );
    return;
  }
  const projectId = needProjectId(options);
  const instance = await getInstance(projectId, options.instance as string);
  if (typeof instance === "undefined") {
    logger.info(`No extension matching instance ID ${options.instance} found`);
    return;
  }
  if (instance.state !== "ACTIVE" && !options.force) {
    throw new FirebaseError(
      `Extension ${options.instance} is in state ${instance.state}. To export a non-ACTIVE extension, use the --force option.`,
    );
  }

  const instanceId = last(instance.name.split("/")) ?? "";
  if (instanceId !== options.instance) {
    return;
  }

  // Do not go past this block without either --force or all secrets having been ejected from extensions successfully
  await handleSecretEjection(options, instance);

  const convertedEnv = functionsEnvFromInstance(instance);
  const writeLocation: UserEnvsOpts = kitExportTarget(instanceId, projectId, options);
  if (hasUserEnvs(writeLocation)) {
    logger.info(
      `Exported extensions config appears to already exist in /${instanceId}, aborting write.`,
    );
  } else {
    logLabeledBullet("functions", `Saving exported extensions config as a Function Kits .env file`);
    mkdirSync(resolve(writeLocation.projectDir, writeLocation.configDir ?? instanceId), {
      recursive: true,
    });
    writeUserEnvs(convertedEnv, writeLocation);
  }
}

/**
 * Attempts to remove the `firebase-extensions-managed` label from all Secrets in an ExtensionInstance.
 * The legacy Extensions backend tears down Secrets that have this label upon Extension uninstall, so
 * not doing this risks accidentally destroying the user's secret during kits migration.
 * Because of this risk ext:export requires secret ejection to be wholly successful if --force is not set.
 *
 * Throws an error if ext:export shouldn't proceed, based on the result of of the ejection process and the value of options.force
 */
export async function handleSecretEjection(
  options: Options,
  instance: ExtensionInstance,
): Promise<void> {
  const secrets = await secretsNeedingEjection(instance);
  if (secrets.length === 0) {
    return;
  }

  logLabeledBullet(
    "functions",
    "Cloud Secret Manager resources still require migration from Extensions lifecycle management to Kits.",
  );
  logLabeledWarning(
    "functions",
    "Finishing the Extension migration process with extensions:uninstall without migrating bound secrets will result in permanent loss of secrets.",
  );
  const userAllowedEjection = await confirm({
    message: `Automatically migrate ${secrets.length} Secrets from Extensions to Kits? (Y/n)`,
    nonInteractive: options.nonInteractive,
    force: options.force,
    default: true,
  });
  if (userAllowedEjection) {
    const results = await ejectSecretsFromInstance(instance);
    if (results.fail.length > 0) {
      let resultMsg = "";
      if (results.success.length > 0) {
        resultMsg = `Added functions-managed label to secrets: ${results.success}.`;
      }
      resultMsg += `${results.fail.length} secrets failed to update: ${results.fail}`;
      logLabeledError("functions", resultMsg);
      if (!options.force) {
        throw new FirebaseError("Secret migration failed.");
      } else {
        logLabeledWarning(
          "functions",
          "Proceeding after secret migration failure in --force mode. Manually remove the 'firebase-extensions-managed' label from the secrets, or risk permanent data loss.",
        );
      }
    } else {
      logLabeledBullet(
        "functions",
        `Added functions-managed label to secrets: ${results.success}.`,
      );
    }
  } else {
    logLabeledError(
      "functions",
      "Proceeding without migrating secrets risks permanent data loss. Manually remove the 'firebase-extensions-managed' label from the secrets before running ext:uninstall.",
    );
  }
}

/**
 * @return A forged UserEnvsOpts that will cause writeUserEnvs to write an
 * exported Kits environment to a sensible location:
 * 1) --outputDir command line argument if provided
 * 2) the corresponding kit instance directory from firebase.json if --kit-instance is provided
 * 3) <Firebase root>/<instanceId>/ if inside a Firebase directory
 * 4) <cwd>/<instanceId>/ as a fallback
 */
function kitExportTarget(instanceId: string, projectId: string, options: Options): UserEnvsOpts {
  const firebaseConfig = Config.load(options, true);
  const cwd = options.cwd ?? process.cwd();
  if (typeof options.outputDir !== "undefined") {
    return {
      functionsSource: instanceId,
      configDir: resolve(cwd, String(options.outputDir)),
      projectId: projectId,
      isEmulator: false,
      projectDir: cwd,
    };
  }
  if (typeof options.kitInstance !== "undefined") {
    if (!firebaseConfig) {
      throw new FirebaseError(
        "--kit-instance option was provided but no firebase.json available to look in for kit definitions.",
      );
    }
    const functionsConfig = firebaseConfig.src.functions ?? [];
    const validatedFunctions = normalizeAndValidate(functionsConfig);

    for (const fn of validatedFunctions) {
      if (!isKitConfig(fn)) {
        continue;
      }
      for (const [kitInstanceId, configDirPath] of Object.entries(fn.instances)) {
        if (kitInstanceId === options.kitInstance) {
          const projectDir = options.projectRoot ?? cwd;
          return {
            functionsSource: instanceId,
            configDir: resolve(projectDir, String(configDirPath)),
            projectId: projectId,
            isEmulator: false,
            projectDir: projectDir,
          };
        }
      }
    }
    throw new FirebaseError(
      `Could not find kit instance "${options.kitInstance}" in firebase.json.`,
    );
  }
  if (typeof options.projectRoot !== "undefined") {
    return {
      functionsSource: instanceId,
      configDir: resolve(options.projectRoot, instanceId),
      projectId: projectId,
      isEmulator: false,
      projectDir: options.projectRoot,
    };
  } else {
    return {
      functionsSource: instanceId,
      configDir: resolve(cwd, instanceId),
      projectId: projectId,
      isEmulator: false,
      projectDir: cwd,
    };
  }
}
