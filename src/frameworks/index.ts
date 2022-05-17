import { join } from "path";
import { exit } from "process";

import { needProjectId } from "../projectUtils";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import { listSites, Site } from "../hosting/api";
import { getAppConfig, AppPlatform } from "../management/apps";
import { promises as fsPromises } from "fs";
import { promptOnce } from "../prompt";

const { writeFile } = fsPromises;

export const shortSiteName = (site?: Site) => site?.name && site.name.split("/").pop();

export const prepareFrameworks = async (targetNames: string[], context: any, options: any) => {
  const project = needProjectId(context);
  // options.site is not present when emulated. We could call requireHostingSite but IAM permissions haven't
  // been booted up (at this point) and we may be offline, so just use projectId. Most of the time
  // the default site is named the same as the project & for frameworks this is only used for naming the
  // function... unless you're using authenticated server-context TODO explore the implication here.
  const configs = normalizedHostingConfigs({ site: project, ...options }, { resolveTargets: true });
  options.normalizedHostingConfigs = configs;
  if (configs.length === 0) return;
  for (const config of configs) {
    const { source, site, public: publicDir } = config;
    if (!source) continue;
    const dist = join(".firebase", site);
    const hostingDist = join(dist, "hosting");
    const functionsDist = join(dist, "functions");
    if (publicDir)
      throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
    const getProjectPath = (...args: string[]) => join(process.cwd(), source, ...args);
    const functionName = `ssr${site.replace(/-/g, "")}`;
    const { build } = require("firebase-frameworks/tools");
    const { usingCloudFunctions, rewrites, redirects, headers, usesFirebaseConfig } = await build(
      {
        dist,
        project,
        site,
        function: {
          name: functionName,
          region: "us-central1",
        },
      },
      getProjectPath
    );
    config.public = hostingDist;
    if (usingCloudFunctions) {
      if (context.hostingChannel) {
        // TODO move to prompts
        const message =
          "Cannot preview changes to the backend, you will only see changes to the static content on this channel.";
        if (!options.nonInteractive) {
          const continueDeploy = await promptOnce({
            type: "confirm",
            default: true,
            message: `${message} Would you like to continue with the deploy?`,
          });
          if (!continueDeploy) exit(1);
        } else {
          console.error(message);
        }
      } else {
        const functionConfig = {
          source: functionsDist,
          codebase: `firebase-frameworks-${site}`,
        };
        if (targetNames.includes("functions")) {
          const combinedFunctionsConfig = [functionConfig].concat(
            options.config.get("functions") || []
          );
          options.config.set("functions", combinedFunctionsConfig);
        } else {
          targetNames.unshift("functions");
          options.config.set("functions", functionConfig);
        }
      }

      config.rewrites = [
        ...(config.rewrites || []),
        ...rewrites,
        {
          source: "**",
          function: functionName,
        },
      ];

      let firebaseProjectConfig = null;
      if (usesFirebaseConfig) {
        const sites = await listSites(project);
        const selectedSite = sites.find((it) => shortSiteName(it) === site);
        if (selectedSite) {
          const { appId } = selectedSite;
          if (appId) {
            firebaseProjectConfig = await getAppConfig(appId, AppPlatform.WEB);
          } else {
            console.warn(
              `No Firebase app associated with site ${site}, unable to provide authenticated server context.
You can link a Web app to a Hosting site here https://console.firebase.google.com/project/_/settings/general/web`
            );
            if (!options.nonInteractive) {
              const continueDeploy = await promptOnce({
                type: "confirm",
                default: true,
                message: "Would you like to continue with the deploy?",
              });
              if (!continueDeploy) exit(1);
            }
          }
        }
      }
      writeFile(
        join(functionsDist, ".env"),
        `FRAMEWORKS_FIREBASE_PROJECT_CONFIG="${JSON.stringify(firebaseProjectConfig).replace(
          /"/g,
          '\\"'
        )}"`
      );
    } else {
      config.rewrites = [
        ...(config.rewrites || []),
        ...rewrites,
        {
          source: "**",
          destination: "/index.html",
        },
      ];
    }
    config.redirects = [...(config.redirects || []), ...redirects];
    config.headers = [...(config.headers || []), ...headers];
  }
};
