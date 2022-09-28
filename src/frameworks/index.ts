import { join, relative, extname } from "path";
import { exit } from "process";
import { execSync, spawnSync } from "child_process";
import { readdirSync, statSync } from "fs";
import { pathToFileURL } from "url";
import { IncomingMessage, ServerResponse } from "http";
import { copyFile, readdir, rm, writeFile } from "fs/promises";
import { mkdirp, pathExists, stat } from "fs-extra";
import * as clc from "colorette";

import { needProjectId } from "../projectUtils";
import { normalizedHostingConfigs } from "../hosting/normalizedHostingConfigs";
import { listSites } from "../hosting/api";
import { getAppConfig, AppPlatform } from "../management/apps";
import { promptOnce } from "../prompt";
import { EmulatorInfo, Emulators } from "../emulator/types";
import { getCredentialPathAsync } from "../defaultCredentials";
import { getProjectDefaultAccount } from "../auth";
import { formatHost } from "../emulator/functionsEmulatorShared";
import { Constants } from "../emulator/constants";

// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../dynamicImport");

export interface Discovery {
  mayWantBackend: boolean;
  publicDirectory: string;
}

export interface BuildResult {
  rewrites?: any[];
  redirects?: any[];
  headers?: any[];
  wantsBackend?: boolean;
}

export interface Framework {
  discover: (dir: string) => Promise<Discovery | undefined>;
  type: FrameworkType;
  name: string;
  build: (dir: string) => Promise<BuildResult | void>;
  support: SupportLevel;
  init?: (setup: any) => Promise<void>;
  getDevModeHandle?: (
    dir: string
  ) => Promise<(req: IncomingMessage, res: ServerResponse, next: () => void) => void>;
  ɵcodegenPublicDirectory: (dir: string, dest: string) => Promise<void>;
  ɵcodegenFunctionsDirectory?: (
    dir: string,
    dest: string
  ) => Promise<{
    bootstrapScript?: string;
    packageJson: any;
    frameworksEntry?: string;
  }>;
}

// TODO pull from @firebase/util when published
interface FirebaseDefaults {
  config?: Object;
  emulatorHosts?: Record<string, string>;
  _authTokenSyncURL?: string;
}

interface FindDepOptions {
  cwd: string;
  depth?: number;
  omitDev: boolean;
}

// These serve as the order of operations for discovery
// E.g, a framework utilizing Vite should be given priority
// over the vite tooling
export const enum FrameworkType {
  Custom = 0, // express
  Monorep, // nx, lerna
  MetaFramework, // next.js, nest.js
  Framework, // angular, react
  Toolchain, // vite
}

export const enum SupportLevel {
  Expirimental = "expirimental",
  Community = "community-supported",
}

const SupportLevelWarnings = {
  [SupportLevel.Expirimental]: clc.yellow(
    `This is an expirimental integration, proceed with caution.`
  ),
  [SupportLevel.Community]: clc.yellow(
    `This is a community-supported integration, support is best effort.`
  ),
};

export const FIREBASE_FRAMEWORKS_VERSION = "^0.6.0";
export const FIREBASE_FUNCTIONS_VERSION = "^3.23.0";
export const FIREBASE_ADMIN_VERSION = "^11.0.1";
export const DEFAULT_REGION = "us-central1";
export const NODE_VERSION = parseInt(process.versions.node, 10).toString();

const DEFAULT_FIND_DEP_OPTIONS: FindDepOptions = {
  cwd: process.cwd(),
  omitDev: true,
};

const NPM_COMMAND = process.platform === "win32" ? "npm.cmd" : "npm";

export const WebFrameworks: Record<string, Framework> = Object.fromEntries(
  readdirSync(__dirname)
    .filter((path) => statSync(join(__dirname, path)).isDirectory())
    .map((path) => [path, require(join(__dirname, path))])
    .filter(
      ([, obj]) => obj.name && obj.discover && obj.build && obj.type !== undefined && obj.support
    )
);

export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/core"
): typeof import("@angular-devkit/core");
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/core/node"
): typeof import("@angular-devkit/core/node");
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/architect"
): typeof import("@angular-devkit/architect");
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/architect/node"
): typeof import("@angular-devkit/architect/node");
export function relativeRequire(
  dir: string,
  mod: "next/dist/build"
): typeof import("next/dist/build");
export function relativeRequire(
  dir: string,
  mod: "next/dist/server/config"
): typeof import("next/dist/server/config");
export function relativeRequire(
  dir: string,
  mod: "next/constants"
): typeof import("next/constants");
export function relativeRequire(dir: string, mod: "next"): typeof import("next");
export function relativeRequire(dir: string, mod: "vite"): typeof import("vite");
export function relativeRequire(dir: string, mod: "jsonc-parser"): typeof import("jsonc-parser");
// TODO the types for @nuxt/kit are causing a lot of troubles, need to do something other than any
export function relativeRequire(dir: string, mod: "@nuxt/kit"): Promise<any>;
export function relativeRequire(dir: string, mod: string) {
  try {
    const path = require.resolve(mod, { paths: [dir] });
    if (extname(path) === ".mjs") {
      return dynamicImport(pathToFileURL(path).toString());
    } else {
      return require(path);
    }
  } catch (e) {
    const path = relative(process.cwd(), dir);
    console.error(
      `Could not load dependency ${mod} in ${
        path.startsWith("..") ? path : `./${path}`
      }, have you run \`npm install\`?`
    );
    throw e;
  }
}

export async function discover(dir: string, warn: boolean = true) {
  const allFrameworkTypes = [
    ...new Set(Object.values(WebFrameworks).map(({ type }) => type)),
  ].sort();
  for (const discoveryType of allFrameworkTypes) {
    const frameworksDiscovered = [];
    for (const framework in WebFrameworks) {
      if (WebFrameworks[framework]) {
        const { discover, type } = WebFrameworks[framework];
        if (type !== discoveryType) continue;
        const result = await discover(dir);
        if (result) frameworksDiscovered.push({ framework, ...result });
      }
    }
    if (frameworksDiscovered.length > 1) {
      if (warn) console.error("Multiple conflicting frameworks discovered. TODO link");
      return;
    }
    if (frameworksDiscovered.length === 1) return frameworksDiscovered[0];
  }
  if (warn) console.warn("We can't detirmine the web framework in use. TODO link");
  return;
}

function scanDependencyTree(searchingFor: string, dependencies = {}): any {
  for (const [name, dependency] of Object.entries(
    dependencies as Record<string, Record<string, any>>
  )) {
    if (name === searchingFor) return dependency;
    const result = scanDependencyTree(searchingFor, dependency.dependencies);
    if (result) return result;
  }
  return;
}

export function findDependency(name: string, options: Partial<FindDepOptions> = {}) {
  const { cwd, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const result = spawnSync(
    NPM_COMMAND,
    [
      "list",
      name,
      "--json",
      ...(omitDev ? ["--omit", "dev"] : []),
      ...(depth === undefined ? [] : ["--depth", depth.toString(10)]),
    ],
    { cwd }
  );
  if (!result.stdout) return;
  const json = JSON.parse(result.stdout.toString());
  return scanDependencyTree(name, json.dependencies);
}

export async function prepareFrameworks(
  targetNames: string[],
  context: any,
  options: any,
  emulators: EmulatorInfo[] = []
) {
  const project = needProjectId(context);
  const { projectRoot } = options;
  const account = getProjectDefaultAccount(projectRoot);
  // options.site is not present when emulated. We could call requireHostingSite but IAM permissions haven't
  // been booted up (at this point) and we may be offline, so just use projectId. Most of the time
  // the default site is named the same as the project & for frameworks this is only used for naming the
  // function... unless you're using authenticated server-context TODO explore the implication here.
  const configs = normalizedHostingConfigs({ site: project, ...options }, { resolveTargets: true });
  options.normalizedHostingConfigs = configs;
  let firebaseDefaults: FirebaseDefaults | undefined = undefined;
  if (configs.length === 0) return;
  for (const config of configs) {
    const { source, site, public: publicDir } = config;
    if (!source) continue;
    config.rewrites ||= [];
    config.redirects ||= [];
    config.headers ||= [];
    config.cleanUrls ??= true;
    const dist = join(projectRoot, ".firebase", site);
    const hostingDist = join(dist, "hosting");
    const functionsDist = join(dist, "functions");
    if (publicDir)
      throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
    const getProjectPath = (...args: string[]) => join(projectRoot, source, ...args);
    const functionName = `ssr${site.replace(/-/g, "")}`;
    const usesFirebaseAdminSdk = !!findDependency("firebase-admin", { cwd: getProjectPath() });
    const usesFirebaseJsSdk = !!findDependency("@firebase/app", { cwd: getProjectPath() });
    if (usesFirebaseAdminSdk) {
      process.env.GOOGLE_CLOUD_PROJECT = project;
      if (account && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        const defaultCredPath = await getCredentialPathAsync(account);
        if (defaultCredPath) process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
      }
    }
    emulators.forEach((info) => {
      if (usesFirebaseAdminSdk) {
        if (info.name === Emulators.FIRESTORE)
          process.env[Constants.FIRESTORE_EMULATOR_HOST] = formatHost(info);
        if (info.name === Emulators.AUTH)
          process.env[Constants.FIREBASE_AUTH_EMULATOR_HOST] = formatHost(info);
        if (info.name === Emulators.DATABASE)
          process.env[Constants.FIREBASE_DATABASE_EMULATOR_HOST] = formatHost(info);
        if (info.name === Emulators.STORAGE)
          process.env[Constants.FIREBASE_STORAGE_EMULATOR_HOST] = formatHost(info);
      }
      if (usesFirebaseJsSdk) {
        firebaseDefaults ||= {};
        firebaseDefaults.emulatorHosts ||= {};
        firebaseDefaults.emulatorHosts![info.name] = formatHost(info);
      }
    });
    let firebaseConfig = null;
    if (usesFirebaseJsSdk) {
      const sites = await listSites(project);
      const selectedSite = sites.find((it) => it.name && it.name.split("/").pop() === site);
      if (selectedSite) {
        const { appId } = selectedSite;
        if (appId) {
          firebaseConfig = await getAppConfig(appId, AppPlatform.WEB);
          firebaseDefaults ||= {};
          firebaseDefaults.config = firebaseConfig;
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
    if (firebaseDefaults) process.env.__FIREBASE_DEFAULTS__ = JSON.stringify(firebaseDefaults);
    const results = await discover(getProjectPath());
    if (!results) throw new Error("Epic fail.");
    const { framework, mayWantBackend, publicDirectory } = results;
    const {
      build,
      ɵcodegenPublicDirectory,
      ɵcodegenFunctionsDirectory: codegenProdModeFunctionsDirectory,
      getDevModeHandle,
      name,
      support,
    } = WebFrameworks[framework];
    console.log(`Detected a ${name} codebase. ${SupportLevelWarnings[support] || ""}\n`);
    // TODO allow for override
    const isDevMode = context._name === "serve" || context._name === "emulators:start";
    const devModeHandle =
      isDevMode && getDevModeHandle && (await getDevModeHandle(getProjectPath()));
    let codegenFunctionsDirectory: Framework["ɵcodegenFunctionsDirectory"];
    if (devModeHandle) {
      config.public = relative(projectRoot, publicDirectory);
      // Attach the handle to options, it will be used when spinning up superstatic
      options.frameworksDevModeHandle = devModeHandle;
      // null is the dev-mode entry for firebase-framework-tools
      if (mayWantBackend && firebaseDefaults)
        codegenFunctionsDirectory = codegenDevModeFunctionsDirectory;
    } else {
      const {
        wantsBackend = false,
        rewrites = [],
        redirects = [],
        headers = [],
      } = (await build(getProjectPath())) || {};
      config.rewrites.push(...rewrites);
      config.redirects.push(...redirects);
      config.headers.push(...headers);
      if (await pathExists(hostingDist)) await rm(hostingDist, { recursive: true });
      await mkdirp(hostingDist);
      await ɵcodegenPublicDirectory(getProjectPath(), hostingDist);
      config.public = relative(projectRoot, hostingDist);
      if (wantsBackend) codegenFunctionsDirectory = codegenProdModeFunctionsDirectory;
    }
    if (codegenFunctionsDirectory) {
      if (firebaseDefaults) firebaseDefaults._authTokenSyncURL = "/__session";

      config.rewrites.push({
        source: "**",
        function: functionName,
      });

      const existingFunctionsConfig = options.config.get("functions")
        ? [].concat(options.config.get("functions"))
        : [];
      options.config.set("functions", [
        ...existingFunctionsConfig,
        {
          source: relative(projectRoot, functionsDist),
          codebase: `firebase-frameworks-${site}`,
        },
      ]);

      if (!targetNames.includes("functions")) targetNames.unshift("functions");

      // if exists, delete everything but the node_modules directory and package-lock.json
      // this should speed up repeated NPM installs
      if (await pathExists(functionsDist)) {
        const functionsDistStat = await stat(functionsDist);
        if (functionsDistStat?.isDirectory()) {
          const files = await readdir(functionsDist);
          for (const file of files) {
            if (file !== "node_modules" && file !== "package-lock.json")
              await rm(join(functionsDist, file), { recursive: true });
          }
        } else {
          await rm(functionsDist);
        }
      } else {
        await mkdirp(functionsDist);
      }

      const {
        packageJson,
        bootstrapScript,
        frameworksEntry = framework,
      } = await codegenFunctionsDirectory(getProjectPath(), functionsDist);

      await writeFile(
        join(functionsDist, "functions.yaml"),
        JSON.stringify(
          {
            endpoints: {
              [functionName]: {
                platform: "gcfv2",
                // TODO allow this to be configurable
                region: [DEFAULT_REGION],
                labels: {},
                httpsTrigger: {},
                entryPoint: "ssr",
              },
            },
            specVersion: "v1alpha1",
            requiredAPIs: [],
          },
          null,
          2
        )
      );

      packageJson.main = "server.js";
      delete packageJson.devDependencies;
      packageJson.dependencies ||= {};
      packageJson.dependencies["firebase-frameworks"] ||= FIREBASE_FRAMEWORKS_VERSION;
      packageJson.dependencies["firebase-functions"] ||= FIREBASE_FUNCTIONS_VERSION;
      packageJson.dependencies["firebase-admin"] ||= FIREBASE_ADMIN_VERSION;
      packageJson.engines ||= {};
      packageJson.engines.node ||= NODE_VERSION;

      await writeFile(join(functionsDist, "package.json"), JSON.stringify(packageJson, null, 2));

      // TODO do we add the append the local .env?
      await writeFile(
        join(functionsDist, ".env"),
        `__FIREBASE_FRAMEWORKS_ENTRY__=${frameworksEntry}
${firebaseDefaults ? `__FIREBASE_DEFAULTS__=${JSON.stringify(firebaseDefaults)}\n` : ""}`
      );

      await copyFile(
        getProjectPath("package-lock.json"),
        join(functionsDist, "package-lock.json")
      ).catch(() => {
        // continue
      });

      execSync(`${NPM_COMMAND} i --omit dev --no-audit`, {
        cwd: functionsDist,
        stdio: "inherit",
      });

      if (bootstrapScript) await writeFile(join(functionsDist, "bootstrap.js"), bootstrapScript);

      // TODO move to templates
      await writeFile(
        join(functionsDist, "server.js"),
        `const { onRequest } = require('firebase-functions/v2/https');
const server = import('firebase-frameworks');
exports.ssr = onRequest((req, res) => server.then(it => it.handle(req, res)));
`
      );
    } else {
      // No function, treat as an SPA
      // TODO(jamesdaniels) be smarter about this, leave it to the framework?
      config.rewrites.push({
        source: "**",
        destination: "/index.html",
      });
    }

    if (firebaseDefaults) {
      const encodedDefaults = Buffer.from(JSON.stringify(firebaseDefaults)).toString("base64url");
      const expires = new Date(new Date().getTime() + 60_000_000_000);
      const sameSite = "Strict";
      const path = `/`;
      config.headers.push({
        source: "**/*.js",
        headers: [
          {
            key: "Set-Cookie",
            value: `__FIREBASE_DEFAULTS__=${encodedDefaults}; SameSite=${sameSite}; Expires=${expires.toISOString()}; Path=${path};`,
          },
        ],
      });
    }
  }
}

function codegenDevModeFunctionsDirectory() {
  const packageJson = {};
  return Promise.resolve({ packageJson, frameworksEntry: "_devMode" });
}

export function createServerResponseProxy(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
) {
  const proxiedRes = new ServerResponse(req);
  const buffer: [string, any[]][] = [];
  proxiedRes.write = new Proxy(proxiedRes.write.bind(proxiedRes), {
    apply: (target: any, thisArg, args) => {
      target.call(thisArg, ...args);
      buffer.push(["write", args]);
    },
  });
  proxiedRes.setHeader = new Proxy(proxiedRes.setHeader.bind(proxiedRes), {
    apply: (target: any, thisArg, args) => {
      target.call(thisArg, ...args);
      buffer.push(["setHeader", args]);
    },
  });
  proxiedRes.removeHeader = new Proxy(proxiedRes.removeHeader.bind(proxiedRes), {
    apply: (target: any, thisArg, args) => {
      target.call(thisArg, ...args);
      buffer.push(["removeHeader", args]);
    },
  });
  proxiedRes.writeHead = new Proxy(proxiedRes.writeHead.bind(proxiedRes), {
    apply: (target: any, thisArg, args) => {
      target.call(thisArg, ...args);
      buffer.push(["writeHead", args]);
    },
  });
  proxiedRes.end = new Proxy(proxiedRes.end.bind(proxiedRes), {
    apply: (target: any, thisArg, args) => {
      target.call(thisArg, ...args);
      if (proxiedRes.statusCode === 404) {
        next();
      } else {
        for (const [fn, args] of buffer) {
          (res as any)[fn](...args);
        }
        res.end(...args);
      }
    },
  });
  return proxiedRes;
}
