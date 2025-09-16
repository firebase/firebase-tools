"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareFrameworks = exports.generateSSRCodebaseId = exports.discover = exports.WebFrameworks = void 0;
const path_1 = require("path");
const process_1 = require("process");
const child_process_1 = require("child_process");
const cross_spawn_1 = require("cross-spawn");
const promises_1 = require("fs/promises");
const fs_extra_1 = require("fs-extra");
const glob_1 = require("glob");
const process = __importStar(require("node:process"));
const projectUtils_1 = require("../projectUtils");
const config_1 = require("../hosting/config");
const api_1 = require("../hosting/api");
const apps_1 = require("../management/apps");
const prompt_1 = require("../prompt");
const types_1 = require("../emulator/types");
const defaultCredentials_1 = require("../defaultCredentials");
const auth_1 = require("../auth");
const functionsEmulatorShared_1 = require("../emulator/functionsEmulatorShared");
const constants_1 = require("../emulator/constants");
const error_1 = require("../error");
const requireHostingSite_1 = require("../requireHostingSite");
const experiments = __importStar(require("../experiments"));
const implicitInit_1 = require("../hosting/implicitInit");
const utils_1 = require("./utils");
const constants_2 = require("./constants");
const utils_2 = require("../utils");
const ensureTargeted_1 = require("../functions/ensureTargeted");
const util_1 = require("util");
const projectPath_1 = require("../projectPath");
const logger_1 = require("../logger");
const frameworks_1 = require("./frameworks");
Object.defineProperty(exports, "WebFrameworks", { enumerable: true, get: function () { return frameworks_1.WebFrameworks; } });
const fetchWebSetup_1 = require("../fetchWebSetup");
/**
 *
 */
async function discover(dir, warn = true) {
    const allFrameworkTypes = [
        ...new Set(Object.values(frameworks_1.WebFrameworks).map(({ type }) => type)),
    ].sort();
    for (const discoveryType of allFrameworkTypes) {
        const frameworksDiscovered = [];
        for (const framework in frameworks_1.WebFrameworks) {
            if (frameworks_1.WebFrameworks[framework]) {
                const { discover, type } = frameworks_1.WebFrameworks[framework];
                if (type !== discoveryType)
                    continue;
                const result = await discover(dir);
                if (result)
                    frameworksDiscovered.push({ framework, ...result });
            }
        }
        if (frameworksDiscovered.length > 1) {
            if (warn)
                console.error("Multiple conflicting frameworks discovered.");
            return;
        }
        if (frameworksDiscovered.length === 1)
            return frameworksDiscovered[0];
    }
    if (warn)
        console.warn("Could not determine the web framework in use.");
    return;
}
exports.discover = discover;
const BUILD_MEMO = new Map();
// Memoize the build based on both the dir and the environment variables
function memoizeBuild(dir, build, deps, target, context) {
    const key = [dir, ...deps];
    for (const existingKey of BUILD_MEMO.keys()) {
        if ((0, util_1.isDeepStrictEqual)(existingKey, key)) {
            return BUILD_MEMO.get(existingKey);
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
function generateSSRCodebaseId(site) {
    return `firebase-frameworks-${site}`;
}
exports.generateSSRCodebaseId = generateSSRCodebaseId;
/**
 *
 */
async function prepareFrameworks(purpose, targetNames, context, options, emulators = []) {
    var _a, _b, _c, _d, _e;
    const project = (0, projectUtils_1.needProjectId)(context || options);
    const isDemoProject = constants_1.Constants.isDemoProject(project);
    const projectRoot = (0, projectPath_1.resolveProjectPath)(options, ".");
    const account = (0, auth_1.getProjectDefaultAccount)(projectRoot);
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
    if (isDemoProject) {
        options.site = project;
    }
    if (!options.site) {
        try {
            await (0, requireHostingSite_1.requireHostingSite)(options);
        }
        catch {
            options.site = project;
        }
    }
    const configs = (0, config_1.hostingConfig)(options);
    let firebaseDefaults = undefined;
    if (configs.length === 0) {
        return;
    }
    const allowedRegionsValues = constants_2.ALLOWED_SSR_REGIONS.map((r) => r.value);
    for (const config of configs) {
        const { source, site, public: publicDir, frameworksBackend } = config;
        if (!source) {
            continue;
        }
        config.rewrites || (config.rewrites = []);
        config.redirects || (config.redirects = []);
        config.headers || (config.headers = []);
        config.cleanUrls ?? (config.cleanUrls = true);
        const dist = (0, path_1.join)(projectRoot, ".firebase", site);
        const hostingDist = (0, path_1.join)(dist, "hosting");
        const functionsDist = (0, path_1.join)(dist, "functions");
        if (publicDir) {
            throw new Error(`hosting.public and hosting.source cannot both be set in firebase.json`);
        }
        const ssrRegion = frameworksBackend?.region ?? constants_2.DEFAULT_REGION;
        const omitCloudFunction = frameworksBackend?.omit ?? false;
        if (!allowedRegionsValues.includes(ssrRegion)) {
            const validRegions = (0, utils_1.conjoinOptions)(allowedRegionsValues);
            throw new error_1.FirebaseError(`Hosting config for site ${site} places server-side content in region ${ssrRegion} which is not known. Valid regions are ${validRegions}`);
        }
        const getProjectPath = (...args) => (0, path_1.join)(projectRoot, source, ...args);
        // Combined traffic tag (19 chars) and functionId cannot exceed 46 characters.
        const functionId = `ssr${site.toLowerCase().replace(/-/g, "").substring(0, 20)}`;
        const usesFirebaseAdminSdk = !!(0, utils_1.findDependency)("firebase-admin", { cwd: getProjectPath() });
        const usesFirebaseJsSdk = !!(0, utils_1.findDependency)("@firebase/app", { cwd: getProjectPath() });
        if (usesFirebaseAdminSdk) {
            process.env.GOOGLE_CLOUD_PROJECT = project;
            if (account && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                const defaultCredPath = await (0, defaultCredentials_1.getCredentialPathAsync)(account);
                if (defaultCredPath)
                    process.env.GOOGLE_APPLICATION_CREDENTIALS = defaultCredPath;
            }
        }
        emulators.forEach((info) => {
            if (usesFirebaseAdminSdk) {
                if (info.name === types_1.Emulators.FIRESTORE)
                    process.env[constants_1.Constants.FIRESTORE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(info);
                if (info.name === types_1.Emulators.AUTH)
                    process.env[constants_1.Constants.FIREBASE_AUTH_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(info);
                if (info.name === types_1.Emulators.DATABASE)
                    process.env[constants_1.Constants.FIREBASE_DATABASE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(info);
                if (info.name === types_1.Emulators.STORAGE)
                    process.env[constants_1.Constants.FIREBASE_STORAGE_EMULATOR_HOST] = (0, functionsEmulatorShared_1.formatHost)(info);
            }
            if (usesFirebaseJsSdk && types_1.EMULATORS_SUPPORTED_BY_USE_EMULATOR.includes(info.name)) {
                firebaseDefaults || (firebaseDefaults = {});
                firebaseDefaults.emulatorHosts || (firebaseDefaults.emulatorHosts = {});
                firebaseDefaults.emulatorHosts[info.name] = (0, functionsEmulatorShared_1.formatHost)(info);
            }
        });
        let firebaseConfig = null;
        if (usesFirebaseJsSdk) {
            const sites = isDemoProject ? (0, api_1.listDemoSites)(project) : await (0, api_1.listSites)(project);
            const selectedSite = sites.find((it) => it.name && it.name.split("/").pop() === site);
            if (selectedSite) {
                const { appId } = selectedSite;
                if (appId) {
                    firebaseConfig = isDemoProject
                        ? (0, fetchWebSetup_1.constructDefaultWebSetup)(project)
                        : await (0, apps_1.getAppConfig)(appId, apps_1.AppPlatform.WEB);
                    firebaseDefaults || (firebaseDefaults = {});
                    firebaseDefaults.config = firebaseConfig;
                }
                else {
                    const defaultConfig = await (0, implicitInit_1.implicitInit)(options);
                    if (defaultConfig.json) {
                        console.warn(`No Firebase app associated with site ${site}, injecting project default config.
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`);
                        firebaseDefaults || (firebaseDefaults = {});
                        firebaseDefaults.config = JSON.parse(defaultConfig.json);
                    }
                    else {
                        // N.B. None of us know when this can ever happen and the deploy would
                        // still succeed. Maaaaybe if someone tried calling firebase serve
                        // on a project that never initialized hosting?
                        console.warn(`No Firebase app associated with site ${site}, unable to provide authenticated server context.
  You can link a Web app to a Hosting site here https://console.firebase.google.com/project/${project}/settings/general/web`);
                        if (!options.nonInteractive) {
                            const continueDeploy = await (0, prompt_1.confirm)({
                                default: true,
                                message: "Would you like to continue with the deploy?",
                            });
                            if (!continueDeploy)
                                (0, process_1.exit)(1);
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
            throw new error_1.FirebaseError((0, utils_1.frameworksCallToAction)("Unable to detect the web framework in use, check firebase-debug.log for more info."));
        }
        const { framework, mayWantBackend } = results;
        const { build, ɵcodegenPublicDirectory, ɵcodegenFunctionsDirectory: codegenProdModeFunctionsDirectory, getDevModeHandle, name, support, docsUrl, supportedRange, getValidBuildTargets = constants_2.GET_DEFAULT_BUILD_TARGETS, shouldUseDevModeHandle = constants_2.DEFAULT_SHOULD_USE_DEV_MODE_HANDLE, } = frameworks_1.WebFrameworks[framework];
        logger_1.logger.info(`\n${(0, utils_1.frameworksCallToAction)(constants_2.SupportLevelWarnings[support](name), docsUrl, "   ", name, results.version, supportedRange, results.vite)}\n`);
        const hostingEmulatorInfo = emulators.find((e) => e.name === types_1.Emulators.HOSTING);
        const validBuildTargets = await getValidBuildTargets(purpose, getProjectPath());
        const frameworksBuildTarget = (0, utils_1.getFrameworksBuildTarget)(purpose, validBuildTargets);
        const useDevModeHandle = purpose !== "deploy" &&
            (await shouldUseDevModeHandle(frameworksBuildTarget, getProjectPath()));
        const frameworkContext = {
            projectId: project,
            site: options.site,
            hostingChannel: context?.hostingChannel,
        };
        let codegenFunctionsDirectory;
        let baseUrl = "";
        const rewrites = [];
        const redirects = [];
        const headers = [];
        const devModeHandle = useDevModeHandle &&
            getDevModeHandle &&
            (await getDevModeHandle(getProjectPath(), frameworksBuildTarget, hostingEmulatorInfo));
        if (devModeHandle) {
            // Attach the handle to options, it will be used when spinning up superstatic
            options.frameworksDevModeHandle = devModeHandle;
            // null is the dev-mode entry for firebase-framework-tools
            if (mayWantBackend && firebaseDefaults) {
                codegenFunctionsDirectory = codegenDevModeFunctionsDirectory;
            }
        }
        else {
            const buildResult = await memoizeBuild(getProjectPath(), build, [firebaseDefaults, frameworksBuildTarget], frameworksBuildTarget, frameworkContext);
            const { wantsBackend = false, trailingSlash, i18n = false } = buildResult || {};
            if (buildResult) {
                baseUrl = buildResult.baseUrl ?? baseUrl;
                if (buildResult.headers)
                    headers.push(...buildResult.headers);
                if (buildResult.rewrites)
                    rewrites.push(...buildResult.rewrites);
                if (buildResult.redirects)
                    redirects.push(...buildResult.redirects);
            }
            config.trailingSlash ?? (config.trailingSlash = trailingSlash);
            if (i18n)
                config.i18n ?? (config.i18n = { root: constants_2.I18N_ROOT });
            if (await (0, fs_extra_1.pathExists)(hostingDist))
                await (0, promises_1.rm)(hostingDist, { recursive: true });
            await (0, fs_extra_1.mkdirp)(hostingDist);
            await ɵcodegenPublicDirectory(getProjectPath(), hostingDist, frameworksBuildTarget, {
                project,
                site,
            });
            if (wantsBackend && !omitCloudFunction)
                codegenFunctionsDirectory = codegenProdModeFunctionsDirectory;
        }
        config.public = (0, path_1.relative)(projectRoot, hostingDist);
        config.webFramework = `${framework}${codegenFunctionsDirectory ? "_ssr" : ""}`;
        if (codegenFunctionsDirectory) {
            if (firebaseDefaults) {
                firebaseDefaults._authTokenSyncURL = "/__session";
                process.env.__FIREBASE_DEFAULTS__ = JSON.stringify(firebaseDefaults);
            }
            if (context?.hostingChannel) {
                experiments.assertEnabled("pintags", "deploy an app that requires a backend to a preview channel");
            }
            const codebase = generateSSRCodebaseId(site);
            const existingFunctionsConfig = options.config.get("functions")
                ? [].concat(options.config.get("functions"))
                : [];
            options.config.set("functions", [
                ...existingFunctionsConfig,
                {
                    source: (0, path_1.relative)(projectRoot, functionsDist),
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
                    options.only = (0, ensureTargeted_1.ensureTargeted)(options.only, codebase);
                }
            }
            // if exists, delete everything but the node_modules directory and package-lock.json
            // this should speed up repeated NPM installs
            if (await (0, fs_extra_1.pathExists)(functionsDist)) {
                const functionsDistStat = await (0, fs_extra_1.stat)(functionsDist);
                if (functionsDistStat?.isDirectory()) {
                    const files = await (0, promises_1.readdir)(functionsDist);
                    for (const file of files) {
                        if (file !== "node_modules" && file !== "package-lock.json")
                            await (0, promises_1.rm)((0, path_1.join)(functionsDist, file), { recursive: true });
                    }
                }
                else {
                    await (0, promises_1.rm)(functionsDist);
                }
            }
            else {
                await (0, fs_extra_1.mkdirp)(functionsDist);
            }
            const { packageJson, bootstrapScript, frameworksEntry = framework, dotEnv = {}, rewriteSource, } = await codegenFunctionsDirectory(getProjectPath(), functionsDist, frameworksBuildTarget, frameworkContext);
            const rewrite = {
                source: rewriteSource || path_1.posix.join(baseUrl, "**"),
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
            }
            else {
                rewrites.push(rewrite);
            }
            // Set the framework entry in the env variables to handle generation of the functions.yaml
            process.env.__FIREBASE_FRAMEWORKS_ENTRY__ = frameworksEntry;
            packageJson.main = "server.js";
            packageJson.dependencies || (packageJson.dependencies = {});
            (_a = packageJson.dependencies)["firebase-frameworks"] || (_a["firebase-frameworks"] = constants_2.FIREBASE_FRAMEWORKS_VERSION);
            (_b = packageJson.dependencies)["firebase-functions"] || (_b["firebase-functions"] = constants_2.FIREBASE_FUNCTIONS_VERSION);
            (_c = packageJson.dependencies)["firebase-admin"] || (_c["firebase-admin"] = constants_2.FIREBASE_ADMIN_VERSION);
            packageJson.engines || (packageJson.engines = {});
            const validEngines = constants_2.VALID_ENGINES.node.filter((it) => it <= constants_2.NODE_VERSION);
            const engine = validEngines[validEngines.length - 1] || constants_2.VALID_ENGINES.node[0];
            if (engine !== constants_2.NODE_VERSION) {
                (0, utils_2.logWarning)(`This integration expects Node version ${(0, utils_1.conjoinOptions)(constants_2.VALID_ENGINES.node, "or")}. You're running version ${constants_2.NODE_VERSION}, problems may be encountered.`);
            }
            (_d = packageJson.engines).node || (_d.node = engine.toString());
            delete packageJson.scripts;
            delete packageJson.devDependencies;
            const bundledDependencies = packageJson.bundledDependencies || {};
            if (Object.keys(bundledDependencies).length) {
                (0, utils_2.logWarning)("Bundled dependencies aren't supported in Cloud Functions, converting to dependencies.");
                for (const [dep, version] of Object.entries(bundledDependencies)) {
                    (_e = packageJson.dependencies)[dep] || (_e[dep] = version);
                }
                delete packageJson.bundledDependencies;
            }
            for (const [name, version] of Object.entries(packageJson.dependencies)) {
                if (version.startsWith("file:")) {
                    const path = version.replace(/^file:/, "");
                    if (!(await (0, fs_extra_1.pathExists)(path)))
                        continue;
                    const stats = await (0, fs_extra_1.stat)(path);
                    if (stats.isDirectory()) {
                        const result = (0, cross_spawn_1.sync)("npm", ["pack", (0, path_1.relative)(functionsDist, path), "--json=true"], {
                            cwd: functionsDist,
                        });
                        if (result.status !== 0)
                            throw new error_1.FirebaseError(`Error running \`npm pack\` at ${path}`);
                        const { filename } = JSON.parse(result.stdout.toString())[0];
                        packageJson.dependencies[name] = `file:${filename}`;
                    }
                    else {
                        const filename = (0, path_1.basename)(path);
                        await (0, promises_1.copyFile)(path, (0, path_1.join)(functionsDist, filename));
                        packageJson.dependencies[name] = `file:${filename}`;
                    }
                }
            }
            await (0, promises_1.writeFile)((0, path_1.join)(functionsDist, "package.json"), JSON.stringify(packageJson, null, 2));
            await (0, promises_1.copyFile)(getProjectPath("package-lock.json"), (0, path_1.join)(functionsDist, "package-lock.json")).catch(() => {
                // continue
            });
            if (await (0, fs_extra_1.pathExists)(getProjectPath(".npmrc"))) {
                await (0, promises_1.copyFile)(getProjectPath(".npmrc"), (0, path_1.join)(functionsDist, ".npmrc"));
            }
            let dotEnvContents = "";
            if (await (0, fs_extra_1.pathExists)(getProjectPath(".env"))) {
                dotEnvContents = (await (0, promises_1.readFile)(getProjectPath(".env"))).toString();
            }
            for (const [key, value] of Object.entries(dotEnv)) {
                dotEnvContents += `\n${key}=${value}`;
            }
            await (0, promises_1.writeFile)((0, path_1.join)(functionsDist, ".env"), `${dotEnvContents}
__FIREBASE_FRAMEWORKS_ENTRY__=${frameworksEntry}
${firebaseDefaults ? `__FIREBASE_DEFAULTS__=${JSON.stringify(firebaseDefaults)}\n` : ""}`.trimStart());
            const envs = await (0, glob_1.glob)(getProjectPath(".env.*"), { windowsPathsNoEscape: utils_2.IS_WINDOWS });
            await Promise.all(envs.map((path) => (0, promises_1.copyFile)(path, (0, path_1.join)(functionsDist, (0, path_1.basename)(path)))));
            (0, child_process_1.execSync)(`npm i --omit dev --no-audit`, {
                cwd: functionsDist,
                stdio: "inherit",
            });
            if (bootstrapScript)
                await (0, promises_1.writeFile)((0, path_1.join)(functionsDist, "bootstrap.js"), bootstrapScript);
            // TODO move to templates
            if (packageJson.type === "module") {
                await (0, promises_1.writeFile)((0, path_1.join)(functionsDist, "server.js"), `import { onRequest } from 'firebase-functions/v2/https';
  const server = import('firebase-frameworks');
  export const ${functionId} = onRequest(${JSON.stringify(frameworksBackend || {})}, (req, res) => server.then(it => it.handle(req, res)));
  `);
            }
            else {
                await (0, promises_1.writeFile)((0, path_1.join)(functionsDist, "server.js"), `const { onRequest } = require('firebase-functions/v2/https');
  const server = import('firebase-frameworks');
  exports.${functionId} = onRequest(${JSON.stringify(frameworksBackend || {})}, (req, res) => server.then(it => it.handle(req, res)));
  `);
            }
        }
        else {
            if (await (0, fs_extra_1.pathExists)(functionsDist)) {
                await (0, promises_1.rm)(functionsDist, { recursive: true });
            }
        }
        const ourConfigShouldComeFirst = !["", "/"].includes(baseUrl);
        const operation = ourConfigShouldComeFirst ? "unshift" : "push";
        config.rewrites[operation](...rewrites);
        config.redirects[operation](...redirects);
        config.headers[operation](...headers);
        if (firebaseDefaults) {
            const encodedDefaults = Buffer.from(JSON.stringify(firebaseDefaults)).toString("base64url");
            const expires = new Date(new Date().getTime() + 60000000000);
            const sameSite = "Strict";
            const path = `/`;
            config.headers.push({
                source: path_1.posix.join(baseUrl, "**", "*.[jt]s"),
                headers: [
                    {
                        key: "Set-Cookie",
                        value: `__FIREBASE_DEFAULTS__=${encodedDefaults}; SameSite=${sameSite}; Expires=${expires.toISOString()}; Path=${path};`,
                    },
                ],
            });
        }
    }
    logger_1.logger.debug("[web frameworks] effective firebase.json: ", JSON.stringify({ hosting: configs, functions: options.config.get("functions") }, undefined, 2));
    // Clean up memos/caches
    BUILD_MEMO.clear();
    // Clean up ENV variables, if were emulatoring .env won't override
    // this is leads to failures if we're hosting multiple sites
    delete process.env.__FIREBASE_DEFAULTS__;
    delete process.env.__FIREBASE_FRAMEWORKS_ENTRY__;
}
exports.prepareFrameworks = prepareFrameworks;
function codegenDevModeFunctionsDirectory() {
    const packageJson = {};
    return Promise.resolve({ packageJson, frameworksEntry: "_devMode" });
}
//# sourceMappingURL=index.js.map