import * as path from "path";
import {
  doSetupSourceDeploy,
  ensureAppHostingComputeServiceAccount,
  ensureRequiredApisEnabled,
} from "../../apphosting/backend";
import { AppHostingMultiple, AppHostingSingle } from "../../firebaseConfig";
import {
  Backend,
  ensureApiEnabled,
  listBackends,
  parseBackendName,
  serviceAgentEmail,
} from "../../gcp/apphosting";
import { AppHostingYamlConfig, EnvMap } from "../../apphosting/yaml";
import { WebConfig } from "../../fetchWebSetup";
import { Env, getAppHostingConfiguration, splitEnvVars } from "../../apphosting/config";
import { getGitRepositoryLink, parseGitRepositoryLinkName } from "../../gcp/devConnect";
import { addServiceAccountToRoles } from "../../gcp/resourceManager";

import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { getProjectNumber } from "../../getProjectNumber";
import { checkbox, confirm } from "../../prompt";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { localBuild } from "../../apphosting/localbuilds";
import { Context } from "./args";
import { FirebaseError } from "../../error";
import * as managementApps from "../../management/apps";
import { getAutoinitEnvVars } from "../../apphosting/utils";
import * as experiments from "../../experiments";
import { logger } from "../../logger";

/**
 * Prepare backend targets to deploy from source. Checks that all required APIs are enabled,
 * and that the App Hosting Compute Service Account exists and has the necessary IAM roles.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  await ensureApiEnabled(options);
  await ensureRequiredApisEnabled(projectId);
  await ensureAppHostingComputeServiceAccount(projectId, /* serviceAccount= */ "");

  context.backendConfigs = {};
  context.backendLocations = {};
  context.backendStorageUris = {};
  context.backendLocalBuilds = {};

  const configs = getBackendConfigs(options);
  if (configs.some((cfg) => cfg.localBuild) && experiments.isEnabled("apphostinglocalbuilds")) {
    const projectNumber = await getProjectNumber(options);
    await ensureAppHostingServiceAgentRoles(projectId, projectNumber);
  }

  const { backends } = await listBackends(projectId, "-");

  const foundBackends: AppHostingSingle[] = [];
  const notFoundBackends: AppHostingSingle[] = [];
  const ambiguousBackends: AppHostingSingle[] = [];
  const skippedBackends: AppHostingSingle[] = [];
  for (const cfg of configs) {
    const filteredBackends = backends.filter(
      (backend) => parseBackendName(backend.name).id === cfg.backendId,
    );
    if (filteredBackends.length === 0) {
      notFoundBackends.push(cfg);
    } else if (filteredBackends.length === 1) {
      foundBackends.push(cfg);
    } else {
      ambiguousBackends.push(cfg);
    }
  }

  // log warning for each ambiguous backend
  for (const cfg of ambiguousBackends) {
    const filteredBackends = backends.filter(
      (backend) => parseBackendName(backend.name).id === cfg.backendId,
    );
    const locations = filteredBackends.map((b) => parseBackendName(b.name).location);
    logLabeledWarning(
      "apphosting",
      `You have multiple backends with the same ${cfg.backendId} ID in regions: ${locations.join(", ")}. This is not allowed until we can support more locations. ` +
        "Please delete and recreate any backends that share an ID with another backend.",
    );
  }

  if (foundBackends.length > 0) {
    logLabeledBullet(
      "apphosting",
      `Found backend(s) ${foundBackends.map((cfg) => cfg.backendId).join(", ")}`,
    );
  }
  for (const cfg of foundBackends) {
    const filteredBackends = backends.filter(
      (backend) => parseBackendName(backend.name).id === cfg.backendId,
    );
    if (cfg.alwaysDeployFromSource === false) {
      skippedBackends.push(cfg);
      continue;
    }
    const backend = filteredBackends[0];
    const { location } = parseBackendName(backend.name);
    // We prompt the user for confirmation if they are attempting to deploy from source
    // when the backend already has a remote repo connected. We force deploy if the command
    // is run with the --force flag.
    if (cfg.alwaysDeployFromSource === undefined && backend.codebase?.repository) {
      const { connectionName, id } = parseGitRepositoryLinkName(backend.codebase.repository);
      const gitRepositoryLink = await getGitRepositoryLink(projectId, location, connectionName, id);

      if (!options.force) {
        const confirmDeploy = await confirm({
          default: true,
          message: `${cfg.backendId} is linked to the remote repository at ${gitRepositoryLink.cloneUri}. Are you sure you want to deploy your local source?`,
        });
        cfg.alwaysDeployFromSource = confirmDeploy;
        const configPath = path.join(options.projectRoot || "", "firebase.json");
        options.config.writeProjectFile(configPath, options.config.src);
        logLabeledBullet(
          "apphosting",
          `On future invocations of "firebase deploy", your local source will ${!confirmDeploy ? "not " : ""}be deployed to ${cfg.backendId}. You can edit this setting in your firebase.json at any time.`,
        );
        if (!confirmDeploy) {
          skippedBackends.push(cfg);
          continue;
        }
      }
    }
    context.backendConfigs[cfg.backendId] = cfg;
    context.backendLocations[cfg.backendId] = location;
  }

  if (notFoundBackends.length > 0) {
    if (options.force) {
      logLabeledWarning(
        "apphosting",
        `Skipping deployments of backend(s) ${notFoundBackends.map((cfg) => cfg.backendId).join(", ")}; ` +
          "the backend(s) do not exist yet and we cannot create them for you because you must choose primary regions for each one. " +
          "Please run 'firebase deploy' without the --force flag, or 'firebase apphosting:backends:create' to create the backend, " +
          "then retry deployment.",
      );
      return;
    }
    const confirmCreate = await confirm({
      default: true,
      message: `Did not find backend(s) ${notFoundBackends.map((cfg) => cfg.backendId).join(", ")}. Do you want to create them (you'll have the option to select which to create in the next step)?`,
    });
    if (confirmCreate) {
      const selected = await checkbox<string>({
        message: "Which backends do you want to create and deploy to?",
        choices: notFoundBackends.map((cfg) => cfg.backendId),
      });
      const selectedBackends = selected.map((id) =>
        notFoundBackends.find((backend) => backend.backendId === id),
      ) as AppHostingSingle[];
      for (const cfg of selectedBackends) {
        logLabeledBullet("apphosting", `Creating a new backend ${cfg.backendId}...`);
        const { location } = await doSetupSourceDeploy(
          projectId,
          cfg.backendId,
          options.nonInteractive,
          cfg.rootDir,
        );
        context.backendConfigs[cfg.backendId] = cfg;
        context.backendLocations[cfg.backendId] = location;
      }
    } else {
      skippedBackends.push(...notFoundBackends);
    }
  }
  if (skippedBackends.length > 0) {
    logLabeledWarning(
      "apphosting",
      `Skipping deployment of backend(s) ${skippedBackends.map((cfg) => cfg.backendId).join(", ")}.`,
    );
  }

  const buildEnv: Record<string, EnvMap> = {};
  const runtimeEnv: Record<string, EnvMap> = {};

  for (const cfg of Object.values(context.backendConfigs)) {
    if (!cfg.localBuild) {
      continue;
    }
    experiments.assertEnabled("apphostinglocalbuilds", "locally build App Hosting backends");
    logLabeledBullet("apphosting", `Starting local build for backend ${cfg.backendId}`);

    await injectEnvVarsFromApphostingConfig(
      configs.filter((c) => c.backendId === cfg.backendId),
      options,
      buildEnv,
      runtimeEnv,
    );
    await injectAutoInitEnvVars(cfg, backends, buildEnv, runtimeEnv);

    try {
      const { outputFiles, annotations, buildConfig } = await localBuild(
        projectId,
        options.projectRoot || "./",
        "nextjs",
        buildEnv[cfg.backendId] || {},
        {
          nonInteractive: options.nonInteractive,
          allowLocalBuildSecrets: !!options.allowLocalBuildSecrets,
        },
      );
      if (outputFiles.length !== 1) {
        throw new FirebaseError(
          `Local build for backend ${cfg.backendId} failed: No output files found.`,
        );
      }
      context.backendLocalBuilds[cfg.backendId] = {
        // TODO(9114): This only works for nextjs.
        buildDir: outputFiles[0],
        buildConfig: {
          ...buildConfig,
          env: mergeEnvVars(buildConfig.env || [], runtimeEnv[cfg.backendId] || {}),
        },
        annotations,
      };
    } catch (e: unknown) {
      const errorMsg = e instanceof Error ? e.message : String(e);
      throw new FirebaseError(`Local Build for backend ${cfg.backendId} failed: ${errorMsg}`);
    }
  }
}

/**
 * Injects environment variables from the user's apphosting.yaml into the build and runtime environment maps.
 * The order of "configs" determines priority. The last config is the highest priority (it has the last say).
 */
export async function injectEnvVarsFromApphostingConfig(
  configs: AppHostingSingle[],
  options: Options,
  buildEnv: Record<string, EnvMap>,
  runtimeEnv: Record<string, EnvMap>,
): Promise<void> {
  for (const cfg of configs) {
    const rootDir = options.projectRoot || process.cwd();
    const appDir = path.join(rootDir, cfg.rootDir || "");
    let yamlConfig = AppHostingYamlConfig.empty();
    try {
      yamlConfig = await getAppHostingConfiguration(appDir);
    } catch (e: unknown) {
      logLabeledWarning(
        "apphosting",
        `Failed to read apphosting.yaml, may be missing environment variables and other configs`,
      );
    }

    const { build, runtime } = splitEnvVars(yamlConfig.env);

    buildEnv[cfg.backendId] = { ...buildEnv[cfg.backendId], ...build };
    runtimeEnv[cfg.backendId] = { ...runtimeEnv[cfg.backendId], ...runtime };
  }
}

/**
 * Injects Firebase SDK auto-init environment variables into the build and runtime environment maps.
 * This prefers existing values. It only auto-injects env vars if they don't already exist.
 */
export async function injectAutoInitEnvVars(
  cfg: AppHostingSingle,
  backends: Backend[],
  buildEnv: Record<string, EnvMap>,
  runtimeEnv: Record<string, EnvMap>,
): Promise<void> {
  const backend = backends.find((b) => parseBackendName(b.name).id === cfg.backendId);
  if (backend?.appId) {
    try {
      const webappConfig = (await managementApps.getAppConfig(
        backend.appId,
        managementApps.AppPlatform.WEB,
      )) as WebConfig;

      // We inject autoinit env vars into the build and runtime env vars.
      const autoinitVars = getAutoinitEnvVars(webappConfig);
      for (const [envVarName, envVarValue] of Object.entries(autoinitVars)) {
        buildEnv[cfg.backendId][envVarName] ??= { value: envVarValue };
        runtimeEnv[cfg.backendId][envVarName] ??= { value: envVarValue };
      }
    } catch (e) {
      logLabeledWarning(
        "apphosting",
        `Unable to lookup details for backend ${cfg.backendId}. Firebase SDK autoinit will not be available.`,
      );
    }
  }
}

/**
 * Exported for unit testing. Filters backend configs based on user input.
 */
export function getBackendConfigs(options: Options): AppHostingMultiple {
  if (!options.config.src.apphosting) {
    return [];
  }
  const backendConfigs = Array.isArray(options.config.src.apphosting)
    ? options.config.src.apphosting
    : [options.config.src.apphosting];
  // If no --only specifier is passed, return all backend configs
  if (!options.only) {
    return backendConfigs;
  }
  const selectors = options.only.split(",");
  const backendIds: string[] = [];
  for (const selector of selectors) {
    // if the user passes the "apphosting" selector, we default to deploying all backends
    // listed in the user's firebase.json App Hosting config.
    if (selector === "apphosting") {
      return backendConfigs;
    }
    if (selector.startsWith("apphosting:")) {
      const backendId = selector.replace("apphosting:", "");
      if (backendId.length > 0) {
        backendIds.push(backendId);
      }
    }
  }
  if (backendIds.length === 0) {
    return [];
  }

  const filteredConfigs = backendConfigs.filter((cfg) => backendIds.includes(cfg.backendId));
  const foundIds = filteredConfigs.map((cfg) => cfg.backendId);
  const missingIds = backendIds.filter((id) => !foundIds.includes(id));
  if (missingIds.length > 0) {
    throw new FirebaseError(
      `App Hosting backend IDs ${missingIds.join(",")} not detected in firebase.json`,
    );
  }

  return filteredConfigs;
}

/**
 * Merges two lists of environment variables, giving precedence to the values in overrides.
 */
function mergeEnvVars(base: Env[], overrides: EnvMap): Env[] {
  // Use a Map to easily deduplicate variables by name
  const merged = new Map<string, Env>();
  for (const env of base) {
    if (env.variable) {
      merged.set(env.variable, env);
    }
  }

  // Apply overrides from config files, but the env var name should be set in the "variable" field
  for (const [envVarName, envVarConfig] of Object.entries(overrides)) {
    merged.set(envVarName, { ...envVarConfig, variable: envVarName });
  }

  // Convert to Env[] as required
  return Array.from(merged.values());
}

/**
 * Ensures that the App Hosting service agent has the necessary roles to access
 * project resources (e.g. storage) for a given project.
 */
async function ensureAppHostingServiceAgentRoles(
  projectId: string,
  projectNumber: string,
): Promise<void> {
  const p4saEmail = serviceAgentEmail(projectNumber);
  try {
    await addServiceAccountToRoles(
      projectId,
      p4saEmail,
      ["roles/storage.objectViewer"],
      /* skipAccountLookup= */ true,
    );
  } catch (err: unknown) {
    logger.debug(`Failed to grant storage.objectViewer to ${p4saEmail}: ${String(err)}`);
    logLabeledWarning(
      "apphosting",
      `Unable to verify App Hosting service agent permissions for ${p4saEmail}. If you encounter a PERMISSION_DENIED error during rollout, please ensure the service agent has the "Storage Object Viewer" role.`,
    );
  }
}
