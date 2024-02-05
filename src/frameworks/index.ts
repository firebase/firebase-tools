import { join, relative, basename, posix } from "path";
import { exit } from "process";
import { execSync } from "child_process";
import { sync as spawnSync } from "cross-spawn";
import { copyFile, readdir, readFile, rm, writeFile } from "fs/promises";
import { mkdirp, pathExists, stat } from "fs-extra";
import * as process from "node:process";
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
import * as experiments from "../experiments";
import { implicitInit } from "../hosting/implicitInit";
import {
  findDependency,
  conjoinOptions,
  frameworksCallToAction,
  getFrameworksBuildTarget,
} from "./utils";
import {
  ALLOWED_SSR_REGIONS,
  DEFAULT_REGION,
  DEFAULT_SHOULD_USE_DEV_MODE_HANDLE,
  FIREBASE_ADMIN_VERSION,
  FIREBASE_FRAMEWORKS_VERSION,
  FIREBASE_FUNCTIONS_VERSION,
  GET_DEFAULT_BUILD_TARGETS,
  I18N_ROOT,
  NODE_VERSION,
  SupportLevelWarnings,
  VALID_ENGINES,
} from "./constants";
import {
  BUILD_TARGET_PURPOSE,
  BuildResult,
  FirebaseDefaults,
  Framework,
  FrameworkContext,
  FrameworksOptions,
} from "./interfaces";
import { logWarning } from "../utils";
import { ensureTargeted } from "../functions/ensureTargeted";
import { isDeepStrictEqual } from "util";
import { resolveProjectPath } from "../projectPath";
import { logger } from "../logger";
import { WebFrameworks } from "./frameworks";

export { WebFrameworks };

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

const BUILD_MEMO = new Map<string[], Promise<BuildResult | void>>();

// Memoize the build based on both the dir and the environment variables
function memoizeBuild(
  dir: string,
  build: Framework["build"],
  deps: any[],
  target: string,
  context: FrameworkContext,
): ReturnType<Framework["build"]> {
  const key = [dir, ...deps];
  for (const existingKey of BUILD_MEMO.keys()) {
    if (isDeepStrictEqual(existingKey, key)) {
      return BUILD_MEMO.get(existingKey) as ReturnType<Framework["build"]>;
    }
  }
  const value = build(dir, target, context);
  BUILD_MEMO.set(key, value);
  return value;
}

/**
 * Use a function to ensure the same codebase name is used here and
 * during hosting deploy.
 */
export function generateSSRCodebaseId(site: string) {
  return `firebase-frameworks-${site}`;
}

/**
 *
 */
export async function prepareFrameworks(
  purpose: BUILD_TARGET_PURPOSE,
  targetNames: string[],
  context: FrameworkContext | undefined,
  options: FrameworksOptions,
  emulators: EmulatorInfo[] = [],
): Promise<void> {
  const project = needProjectId(context || options);
  const projectRoot = resolveProjectPath(options, ".");
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
    const omitCloudFunction = frameworksBackend?.omit ?? false;
    if (!allowedRegionsValues.includes(ssrRegion)) {
      const validRegions = conjoinOptions(allowedRegionsValues);
      throw new FirebaseError(
        `Hosting config for site ${site} places server-side content in region ${ssrRegion} which is not known. Valid regions are ${validRegions}`,
      );
    }
    const getProjectPath = (...args: string[]) => join(projectRoot, source, ...args);
    // Combined traffic tag (19 chars) and functionId cannot exceed 46 characters.
    const functionId = `ssr${site.toLowerCase().replace(/-/g, "").substring(0, 20)}`;
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
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`,
            );
            firebaseDefaults ||= {};
            firebaseDefaults.config = JSON.parse(defaultConfig.json);
          } else {
            // N.B. None of us know when this can ever happen and the deploy would
            // still succeed. Maaaaybe if someone tried calling firebase serve
            // on a project that never initialized hosting?
            console.warn(
              `No Firebase app associated with site ${site}, unable to provide authenticated server context.
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`,
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
    if (!results) {
      throw new FirebaseError(
        frameworksCallToAction(
          "Unable to detect the web framework in use, check firebase-debug.log for more info.",
        ),
      );
    }
    const { framework, mayWantBackend } = results;
    const {
      build,
      ɵcodegenPublicDirectory,
      ɵcodegenFunctionsDirectory: codegenProdModeFunctionsDirectory,
      getDevModeHandle,
      name,
      support,
      docsUrl,
      supportedRange,
      getValidBuildTargets = GET_DEFAULT_BUILD_TARGETS,
      shouldUseDevModeHandle = DEFAULT_SHOULD_USE_DEV_MODE_HANDLE,
    } = WebFrameworks[framework];

    logger.info(
      `\n${frameworksCallToAction(
        SupportLevelWarnings[support](name),
        docsUrl,
        "   ",
        name,
        results.version,
        supportedRange,
        results.vite,
      )}\n`,
    );

    const hostingEmulatorInfo = emulators.find((e) => e.name === Emulators.HOSTING);
    const validBuildTargets = await getValidBuildTargets(purpose, getProjectPath());
    const frameworksBuildTarget = getFrameworksBuildTarget(purpose, validBuildTargets);
    const useDevModeHandle =
      purpose !== "deploy" &&
      (await shouldUseDevModeHandle(frameworksBuildTarget, getProjectPath()));

    const frameworkContext: FrameworkContext = {
      projectId: project,
      site: options.site,
      hostingChannel: context?.hostingChannel,
    };

    let codegenFunctionsDirectory: Framework["ɵcodegenFunctionsDirectory"];
    let baseUrl = "";
    const rewrites = [];
    const redirects = [];
    const headers = [];

    const devModeHandle =
      useDevModeHandle &&
      getDevModeHandle &&
      (await getDevModeHandle(getProjectPath(), frameworksBuildTarget, hostingEmulatorInfo));
    if (devModeHandle) {
      // Attach the handle to options, it will be used when spinning up superstatic
      options.frameworksDevModeHandle = devModeHandle;
      // null is the dev-mode entry for firebase-framework-tools
      if (mayWantBackend && firebaseDefaults) {
        codegenFunctionsDirectory = codegenDevModeFunctionsDirectory;
      }
    } else {
      const buildResult = await memoizeBuild(
        getProjectPath(),
        build,
        [firebaseDefaults, frameworksBuildTarget],
        frameworksBuildTarget,
        frameworkContext,
      );
      const { wantsBackend = false, trailingSlash, i18n = false }: BuildResult = buildResult || {};

      if (buildResult) {
        baseUrl = buildResult.baseUrl ?? baseUrl;
        if (buildResult.headers) headers.push(...buildResult.headers);
        if (buildResult.rewrites) rewrites.push(...buildResult.rewrites);
        if (buildResult.redirects) redirects.push(...buildResult.redirects);
      }

      config.trailingSlash ??= trailingSlash;
      if (i18n) config.i18n ??= { root: I18N_ROOT };

      if (await pathExists(hostingDist)) await rm(hostingDist, { recursive: true });
      await mkdirp(hostingDist);

      await ɵcodegenPublicDirectory(getProjectPath(), hostingDist, frameworksBuildTarget, {
        project,
        site,
      });

      if (wantsBackend && !omitCloudFunction)
        codegenFunctionsDirectory = codegenProdModeFunctionsDirectory;
    }
    config.public = relative(projectRoot, hostingDist);
    config.webFramework = `${framework}${codegenFunctionsDirectory ? "_ssr" : ""}`;
    if (codegenFunctionsDirectory) {
      if (firebaseDefaults) {
        firebaseDefaults._authTokenSyncURL = "/__session";
        process.env.__FIREBASE_DEFAULTS__ = JSON.stringify(firebaseDefaults);
      }

      if (context?.hostingChannel) {
        experiments.assertEnabled(
          "pintags",
          "deploy an app that requires a backend to a preview channel",
        );
      }

      const codebase = generateSSRCodebaseId(site);
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

      // N.B. the pin-tags experiment already does this holistically later.
      // This is just a fallback for previous behavior if the user manually
      // disables the pintags experiment (e.g. there is a break and they would
      // rather disable the experiment than roll back).
      if (!experiments.isEnabled("pintags") || purpose !== "deploy") {
        if (!targetNames.includes("functions")) {
          targetNames.unshift("functions");
        }
        if (options.only) {
          options.only = ensureTargeted(options.only, codebase);
        }
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
        dotEnv = {},
        rewriteSource,
      } = await codegenFunctionsDirectory(
        getProjectPath(),
        functionsDist,
        frameworksBuildTarget,
        frameworkContext,
      );

      const rewrite = {
        source: rewriteSource || posix.join(baseUrl, "**"),
        function: {
          functionId,
          region: ssrRegion,
          pinTag: experiments.isEnabled("pintags"),
        },
      };

      // If the rewriteSource is overridden, we're talking a very specific rewrite. E.g, Image Optimization
      // in this case, we should ensure that it's the first priority—otherwise defer to the push/unshift
      // logic based off the baseUrl
      if (rewriteSource) {
        config.rewrites.unshift(rewrite);
      } else {
        rewrites.push(rewrite);
      }

      // Set the framework entry in the env variables to handle generation of the functions.yaml
      process.env.__FIREBASE_FRAMEWORKS_ENTRY__ = frameworksEntry;

      packageJson.main = "server.js";
      packageJson.dependencies ||= {};
      packageJson.dependencies["firebase-frameworks"] ||= FIREBASE_FRAMEWORKS_VERSION;
      packageJson.dependencies["firebase-functions"] ||= FIREBASE_FUNCTIONS_VERSION;
      packageJson.dependencies["firebase-admin"] ||= FIREBASE_ADMIN_VERSION;
      packageJson.engines ||= {};
      const validEngines = VALID_ENGINES.node.filter((it) => it <= NODE_VERSION);
      const engine = validEngines[validEngines.length - 1] || VALID_ENGINES.node[0];
      if (engine !== NODE_VERSION) {
        logWarning(
          `This integration expects Node version ${conjoinOptions(
            VALID_ENGINES.node,
            "or",
          )}. You're running version ${NODE_VERSION}, problems may be encountered.`,
        );
      }
      packageJson.engines.node ||= engine.toString();
      delete packageJson.scripts;
      delete packageJson.devDependencies;

      const bundledDependencies: Record<string, string> = packageJson.bundledDependencies || {};
      if (Object.keys(bundledDependencies).length) {
        logWarning(
          "Bundled dependencies aren't supported in Cloud Functions, converting to dependencies.",
        );
        for (const [dep, version] of Object.entries(bundledDependencies)) {
          packageJson.dependencies[dep] ||= version;
        }
        delete packageJson.bundledDependencies;
      }

      for (const [name, version] of Object.entries(
        packageJson.dependencies as Record<string, string>,
      )) {
        if (version.startsWith("file:")) {
          const path = version.replace(/^file:/, "");
          if (!(await pathExists(path))) continue;
          const stats = await stat(path);
          if (stats.isDirectory()) {
            const result = spawnSync(
              "npm",
              ["pack", relative(functionsDist, path), "--json=true"],
              {
                cwd: functionsDist,
              },
            );
            if (result.status !== 0)
              throw new FirebaseError(`Error running \`npm pack\` at ${path}`);
            const { filename } = JSON.parse(result.stdout.toString())[0];
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
        join(functionsDist, "package-lock.json"),
      ).catch(() => {
        // continue
      });

      if (await pathExists(getProjectPath(".npmrc"))) {
        await copyFile(getProjectPath(".npmrc"), join(functionsDist, ".npmrc"));
      }

      let dotEnvContents = "";
      if (await pathExists(getProjectPath(".env"))) {
        dotEnvContents = (await readFile(getProjectPath(".env"))).toString();
      }

      for (const [key, value] of Object.entries(dotEnv)) {
        dotEnvContents += `\n${key}=${value}`;
      }

      await writeFile(
        join(functionsDist, ".env"),
        `${dotEnvContents}
__FIREBASE_FRAMEWORKS_ENTRY__=${frameworksEntry}
${
  firebaseDefaults ? `__FIREBASE_DEFAULTS__=${JSON.stringify(firebaseDefaults)}\n` : ""
}`.trimStart(),
      );

      const envs = await new Promise<string[]>((resolve, reject) =>
        glob(getProjectPath(".env.*"), (err, matches) => {
          if (err) reject(err);
          resolve(matches);
        }),
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
    frameworksBackend || {},
  )}, (req, res) => server.then(it => it.handle(req, res)));
  `,
        );
      } else {
        await writeFile(
          join(functionsDist, "server.js"),
          `const { onRequest } = require('firebase-functions/v2/https');
  const server = import('firebase-frameworks');
  exports.${functionId} = onRequest(${JSON.stringify(
    frameworksBackend || {},
  )}, (req, res) => server.then(it => it.handle(req, res)));
  `,
        );
      }
    } else {
      if (await pathExists(functionsDist)) {
        await rm(functionsDist, { recursive: true });
      }
    }

    const ourConfigShouldComeFirst = !["", "/"].includes(baseUrl);
    const operation = ourConfigShouldComeFirst ? "unshift" : "push";

    config.rewrites[operation](...rewrites);
    config.redirects[operation](...redirects);
    config.headers[operation](...headers);

    if (firebaseDefaults) {
      const encodedDefaults = Buffer.from(JSON.stringify(firebaseDefaults)).toString("base64url");
      const expires = new Date(new Date().getTime() + 60_000_000_000);
      const sameSite = "Strict";
      const path = `/`;
      config.headers.push({
        source: posix.join(baseUrl, "**", "*.[jt]s"),
        headers: [
          {
            key: "Set-Cookie",
            value: `__FIREBASE_DEFAULTS__=${encodedDefaults}; SameSite=${sameSite}; Expires=${expires.toISOString()}; Path=${path};`,
          },
        ],
      });
    }
  }

  logger.debug(
    "[web frameworks] effective firebase.json: ",
    JSON.stringify({ hosting: configs, functions: options.config.get("functions") }, undefined, 2),
  );

  // Clean up memos/caches
  BUILD_MEMO.clear();

  // Clean up ENV variables, if were emulatoring .env won't override
  // this is leads to failures if we're hosting multiple sites
  delete process.env.__FIREBASE_DEFAULTS__;
  delete process.env.__FIREBASE_FRAMEWORKS_ENTRY__;
}

function codegenDevModeFunctionsDirectory() {
  const packageJson = {};
  return Promise.resolve({ packageJson, frameworksEntry: "_devMode" });
}
