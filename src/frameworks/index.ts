import { join, relative } from "path";
import { exit } from "process";
import { execSync, spawnSync } from "child_process";
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
import { copyFile, readdir, rm, writeFile } from "fs/promises";
import { mkdirp, stat } from "fs-extra";

export const FIREBASE_ADMIN_VERSION = '^11.0.0';
export const FIREBASE_FUNCTIONS_VERSION = '^3.22.0';
export const COOKIE_VERSION = '~0.5.0';
export const LRU_CACHE_VERSION = '^7.8.1';
export const FIREBASE_FRAMEWORKS_VERSION = 'canary';
export const DEFAULT_REGION = 'us-central1';
export const NODE_VERSION = parseInt(process.versions.node, 10).toString();

export function relativeRequire(dir: string, mod: '@angular-devkit/core'): typeof import('@angular-devkit/core');
export function relativeRequire(dir: string, mod: '@angular-devkit/core/node'): typeof import('@angular-devkit/core/node');
export function relativeRequire(dir: string, mod: '@angular-devkit/architect'): typeof import('@angular-devkit/architect');
export function relativeRequire(dir: string, mod: '@angular-devkit/architect/node'): typeof import('@angular-devkit/architect/node');
export function relativeRequire(dir: string, mod: 'next/dist/build'): typeof import('next/dist/build');
export function relativeRequire(dir: string, mod: 'next/dist/server/config'): typeof import('next/dist/server/config');
export function relativeRequire(dir: string, mod: 'next/constants'): typeof import('next/constants');
export function relativeRequire(dir: string, mod: 'next'): typeof import('next');
export function relativeRequire(dir: string, mod: 'vite'): typeof import('vite');
export function relativeRequire(dir: string, mod: string) {
    const path = require.resolve(mod, { paths: [ dir ]});
    if (!path) throw `Can't find ${mod}.`;
    return require(path);
}

export type Discovery = {
  mayWantBackend: boolean,
  publicDirectory: string,
};

export type BuildResult = {
  rewrites?: any[],
  redirects?: any[],
  headers?: any[],
  wantsBackend?: boolean,
} | void;

export interface Framework {
  discover: (dir:string) => Promise<Discovery|undefined>,
  type: FrameworkType,
  name: string,
  build: (dir:string) => Promise<BuildResult>,
  support: SupportLevel,
  init?: (setup: any) => Promise<void>,
  // TODO types
  getDevModeHandle?: (dir:string) => Promise<(req: IncomingMessage, res: ServerResponse, next: () => void) => void>;
  ɵcodegenPublicDirectory: (dir:string, dest:string) => Promise<void>,
  ɵcodegenFunctionsDirectory?: (dir:string, dest:string) => Promise<{ bootstrapScript?: string, packageJson: any }>,
};

export const WebFrameworks: Record<string, Framework> = Object.fromEntries(
  readdirSync(__dirname).
    filter(path => statSync(join(__dirname, path)).isDirectory()).
    map(path => [path, require(join(__dirname, path))]).
    // TODO guard this better
    filter(([, obj]) => obj.name && obj.discover && obj.build && obj.type != undefined && obj.support)
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

const NPM_COMMAND = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const findDependency = (name: string, options: Partial<FindDepOptions>={}) => {
  const { cwd, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const result = spawnSync(NPM_COMMAND, [
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
  const { projectRoot } = options;
  const account = getProjectDefaultAccount(projectRoot)
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
    const dist = join(projectRoot, ".firebase", site);
    const hostingDist = join(dist, "hosting");
    const functionsDist = join(dist, "functions");
    if (publicDir)
      throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
    const getProjectPath = (...args: string[]) => join(projectRoot, source, ...args);
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
    emulators.forEach((info) => {
      if (info.name === Emulators.FIRESTORE) process.env[Constants.FIRESTORE_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.AUTH) process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.DATABASE) process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = formatHost(info);
      if (info.name === Emulators.STORAGE) process.env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = formatHost(info);
    });
    let firebaseConfig = null;
    if (firebaseAppVersion) {
      const sites = await listSites(project);
      const selectedSite = sites.find((it) => shortSiteName(it) === site);
      if (selectedSite) {
        const { appId } = selectedSite;
        if (appId) {
          firebaseConfig = await getAppConfig(appId, AppPlatform.WEB);
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
    if (firebaseConfig) process.env.FRAMEWORKS_APP_OPTIONS = JSON.stringify(firebaseConfig);
    const results = await discover(getProjectPath());
    if (!results) throw 'Epic fail.';
    const { framework, mayWantBackend, publicDirectory } = results;
    const { build, ɵcodegenPublicDirectory, ɵcodegenFunctionsDirectory, getDevModeHandle } = WebFrameworks[framework];
    // TODO do this better
    const isDevMode = context._name === 'serve' || context._name === 'emulators:start';
    const devModeHandle = isDevMode && getDevModeHandle && await getDevModeHandle(getProjectPath());
    if (devModeHandle) {
      config.public = relative(projectRoot, publicDirectory);
      options.frameworksDevModeHandle = devModeHandle;
      // TODO add a noop firebase aware function for Auth+SSR dev server
      // if (mayWantBackend && firebaseProjectConfig) codegenNullFunctionsDirectory();
    } else {
      const { wantsBackend=false, rewrites=[], redirects=[], headers=[] } = await build(getProjectPath()) || {};
      await rm(hostingDist, { recursive: true });
      await mkdirp(hostingDist);
      await ɵcodegenPublicDirectory(getProjectPath(), hostingDist);
      config.public = relative(projectRoot, hostingDist);
      if (wantsBackend && ɵcodegenFunctionsDirectory) {
        // if exists, delete everything but the node_modules directory and package-lock.json
        // this should speed up repeated NPM installs
        if (existsSync(functionsDist)) {
          const functionsDistStat = await stat(functionsDist);
          if (functionsDistStat?.isDirectory()) {
            const files = await readdir(functionsDist);
            for (const file of files) {
              if (file !== 'node_modules' && file !== 'package-lock.json') rm(join(functionsDist, file), { recursive: true });
            }
          } else {
            await rm(functionsDist);
          }
        } else {
          await mkdirp(functionsDist);
        }
        const { packageJson, bootstrapScript } = await ɵcodegenFunctionsDirectory(getProjectPath(), functionsDist);
        packageJson.main = 'server.js';
        delete packageJson.devDependencies;
        packageJson.dependencies ||= {};
        packageJson.dependencies['firebase-frameworks'] = FIREBASE_FRAMEWORKS_VERSION;
        // TODO(jamesdaniels) test these with semver, error if already set out of range
        packageJson.dependencies['firebase-admin'] ||= FIREBASE_ADMIN_VERSION;
        packageJson.dependencies['firebase-functions'] ||= FIREBASE_FUNCTIONS_VERSION;
        if (firebaseConfig) {
            packageJson.dependencies['cookie'] ||= COOKIE_VERSION;
            packageJson.dependencies['lru-cache'] ||= LRU_CACHE_VERSION;
        }
        packageJson.engines ||= {};
        packageJson.engines.node ||= NODE_VERSION;

        await writeFile(join(functionsDist, 'package.json'), JSON.stringify(packageJson, null, 2));

        await copyFile(getProjectPath('package-lock.json'), join(functionsDist, 'package-lock.json')).catch(() => {});

        execSync(`${NPM_COMMAND} i --omit dev --no-audit`, { cwd: functionsDist, stdio: 'inherit' });

        if (bootstrapScript) {
            await writeFile(join(functionsDist, 'bootstrap.js'), bootstrapScript);
        }
        if (firebaseConfig) {
            await writeFile(join(functionsDist, 'server.js'), `const { onRequest } = require('firebase-functions/v2/https');

const firebaseAwareServer = import('firebase-frameworks/server/firebase-aware');
const frameworkServer = import('firebase-frameworks/frameworks/${framework}/server');
const server = Promise.all([firebaseAwareServer, frameworkServer]).then(([ {handleFactory}, {handle} ]) => handleFactory(handle));

exports.ssr = onRequest((req, res) => server.then(it => it(req, res)));
`);
        } else {
            await writeFile(join(functionsDist, 'server.js'), `const { onRequest } = require('firebase-functions/v2/https');
const server = import('firebase-frameworks/frameworks/${framework}/server');

exports.ssr = onRequest((req, res) => server.then(({handle}) => handle(req, res)));
`);
        }

        await writeFile(join(functionsDist, 'functions.yaml'), JSON.stringify({
            endpoints: {
                [functionName]: {
                    platform:  'gcfv2',
                    region: [DEFAULT_REGION],
                    labels: {},
                    httpsTrigger: {},
                    entryPoint: 'ssr'
                }
            },
            specVersion: 'v1alpha1',
            // TODO(jamesdaniels) add persistent disk if needed
            requiredAPIs: []
        }, null, 2));

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
        }

        const functionConfig = {
          source: relative(projectRoot, functionsDist),
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
        console.log(options.config.get("functions"));
  
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
    }
    config.cleanUrls ??= true;
    console.log(config);
  }
};
