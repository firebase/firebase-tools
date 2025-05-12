import * as path from "path";
import {
  artifactRegistryDomain,
  cloudbuildOrigin,
  cloudRunApiOrigin,
  developerConnectOrigin,
  iamOrigin,
  secretManagerOrigin,
} from "../../api";
import {
  doSetupSourceDeploy,
  ensureAppHostingComputeServiceAccount,
} from "../../apphosting/backend";
import { ensure } from "../../ensureApiEnabled";
import { FirebaseError } from "../../error";
import { AppHostingMultiple, AppHostingSingle } from "../../firebaseConfig";
import { ensureApiEnabled, listBackends, parseBackendName } from "../../gcp/apphosting";
import { getGitRepositoryLink, parseGitRepositoryLinkName } from "../../gcp/devConnect";
import { Options } from "../../options";
import { needProjectId } from "../../projectUtils";
import { confirm } from "../../prompt";
import { logBullet, logWarning } from "../../utils";
import { Context } from "./args";

/**
 * Prepare backend targets to deploy from source. Checks that all required APIs are enabled,
 * and that the App Hosting Compute Service Account exists and has the necessary IAM roles.
 */
export default async function (context: Context, options: Options): Promise<void> {
  const projectId = needProjectId(options);
  await ensureApiEnabled(options);

  context.backendConfigs = new Map<string, AppHostingSingle>();
  context.backendLocations = new Map<string, string>();
  context.backendStorageUris = new Map<string, string>();

  await Promise.all([
    ensure(projectId, developerConnectOrigin(), "apphosting", true),
    ensure(projectId, cloudbuildOrigin(), "apphosting", true),
    ensure(projectId, secretManagerOrigin(), "apphosting", true),
    ensure(projectId, cloudRunApiOrigin(), "apphosting", true),
    ensure(projectId, artifactRegistryDomain(), "apphosting", true),
    ensure(projectId, iamOrigin(), "apphosting", true),
  ]);
  await ensureAppHostingComputeServiceAccount(
    projectId,
    /* serviceAccount= */ null,
    /* deployFromSource= */ true,
  );

  const configs = getBackendConfigs(options);
  const { backends } = await listBackends(projectId, "-");
  for (const cfg of configs) {
    const filteredBackends = backends.filter(
      (backend) => parseBackendName(backend.name).id === cfg.backendId,
    );
    let location: string;
    if (filteredBackends.length === 0) {
      if (options.force) {
        throw new FirebaseError(
          `Failed to deploy in non-interactive mode: backend ${cfg.backendId} does not exist yet, ` +
            "and we cannot create one for you because you must choose a primary region for the backend. " +
            "Please run 'firebase apphosting:backends:create' to create the backend, then retry deployment.",
        );
      }
      logBullet(`No backend '${cfg.backendId}' found. Creating a new backend...`);
      ({ location } = await doSetupSourceDeploy(projectId, cfg.backendId));
    } else if (filteredBackends.length === 1) {
      if (cfg.alwaysDeployFromSource === false) {
        continue;
      }
      const backend = filteredBackends[0];
      ({ location } = parseBackendName(backend.name));
      // We prompt the user for confirmation if they are attempting to deploy from source
      // when the backend already has a remote repo connected. We force deploy if the command
      // is run with the --force flag.
      if (cfg.alwaysDeployFromSource === undefined && backend.codebase?.repository) {
        const { connectionName, id } = parseGitRepositoryLinkName(backend.codebase.repository);
        const gitRepositoryLink = await getGitRepositoryLink(
          projectId,
          location,
          connectionName,
          id,
        );

        if (!options.force) {
          const confirmDeploy = await confirm({
            default: true,
            message: `${cfg.backendId} is linked to the remote repository at ${gitRepositoryLink.cloneUri}. Are you sure you want to deploy your local source?`,
          });
          cfg.alwaysDeployFromSource = confirmDeploy;
          const configPath = path.join(options.projectRoot || "", "firebase.json");
          options.config.writeProjectFile(configPath, options.config.src);
          logBullet(
            `Your deployment preferences have been saved to firebase.json. On future invocations of "firebase deploy", your local source will be deployed to my-backend. You can edit this setting in your firebase.json at any time.`,
          );
          if (!confirmDeploy) {
            logWarning(`Skipping deployment of backend ${cfg.backendId}`);
            continue;
          }
        }
      }
    } else {
      const locations = filteredBackends.map((b) => parseBackendName(b.name).location);
      throw new FirebaseError(
        `You have multiple backends with the same ${cfg.backendId} ID in regions: ${locations.join(", ")}. This is not allowed until we can support more locations. ` +
          "Please delete and recreate any backends that share an ID with another backend.",
      );
    }
    context.backendConfigs.set(cfg.backendId, cfg);
    context.backendLocations.set(cfg.backendId, location);
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
