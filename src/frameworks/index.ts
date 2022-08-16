import { join } from "path";
import { exit } from "process";

import { needProjectId } from "../projectUtils";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import { listSites, Site } from "../hosting/api";
import { getAppConfig, AppPlatform } from "../management/apps";
import { promptOnce } from "../prompt";
import { EmulatorInfo, Emulators } from "../emulator/types";
import { getCredentialPathAsync } from "../defaultCredentials";
import { getProjectDefaultAccount } from "../auth";
import { formatHost } from "../emulator/functionsEmulatorShared";
import { Constants } from "../emulator/constants";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { readFile } from "fs/promises";

export enum WebFramework {
  NextJS = 'next.js',
  ExpressCustom = 'express',
  Nuxt = 'nuxt',
  Angular = 'angular',
}

// TODO mix in the discovery from web frameworks
export const discover = async (dir: string, warn: boolean=true) => {
  const fileExists = (...files: string[]) => files.some(file => existsSync(join(dir, file)));
  if (!existsSync(dir) || !fileExists('package.json')) return undefined;
  const packageJsonBuffer = await readFile(join(dir, 'package.json'));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  if (packageJson.directories?.serve) return { framework: WebFramework.ExpressCustom };
  if (fileExists('next.config.js')) return { framework: WebFramework.NextJS };
  // TODO breakout nuxt 2 vs 3
  if (fileExists('nuxt.config.js', 'nuxt.config.ts')) return { framework: WebFramework.Nuxt };
  if (fileExists('angular.json')) return { framework: WebFramework.Angular };
  // TODO if dep Next.js
  if (warn) console.warn("We can't detirmine the web framework in use. TODO link");
  return undefined;
};

export const shortSiteName = (site?: Site) => site?.name && site.name.split("/").pop();

export const findDependency = (name: string, cwd=process.cwd()) => {
  const result = spawnSync('npm', ['list', name, '--json', '--omit', 'dev'], { cwd });
  if (!result.stdout) return undefined;
  const json = JSON.parse(result.stdout.toString());
  const search = (searchingFor: string, dependencies={}): any => {
      for (const [name, dependency] of Object.entries(dependencies as Record<string, Record<string, any>>)) {
          if (name === searchingFor && dependency.resolved) return dependency;
          const result = search(searchingFor, dependency.dependencies);
          if (result) return result;
      }
      return null;
  }
  return search(name, json.dependencies);
};

export const prepareFrameworks = async (targetNames: string[], context: any, options: any, emulators: EmulatorInfo[]=[]) => {
  const project = needProjectId(context);
  const account = getProjectDefaultAccount(options.projectRoot)
  // options.site is not present when emulated. We could call requireHostingSite but IAM permissions haven't
  // been booted up (at this point) and we may be offline, so just use projectId. Most of the time
  // the default site is named the same as the project & for frameworks this is only used for naming the
  // function... unless you're using authenticated server-context TODO explore the implication here.
  const configs = normalizedHostingConfigs({ site: project, ...options }, { resolveTargets: true });
  options.normalizedHostingConfigs = configs;
  // @ts-ignore
  const { build, injectConfig } = await import("firebase-frameworks/tools");
  if (configs.length === 0) return;
  for (const config of configs) {
    const { source, site, public: publicDir } = config;
    if (!source) continue;
    const dist = join(".firebase", site);
    const hostingDist = join(dist, "hosting");
    const functionsDist = join(dist, "functions");
    if (publicDir)
      throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
    const getProjectPath = (...args: string[]) => join(options.projectRoot, source, ...args);
    const functionName = `ssr${site.replace(/-/g, "")}`;
    const firebaseAdminVersion = findDependency('firebase-admin', getProjectPath());
    const firebaseAppVersion = findDependency('@firebase/app', getProjectPath());
    if (firebaseAdminVersion && account) {
      process.env.GOOGLE_CLOUD_PROJECT = project;
      if (account && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const defaultCredPath = await getCredentialPathAsync(account);
        if (defaultCredPath) process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
      }
    };
    emulators.forEach((info) => {
      if (info.name === Emulators.FIRESTORE) process.env[Constants.FIRESTORE_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.AUTH) process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.DATABASE) process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.STORAGE) process.env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = formatHost(info);
    });
    let firebaseProjectConfig = null;
    if (firebaseAppVersion) {
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
    if (firebaseProjectConfig) process.env.FRAMEWORKS_APP_OPTIONS = JSON.stringify(firebaseProjectConfig);
    const { usingCloudFunctions, framework, rewrites, redirects, headers } = await build(
      {
        dist: join(options.projectRoot, dist),
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
    if (firebaseProjectConfig) await injectConfig(dist, framework, firebaseProjectConfig, emulators, usingCloudFunctions);
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
    config.cleanUrls ??= true;
  }
};
