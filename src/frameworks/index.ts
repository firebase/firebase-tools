import { join, relative, extname, basename } from "path";
import { exit } from "process";
import { execSync } from "child_process";
import { sync as spawnSync } from "cross-spawn";
import { readdirSync, statSync } from "fs";
import { pathToFileURL } from "url";
import { IncomingMessage, ServerResponse } from "http";
import { copyFile, readdir, readFile, rm, writeFile } from "fs/promises";
import { mkdirp, pathExists, stat } from "fs-extra";
import * as clc from "colorette";
import * as process from "node:process";
import * as semver from "semver";
import * as glob from "glob";

import { needProjectId } from "../projectUtils";
import { hostingConfig } from "../hosting/config";
import { listSites } from "../hosting/api";
import { getAppConfig, AppPlatform } from "../management/apps";
import { promptOnce } from "../prompt";
import { EmulatorInfo, Emulators, EMULATORS_SUPPORTED_BY_USE_EMULATOR } from "../emulator/types";
import { getCredentialPathAsync } from "../defaultCredentials";
import { getProjectDefaultAccount } from "../auth";
import { formatHost } from "../emulator/functionsEmulatorShared";
import { Constants } from "../emulator/constants";
import { FirebaseError } from "../error";
import { requireHostingSite } from "../requireHostingSite";
import { HostingRewrites } from "../firebaseConfig";
import * as experiments from "../experiments";
import { ensureTargeted } from "../functions/ensureTargeted";
import { implicitInit } from "../hosting/implicitInit";
import { fileExistsSync } from "../fsutils";

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
  trailingSlash?: boolean;
}

export interface Framework {
  discover: (dir: string) => Promise<Discovery | undefined>;
  type: FrameworkType;
  name: string;
  build: (dir: string) => Promise<BuildResult | void>;
  support: SupportLevel;
  init?: (setup: any, config: any) => Promise<void>;
  getDevModeHandle?: (
    dir: string,
    hostingEmulatorInfo?: EmulatorInfo
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
  Experimental = "experimental",
  Community = "community-supported",
}

const SupportLevelWarnings = {
  [SupportLevel.Experimental]: clc.yellow(
    `This is an experimental integration, proceed with caution.`
  ),
  [SupportLevel.Community]: clc.yellow(
    `This is a community-supported integration, support is best effort.`
  ),
};

export const FIREBASE_FRAMEWORKS_VERSION = "^0.7.0";
export const FIREBASE_FUNCTIONS_VERSION = "^3.23.0";
export const FIREBASE_ADMIN_VERSION = "^11.0.1";
export const NODE_VERSION = parseInt(process.versions.node, 10).toString();
export const DEFAULT_REGION = "us-central1";
export const ALLOWED_SSR_REGIONS = [
  { name: "us-central1 (Iowa)", value: "us-central1" },
  { name: "us-west1 (Oregon)", value: "us-west1" },
  { name: "us-east1 (South Carolina)", value: "us-east1" },
  { name: "europe-west1 (Belgium)", value: "europe-west1" },
  { name: "asia-east1 (Taiwan)", value: "asia-east1" },
];

const DEFAULT_FIND_DEP_OPTIONS: FindDepOptions = {
  cwd: process.cwd(),
  omitDev: true,
};

export const WebFrameworks: Record<string, Framework> = Object.fromEntries(
  readdirSync(__dirname)
    .filter((path) => statSync(join(__dirname, path)).isDirectory())
    .map((path) => {
      // If not called by the CLI, (e.g., by the VS Code Extension)
      // __dirname won't refer to this folder and these files won't be available.
      // Instead it may find sibling folders that aren't modules, and this
      // require will throw.
      // Long term fix may be to bundle this instead of reading files at runtime
      // but for now, this prevents crashing.
      try {
        return [path, require(join(__dirname, path))];
      } catch (e) {
        return [];
      }
    })
    .filter(
      ([, obj]) =>
        obj && obj.name && obj.discover && obj.build && obj.type !== undefined && obj.support
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
// Nuxt 2
export function relativeRequire(dir: string, mod: "nuxt/dist/nuxt.js"): Promise<any>;
// Nuxt 3
export function relativeRequire(dir: string, mod: "@nuxt/kit"): Promise<any>;

/**
 *
 */
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

/**
 *
 */
export async function discover(dir: string, warn = true) {
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
      if (warn) console.error("Multiple conflicting frameworks discovered.");
      return;
    }
    if (frameworksDiscovered.length === 1) return frameworksDiscovered[0];
  }
  if (warn) console.warn("Could not determine the web framework in use.");
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

export function getNodeModuleBin(name: string, cwd: string) {
  const cantFindExecutable = new FirebaseError(`Could not find the ${name} executable.`);
  const npmRoot = spawnSync("npm", ["root"], { cwd }).stdout?.toString().trim();
  if (!npmRoot) {
    throw cantFindExecutable;
  }
  const path = join(npmRoot, ".bin", name);
  if (!fileExistsSync(path)) {
    throw cantFindExecutable;
  }
  return path;
}

/**
 *
 */
export function findDependency(name: string, options: Partial<FindDepOptions> = {}) {
  const { cwd: dir, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const cwd = spawnSync("npm", ["root"], { cwd: dir }).stdout?.toString().trim();
  if (!cwd) return;
  const env: any = Object.assign({}, process.env);
  delete env.NODE_ENV;
  const result = spawnSync(
    "npm",
    [
      "list",
      name,
      "--json",
      ...(omitDev ? ["--omit", "dev"] : []),
      ...(depth === undefined ? [] : ["--depth", depth.toString(10)]),
    ],
    { cwd, env }
  );
  if (!result.stdout) return;
  const json = JSON.parse(result.stdout.toString());
  return scanDependencyTree(name, json.dependencies);
}

/**
 *
 */
export async function prepareFrameworks(
  targetNames: string[],
  context: any,
  options: any,
  emulators: EmulatorInfo[] = []
): Promise<void> {
  // `firebase-frameworks` requires Node >= 16. We must check for this to avoid horrible errors.
  const nodeVersion = process.version;
  if (!semver.satisfies(nodeVersion, ">=16.0.0")) {
    throw new FirebaseError(
      `The frameworks awareness feature requires Node.JS >= 16 and npm >= 8 in order to work correctly, due to some of the downstream dependencies. Please upgrade your version of Node.JS, reinstall firebase-tools, and give it another go.`
    );
  }

  const project = needProjectId(context);
  const { projectRoot } = options;
  const account = getProjectDefaultAccount(projectRoot);
  // options.site is not present when emulated. We could call requireHostingSite but IAM permissions haven't
  // been booted up (at this point) and we may be offline, so just use projectId. Most of the time
  // the default site is named the same as the project & for frameworks this is only used for naming the
  // function... unless you're using authenticated server-context TODO explore the implication here.

  // N.B. Trying to work around this in a rush but it's not 100% clear what to do here.
  // The code previously injected a cache for the hosting options after specifying site: project
  // temporarily in options. But that means we're caching configs with the wrong
  // site specified. As a compromise we'll do our best to set the correct site,
  // which should succeed when this method is being called from "deploy". I don't
  // think this breaks any other situation because we don't need a site during
  // emulation unless we have multiple sites, in which case we're guaranteed to
  // either have site or target set.
  if (!options.site) {
    try {
      await requireHostingSite(options);
    } catch {
      options.site = project;
    }
  }
  const configs = hostingConfig(options);
  let firebaseDefaults: FirebaseDefaults | undefined = undefined;
  if (configs.length === 0) {
    return;
  }
  const allowedRegionsValues = ALLOWED_SSR_REGIONS.map((r) => r.value);
  for (const config of configs) {
    const { source, site, public: publicDir, frameworksBackend } = config;
    if (!source) {
      continue;
    }
    config.rewrites ||= [];
    config.redirects ||= [];
    config.headers ||= [];
    config.cleanUrls ??= true;
    const dist = join(projectRoot, ".firebase", site);
    const hostingDist = join(dist, "hosting");
    const functionsDist = join(dist, "functions");
    if (publicDir) {
      throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
    }
    const ssrRegion = frameworksBackend?.region ?? DEFAULT_REGION;
    if (!allowedRegionsValues.includes(ssrRegion)) {
      const validRegions = allowedRegionsValues.join(", ");
      throw new FirebaseError(
        `Hosting config for site ${site} places server-side content in region ${ssrRegion} which is not known. Valid regions are ${validRegions}`
      );
    }
    const getProjectPath = (...args: string[]) => join(projectRoot, source, ...args);
    const functionId = `ssr${site.toLowerCase().replace(/-/g, "")}`;
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
      if (usesFirebaseJsSdk && EMULATORS_SUPPORTED_BY_USE_EMULATOR.includes(info.name)) {
        firebaseDefaults ||= {};
        firebaseDefaults.emulatorHosts ||= {};
        firebaseDefaults.emulatorHosts[info.name] = formatHost(info);
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
          const defaultConfig = await implicitInit(options);
          if (defaultConfig.json) {
            console.warn(
              `No Firebase app associated with site ${site}, injecting project default config.
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`
            );
            firebaseDefaults ||= {};
            firebaseDefaults.config = JSON.parse(defaultConfig.json);
          } else {
            // N.B. None of us know when this can ever happen and the deploy would
            // still succeed. Maaaaybe if someone tried calling firebase serve
            // on a project that never initialized hosting?
            console.warn(
              `No Firebase app associated with site ${site}, unable to provide authenticated server context.
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`
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
    }
    if (firebaseDefaults) {
      process.env.__FIREBASE_DEFAULTS__ = JSON.stringify(firebaseDefaults);
    }
    const results = await discover(getProjectPath());
    if (!results)
      throw new FirebaseError(
        "Unable to detect the web framework in use, check firebase-debug.log for more info."
      );
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

    const hostingEmulatorInfo = emulators.find((e) => e.name === Emulators.HOSTING);

    const devModeHandle =
      isDevMode &&
      getDevModeHandle &&
      (await getDevModeHandle(getProjectPath(), hostingEmulatorInfo));
    let codegenFunctionsDirectory: Framework["ɵcodegenFunctionsDirectory"];
    if (devModeHandle) {
      config.public = relative(projectRoot, publicDirectory);
      // Attach the handle to options, it will be used when spinning up superstatic
      options.frameworksDevModeHandle = devModeHandle;
      // null is the dev-mode entry for firebase-framework-tools
      if (mayWantBackend && firebaseDefaults) {
        codegenFunctionsDirectory = codegenDevModeFunctionsDirectory;
      }
    } else {
      const {
        wantsBackend = false,
        rewrites = [],
        redirects = [],
        headers = [],
        trailingSlash,
      } = (await build(getProjectPath())) || {};
      config.rewrites.push(...rewrites);
      config.redirects.push(...redirects);
      config.headers.push(...headers);
      config.trailingSlash ??= trailingSlash;
      if (await pathExists(hostingDist)) await rm(hostingDist, { recursive: true });
      await mkdirp(hostingDist);
      await ɵcodegenPublicDirectory(getProjectPath(), hostingDist);
      config.public = relative(projectRoot, hostingDist);
      if (wantsBackend) codegenFunctionsDirectory = codegenProdModeFunctionsDirectory;
    }
    config.webFramework = `${framework}${codegenFunctionsDirectory ? "_ssr" : ""}`;
    if (codegenFunctionsDirectory) {
      if (firebaseDefaults) {
        firebaseDefaults._authTokenSyncURL = "/__session";
        process.env.__FIREBASE_DEFAULTS__ = JSON.stringify(firebaseDefaults);
      }

      const rewrite: HostingRewrites = {
        source: "**",
        function: {
          functionId,
        },
      };
      if (experiments.isEnabled("pintags")) {
        rewrite.function.pinTag = true;
      }
      config.rewrites.push(rewrite);

      const codebase = `firebase-frameworks-${site}`;
      const existingFunctionsConfig = options.config.get("functions")
        ? [].concat(options.config.get("functions"))
        : [];
      options.config.set("functions", [
        ...existingFunctionsConfig,
        {
          source: relative(projectRoot, functionsDist),
          codebase,
        },
      ]);

      if (!targetNames.includes("functions")) {
        targetNames.unshift("functions");
      }
      if (options.only) {
        options.only = ensureTargeted(options.only, codebase);
      }

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

      // Set the framework entry in the env variables to handle generation of the functions.yaml
      process.env.__FIREBASE_FRAMEWORKS_ENTRY__ = frameworksEntry;

      packageJson.main = "server.js";
      delete packageJson.devDependencies;
      packageJson.dependencies ||= {};
      packageJson.dependencies["firebase-frameworks"] ||= FIREBASE_FRAMEWORKS_VERSION;
      packageJson.dependencies["firebase-functions"] ||= FIREBASE_FUNCTIONS_VERSION;
      packageJson.dependencies["firebase-admin"] ||= FIREBASE_ADMIN_VERSION;
      packageJson.engines ||= {};
      packageJson.engines.node ||= NODE_VERSION;

      for (const [name, version] of Object.entries(
        packageJson.dependencies as Record<string, string>
      )) {
        if (version.startsWith("file:")) {
          const path = version.replace(/^file:/, "");
          if (!(await pathExists(path))) continue;
          const stats = await stat(path);
          if (stats.isDirectory()) {
            const result = spawnSync("npm", ["pack", relative(functionsDist, path)], {
              cwd: functionsDist,
            });
            if (!result.stdout) throw new Error(`Error running \`npm pack\` at ${path}`);
            const filename = result.stdout.toString().trim();
            packageJson.dependencies[name] = `file:${filename}`;
          } else {
            const filename = basename(path);
            await copyFile(path, join(functionsDist, filename));
            packageJson.dependencies[name] = `file:${filename}`;
          }
        }
      }
      await writeFile(join(functionsDist, "package.json"), JSON.stringify(packageJson, null, 2));

      await copyFile(
        getProjectPath("package-lock.json"),
        join(functionsDist, "package-lock.json")
      ).catch(() => {
        // continue
      });

      if (await pathExists(getProjectPath(".npmrc"))) {
        await copyFile(getProjectPath(".npmrc"), join(functionsDist, ".npmrc"));
      }

      let existingDotEnvContents = "";
      if (await pathExists(getProjectPath(".env"))) {
        existingDotEnvContents = (await readFile(getProjectPath(".env"))).toString();
      }

      await writeFile(
        join(functionsDist, ".env"),
        `${existingDotEnvContents}
__FIREBASE_FRAMEWORKS_ENTRY__=${frameworksEntry}
${firebaseDefaults ? `__FIREBASE_DEFAULTS__=${JSON.stringify(firebaseDefaults)}\n` : ""}`
      );

      const envs = await new Promise<string[]>((resolve, reject) =>
        glob(getProjectPath(".env.*"), (err, matches) => {
          if (err) reject(err);
          resolve(matches);
        })
      );

      await Promise.all(envs.map((path) => copyFile(path, join(functionsDist, basename(path)))));

      execSync(`npm i --omit dev --no-audit`, {
        cwd: functionsDist,
        stdio: "inherit",
      });

      if (bootstrapScript) await writeFile(join(functionsDist, "bootstrap.js"), bootstrapScript);

      // TODO move to templates

      if (packageJson.type === "module") {
        await writeFile(
          join(functionsDist, "server.js"),
          `import { onRequest } from 'firebase-functions/v2/https';
  const server = import('firebase-frameworks');
  export const ${functionId} = onRequest(${JSON.stringify(
            frameworksBackend || {}
          )}, (req, res) => server.then(it => it.handle(req, res)));
  `
        );
      } else {
        await writeFile(
          join(functionsDist, "server.js"),
          `const { onRequest } = require('firebase-functions/v2/https');
  const server = import('firebase-frameworks');
  exports.${functionId} = onRequest(${JSON.stringify(
            frameworksBackend || {}
          )}, (req, res) => server.then(it => it.handle(req, res)));
  `
        );
      }
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
