import * as path from "path";
import {
  doSetupSourceDeploy,
  ensureAppHostingComputeServiceAccount,
  ensureRequiredApisEnabled,
} from "../../apphosting/backend";
import { AppHostingMultiple, AppHostingSingle } from "../../firebaseConfig";
import { ensureApiEnabled, listBackends, parseBackendName } from "../../gcp/apphosting";
import { getGitRepositoryLink, parseGitRepositoryLinkName } from "../../gcp/devConnect";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { checkbox, confirm } from "../../prompt";
import { logLabeledBullet, logLabeledWarning } from "../../utils";
import { localBuild } from "../../apphosting/localbuilds";
import { Context } from "./args";
import { FirebaseError } from "../../error";

/**
 * Prepare backend targets to deploy from source. Checks that all required APIs are enabled,
 * and that the App Hosting Compute Service Account exists and has the necessary IAM roles.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  await ensureApiEnabled(options);
  await ensureRequiredApisEnabled(projectId);
  await ensureAppHostingComputeServiceAccount(projectId, /* serviceAccount= */ "");

  context.backendConfigs = new Map<string, AppHostingSingle>();
  context.backendLocations = new Map<string, string>();
  context.backendStorageUris = new Map<string, string>();
  context.backendLocalBuilds = {};

  const configs = getBackendConfigs(options);
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
    context.backendConfigs.set(cfg.backendId, cfg);
    context.backendLocations.set(cfg.backendId, location);
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
        const { location } = await doSetupSourceDeploy(projectId, cfg.backendId);
        context.backendConfigs.set(cfg.backendId, cfg);
        context.backendLocations.set(cfg.backendId, location);
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

  for ( const [backendId, config] of context.backendConfigs ) {
    if (!config.localBuild) {
      continue;
    }
    logLabeledBullet("apphosting", `Starting local build for backend ${config.backendId}`);
    let builtAppDir;
    try {
      const {outputFiles, annotations, buildConfig} = await localBuild(options.projectRoot || "./", "nextjs");
      context.backendLocalBuilds[config.backendId] = {
	buildDir: outputFiles[0] ?? "",
	buildConfig
      }

    } catch (e) {
      throw new FirebaseError(`Local Build for backend ${config.backendId} failed: ${e}`);
    }
  }
  return;
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
  return backendConfigs.filter((cfg) => backendIds.includes(cfg.backendId));
}
