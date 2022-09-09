import { join } from "path";
import { exit } from "process";
import { spawnSync } from "child_process";
import { existsSync, readdirSync, statSync } from "fs";

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
import { IncomingMessage, ServerResponse } from "http";

export function relativeRequire(dir: string, mod: '@angular-devkit/core'): typeof import('@angular-devkit/core');
export function relativeRequire(dir: string, mod: '@angular-devkit/core/node'): typeof import('@angular-devkit/core/node');
export function relativeRequire(dir: string, mod: '@angular-devkit/architect'): typeof import('@angular-devkit/architect');
export function relativeRequire(dir: string, mod: '@angular-devkit/architect/node'): typeof import('@angular-devkit/architect/node');
export function relativeRequire(dir: string, mod: string) {
    const path = require.resolve(mod, { paths: [ dir ]});
    if (!path) throw `Can't find ${mod}.`;
    return require(path);
}

type CommonDiscovery = {
  rewrites: any[],
  redirects: any[],
  headers: any[],
};

export type Discovery = ({
  mayWantBackend: boolean,
  publicDirectory: string,
} & CommonDiscovery) | undefined;

export type BuildResult = {
  wantsBackend: boolean,
} & CommonDiscovery;

export interface Framework {
  discover: (dir:string) => Promise<Discovery>,
  type: FrameworkType,
  name: string,
  build: (dir:string) => Promise<BuildResult>,
  support: SupportLevel,
  init?: (setup: any) => Promise<void>,
  // TODO types
  getDevModeHandle?: (dir:string) => Promise<(req: IncomingMessage, res: ServerResponse, next: () => void) => void>;
  ɵcodegenPublicDirectory: (dir:string) => Promise<void>,
  ɵcodegenFunctionsDirectory?: (dir:string) => Promise<void>,
};

export const WebFrameworks: Record<string, Framework> = Object.fromEntries(
  readdirSync(__dirname).
    filter(path => statSync(join(__dirname, path)).isDirectory()).
    map(path => [path, require(join(__dirname, path))]).
    // TODO guard this better
    filter(([, obj]) => obj.name && obj.discover && obj.build && obj.type != undefined && obj.support).
    sort(([[,a], [,b]]) => a.type - b.type)
);

// These serve as the order of operations for discovery
// E.g, a framework utilizing Vite should be given priority
// over the vite tooling
export const enum FrameworkType {
  Custom = 0,    // express
  Monorep,       // nx, lerna
  MetaFramework, // next.js, nest.js
  Framework,     // angular, react
  Toolchain,     // vite
};

export const enum SupportLevel {
  Expirimental = 'expirimental',
  Community = 'community-supported',
}

// TODO mix in the discovery from web frameworks
export const discover = async (dir: string, warn: boolean=true) => {
  if (!existsSync(join(dir, 'package.json'))) return undefined;
  const allFrameworkTypes = [...new Set(Object.values(WebFrameworks).map(({ type }) => type))].sort();
  for (const discoveryType of allFrameworkTypes) {
    const frameworksDiscovered = [];
    for (const framework in WebFrameworks) {
      const { discover, type } = WebFrameworks[framework];
      if (type !== discoveryType) continue;
      const result = await discover(dir);
      if (result) frameworksDiscovered.push({ framework, ...result });
    };
    if (frameworksDiscovered.length > 1) throw 'Yada';
    if (frameworksDiscovered.length == 1) return frameworksDiscovered[0];
  }
  if (warn) console.warn("We can't detirmine the web framework in use. TODO link");
  return undefined;
};

export const shortSiteName = (site?: Site) => site?.name && site.name.split("/").pop();
type FindDepOptions = {
  cwd: string;
  depth?: number;
  omitDev: boolean;
}

const DEFAULT_FIND_DEP_OPTIONS: FindDepOptions = {
  cwd: process.cwd(),
  omitDev: true,
};

export const findDependency = (name: string, options: Partial<FindDepOptions>={}) => {
  const { cwd, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
      'list', name,
      '--json',
      ...(omitDev ? ['--omit', 'dev'] : []),
      ...(depth === undefined ? [] : ['--depth', depth.toString(10),
  ])], { cwd });
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
    const firebaseAdminVersion = findDependency('firebase-admin', { cwd: getProjectPath() });
    const firebaseAppVersion = findDependency('@firebase/app', { cwd: getProjectPath() });
    if (firebaseAdminVersion && account) {
      process.env.GOOGLE_CLOUD_PROJECT = project;
      if (account && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const defaultCredPath = await getCredentialPathAsync(account);
        if (defaultCredPath) process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
      }
    };
    console.log(emulators);
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
    const results = await discover(getProjectPath());
    if (!results) throw 'Epic fail.';
    let usingCloudFunctions = false;
    const { framework, rewrites, redirects, headers, mayWantBackend, publicDirectory } = results;
    const { build, ɵcodegenPublicDirectory, ɵcodegenFunctionsDirectory, getDevModeHandle } = WebFrameworks[framework];
    // TODO do this better
    const isDevMode = context._name === 'serve' || context._name === 'emulators:start';
    const devModeHandle = isDevMode && getDevModeHandle && await getDevModeHandle(getProjectPath());
    if (devModeHandle) {
      config.public = publicDirectory;
      options.frameworksDevModeHandle= devModeHandle;
      // TODO add a noop firebase aware function for Auth+SSR dev server
      // if (mayWantBackend && firebaseProjectConfig) codegenNullFunctionsDirectory();
    } else {
      const { wantsBackend } = await build(getProjectPath());
      await ɵcodegenPublicDirectory(hostingDist);
      if (wantsBackend && ɵcodegenFunctionsDirectory) {
        ɵcodegenFunctionsDirectory(functionsDist);
        usingCloudFunctions = true;
      }
      config.public = hostingDist;
    }
    if (usingCloudFunctions) {
      if (!isDevMode && context.hostingChannel) {
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
