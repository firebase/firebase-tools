"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBuilderType = exports.tryToGetOptionsForTarget = exports.getAngularVersion = exports.getBuildConfig = exports.getServerConfig = exports.getBrowserConfig = exports.getContext = exports.getAllTargets = exports.BuilderType = void 0;
const utils_1 = require("../utils");
const error_1 = require("../../error");
const path_1 = require("path");
const assert_1 = require("assert");
const utils_2 = require("../../utils");
const semver_1 = require("semver");
async function localesForTarget(dir, architectHost, target, workspaceProject) {
    var _a;
    const { targetStringFromTarget } = await (0, utils_1.relativeRequire)(dir, "@angular-devkit/architect");
    const targetOptions = await architectHost.getOptionsForTarget(target);
    if (!targetOptions) {
        const targetString = targetStringFromTarget(target);
        throw new error_1.FirebaseError(`Couldn't find options for ${targetString}.`);
    }
    let locales = undefined;
    let defaultLocale = undefined;
    if (targetOptions.localize) {
        const i18n = (_a = workspaceProject.extensions) === null || _a === void 0 ? void 0 : _a.i18n;
        if (!i18n)
            throw new error_1.FirebaseError(`No i18n config on project.`);
        if (typeof i18n.sourceLocale === "string") {
            throw new error_1.FirebaseError(`All your i18n locales must have a baseHref of "" on Firebase, use an object for sourceLocale in your angular.json:
  "i18n": {
    "sourceLocale": {
      "code": "${i18n.sourceLocale}",
      "baseHref": ""
    },
    ...
  }`);
        }
        if (i18n.sourceLocale.baseHref !== "")
            throw new error_1.FirebaseError('All your i18n locales must have a baseHref of "" on Firebase, errored on sourceLocale.');
        defaultLocale = i18n.sourceLocale.code;
        if (targetOptions.localize === true) {
            locales = [defaultLocale];
            for (const [locale, { baseHref }] of Object.entries(i18n.locales)) {
                if (baseHref !== "")
                    throw new error_1.FirebaseError(`All your i18n locales must have a baseHref of \"\" on Firebase, errored on ${locale}.`);
                locales.push(locale);
            }
        }
        else if (Array.isArray(targetOptions.localize)) {
            locales = [defaultLocale];
            for (const locale of targetOptions.localize) {
                if (typeof locale !== "string")
                    continue;
                locales.push(locale);
            }
        }
    }
    (0, utils_1.validateLocales)(locales);
    return { locales, defaultLocale };
}
var BuilderType;
(function (BuilderType) {
    BuilderType["DEPLOY"] = "deploy";
    BuilderType["DEV_SERVER"] = "dev-server";
    BuilderType["SSR_DEV_SERVER"] = "ssr-dev-server";
    BuilderType["SERVER"] = "server";
    BuilderType["BROWSER"] = "browser";
    BuilderType["BROWSER_ESBUILD"] = "browser-esbuild";
    BuilderType["APPLICATION"] = "application";
    BuilderType["PRERENDER"] = "prerender";
})(BuilderType = exports.BuilderType || (exports.BuilderType = {}));
const DEV_SERVER_TARGETS = [BuilderType.DEV_SERVER, BuilderType.SSR_DEV_SERVER];
function getValidBuilderTypes(purpose) {
    return [
        BuilderType.APPLICATION,
        BuilderType.BROWSER_ESBUILD,
        BuilderType.DEPLOY,
        BuilderType.BROWSER,
        BuilderType.PRERENDER,
        ...(purpose === "deploy" ? [] : DEV_SERVER_TARGETS),
    ];
}
async function getAllTargets(purpose, dir) {
    const validBuilderTypes = getValidBuilderTypes(purpose);
    const [{ NodeJsAsyncHost }, { workspaces }, { targetStringFromTarget }] = await Promise.all([
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/core/node"),
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/core"),
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/architect"),
    ]);
    const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
    const { workspace } = await workspaces.readWorkspace(dir, host);
    const targets = [];
    workspace.projects.forEach((projectDefinition, project) => {
        if (projectDefinition.extensions.projectType !== "application")
            return;
        projectDefinition.targets.forEach((targetDefinition, target) => {
            const builderType = getBuilderType(targetDefinition.builder);
            if (builderType && !validBuilderTypes.includes(builderType)) {
                return;
            }
            const configurations = Object.keys(targetDefinition.configurations || {});
            if (!configurations.includes("production"))
                configurations.push("production");
            if (!configurations.includes("development"))
                configurations.push("development");
            configurations.forEach((configuration) => {
                targets.push(targetStringFromTarget({ project, target, configuration }));
            });
        });
    });
    return targets;
}
exports.getAllTargets = getAllTargets;
// TODO(jamesdaniels) memoize, dry up
async function getContext(dir, targetOrConfiguration) {
    const [{ NodeJsAsyncHost }, { workspaces }, { WorkspaceNodeModulesArchitectHost }, { Architect, targetFromTargetString, targetStringFromTarget }, { parse },] = await Promise.all([
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/core/node"),
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/core"),
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/architect/node"),
        (0, utils_1.relativeRequire)(dir, "@angular-devkit/architect"),
        (0, utils_1.relativeRequire)(dir, "jsonc-parser"),
    ]);
    const host = workspaces.createWorkspaceHost(new NodeJsAsyncHost());
    const { workspace } = await workspaces.readWorkspace(dir, host);
    const architectHost = new WorkspaceNodeModulesArchitectHost(workspace, dir);
    const architect = new Architect(architectHost);
    let overrideTarget;
    let deployTarget;
    let project;
    let buildTarget;
    let browserTarget;
    let serverTarget;
    let prerenderTarget;
    let serveTarget;
    let serveOptimizedImages = false;
    let configuration = undefined;
    if (targetOrConfiguration) {
        try {
            overrideTarget = targetFromTargetString(targetOrConfiguration);
            configuration = overrideTarget.configuration;
            project = overrideTarget.project;
        }
        catch (e) {
            configuration = targetOrConfiguration;
        }
    }
    if (!project) {
        const angularJson = parse(await host.readFile((0, path_1.join)(dir, "angular.json")));
        project = angularJson.defaultProject;
    }
    if (!project) {
        const apps = [];
        workspace.projects.forEach((value, key) => {
            if (value.extensions.projectType === "application")
                apps.push(key);
        });
        if (apps.length === 1)
            project = apps[0];
    }
    if (!project) {
        throwCannotDetermineTarget();
    }
    const workspaceProject = workspace.projects.get(project);
    if (!workspaceProject)
        throw new error_1.FirebaseError(`No project ${project} found.`);
    if (overrideTarget) {
        const target = workspaceProject.targets.get(overrideTarget.target);
        const builderType = getBuilderType(target.builder);
        switch (builderType) {
            case BuilderType.DEPLOY:
                deployTarget = overrideTarget;
                break;
            case BuilderType.APPLICATION:
                buildTarget = overrideTarget;
                break;
            case BuilderType.BROWSER:
            case BuilderType.BROWSER_ESBUILD:
                browserTarget = overrideTarget;
                break;
            case BuilderType.PRERENDER:
                prerenderTarget = overrideTarget;
                break;
            case BuilderType.DEV_SERVER:
            case BuilderType.SSR_DEV_SERVER:
                serveTarget = overrideTarget;
                break;
            default:
                throw new error_1.FirebaseError(`builder type ${builderType} not known.`);
        }
    }
    else if (workspaceProject.targets.has("deploy")) {
        const { builder, defaultConfiguration = "production" } = workspaceProject.targets.get("deploy");
        if (getBuilderType(builder) === BuilderType.DEPLOY) {
            deployTarget = {
                project,
                target: "deploy",
                configuration: configuration || defaultConfiguration,
            };
        }
    }
    if (deployTarget) {
        const options = await architectHost
            .getOptionsForTarget(deployTarget)
            .catch(() => { var _a; return (_a = workspaceProject.targets.get(deployTarget.target)) === null || _a === void 0 ? void 0 : _a.options; });
        if (!options)
            throw new error_1.FirebaseError("Unable to get options for ng-deploy.");
        if (options.buildTarget) {
            (0, utils_2.assertIsString)(options.buildTarget);
            buildTarget = targetFromTargetString(options.buildTarget);
        }
        if (options.prerenderTarget) {
            (0, utils_2.assertIsString)(options.prerenderTarget);
            prerenderTarget = targetFromTargetString(options.prerenderTarget);
        }
        if (options.browserTarget) {
            (0, utils_2.assertIsString)(options.browserTarget);
            browserTarget = targetFromTargetString(options.browserTarget);
        }
        if (options.serverTarget) {
            (0, utils_2.assertIsString)(options.serverTarget);
            serverTarget = targetFromTargetString(options.serverTarget);
        }
        if (options.serveTarget) {
            (0, utils_2.assertIsString)(options.serveTarget);
            serveTarget = targetFromTargetString(options.serveTarget);
        }
        if (options.serveOptimizedImages) {
            serveOptimizedImages = true;
        }
        if (prerenderTarget) {
            const prerenderOptions = await architectHost.getOptionsForTarget(prerenderTarget);
            if (!browserTarget) {
                throw new error_1.FirebaseError("ng-deploy with prerenderTarget requires a browserTarget");
            }
            if (targetStringFromTarget(browserTarget) !== (prerenderOptions === null || prerenderOptions === void 0 ? void 0 : prerenderOptions.browserTarget)) {
                throw new error_1.FirebaseError("ng-deploy's browserTarget and prerender's browserTarget do not match. Please check your angular.json");
            }
            if (serverTarget && targetStringFromTarget(serverTarget) !== (prerenderOptions === null || prerenderOptions === void 0 ? void 0 : prerenderOptions.serverTarget)) {
                throw new error_1.FirebaseError("ng-deploy's serverTarget and prerender's serverTarget do not match. Please check your angular.json");
            }
            if (!serverTarget) {
                console.warn("Treating the application as fully rendered. Add a serverTarget to your deploy target in angular.json to utilize server-side rendering.");
            }
        }
        if (!buildTarget && !browserTarget) {
            throw new error_1.FirebaseError("ng-deploy is missing a build target. Plase check your angular.json.");
        }
    }
    else if (!overrideTarget) {
        if (workspaceProject.targets.has("prerender")) {
            const { defaultConfiguration = "production" } = workspaceProject.targets.get("prerender");
            prerenderTarget = {
                project,
                target: "prerender",
                configuration: configuration || defaultConfiguration,
            };
            const options = await architectHost.getOptionsForTarget(prerenderTarget);
            (0, utils_2.assertIsString)(options === null || options === void 0 ? void 0 : options.browserTarget);
            browserTarget = targetFromTargetString(options.browserTarget);
            (0, utils_2.assertIsString)(options === null || options === void 0 ? void 0 : options.serverTarget);
            serverTarget = targetFromTargetString(options.serverTarget);
        }
        if (!buildTarget && !browserTarget && workspaceProject.targets.has("build")) {
            const { builder, defaultConfiguration = "production" } = workspaceProject.targets.get("build");
            const builderType = getBuilderType(builder);
            const target = {
                project,
                target: "build",
                configuration: configuration || defaultConfiguration,
            };
            if (builderType === BuilderType.BROWSER || builderType === BuilderType.BROWSER_ESBUILD) {
                browserTarget = target;
            }
            else {
                buildTarget = target;
            }
        }
        if (!serverTarget && workspaceProject.targets.has("server")) {
            const { defaultConfiguration = "production" } = workspaceProject.targets.get("server");
            serverTarget = {
                project,
                target: "server",
                configuration: configuration || defaultConfiguration,
            };
        }
    }
    if (!serveTarget) {
        if (serverTarget && workspaceProject.targets.has("serve-ssr")) {
            const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve-ssr");
            serveTarget = {
                project,
                target: "serve-ssr",
                configuration: configuration || defaultConfiguration,
            };
        }
        else if (workspaceProject.targets.has("serve")) {
            const { defaultConfiguration = "development" } = workspaceProject.targets.get("serve");
            serveTarget = {
                project,
                target: "serve",
                configuration: configuration || defaultConfiguration,
            };
        }
    }
    for (const target of [
        deployTarget,
        buildTarget,
        prerenderTarget,
        serverTarget,
        browserTarget,
        serveTarget,
    ]) {
        if (target) {
            const targetString = targetStringFromTarget(target);
            if (target.project !== project)
                throw new error_1.FirebaseError(`${targetString} is not in project ${project}. Please check your angular.json`);
            const definition = workspaceProject.targets.get(target.target);
            if (!definition)
                throw new error_1.FirebaseError(`${target} could not be found in your angular.json`);
            const { builder } = definition;
            const builderType = getBuilderType(builder);
            if (target === deployTarget && builderType === BuilderType.DEPLOY)
                continue;
            if (target === buildTarget && builderType === BuilderType.APPLICATION)
                continue;
            if (target === buildTarget && builderType === BuilderType.BROWSER)
                continue;
            if (target === browserTarget && builderType === BuilderType.BROWSER_ESBUILD)
                continue;
            if (target === browserTarget && builderType === BuilderType.BROWSER)
                continue;
            if (target === browserTarget && builderType === BuilderType.APPLICATION)
                continue;
            if (target === prerenderTarget && builderType === BuilderType.PRERENDER)
                continue;
            if (target === prerenderTarget && builderType === BuilderType.PRERENDER)
                continue;
            if (target === serverTarget && builderType === BuilderType.SERVER)
                continue;
            if (target === serveTarget && builderType === BuilderType.SSR_DEV_SERVER)
                continue;
            if (target === serveTarget && builderType === BuilderType.DEV_SERVER)
                continue;
            if (target === serveTarget && builderType === BuilderType.SERVER)
                continue;
            throw new error_1.FirebaseError(`${definition.builder} (${targetString}) is not a recognized builder. Please check your angular.json`);
        }
    }
    const buildOrBrowserTarget = buildTarget || browserTarget;
    if (!buildOrBrowserTarget) {
        throw new error_1.FirebaseError(`No build target on ${project}`);
    }
    const browserTargetOptions = await tryToGetOptionsForTarget(architectHost, buildOrBrowserTarget);
    if (!browserTargetOptions) {
        const targetString = targetStringFromTarget(buildOrBrowserTarget);
        throw new error_1.FirebaseError(`Couldn't find options for ${targetString}.`);
    }
    const baseHref = browserTargetOptions.baseHref || "/";
    (0, utils_2.assertIsString)(baseHref);
    const buildTargetOptions = buildTarget && (await tryToGetOptionsForTarget(architectHost, buildTarget));
    const ssr = buildTarget ? !!(buildTargetOptions === null || buildTargetOptions === void 0 ? void 0 : buildTargetOptions.ssr) : !!serverTarget;
    return {
        architect,
        architectHost,
        baseHref,
        host,
        buildTarget,
        browserTarget,
        prerenderTarget,
        serverTarget,
        serveTarget,
        workspaceProject,
        serveOptimizedImages,
        ssr,
    };
}
exports.getContext = getContext;
async function getBrowserConfig(sourceDir, configuration) {
    const { architectHost, browserTarget, buildTarget, baseHref, workspaceProject } = await getContext(sourceDir, configuration);
    const buildOrBrowserTarget = buildTarget || browserTarget;
    if (!buildOrBrowserTarget) {
        throw new assert_1.AssertionError({ message: "expected build or browser target defined" });
    }
    const [{ locales, defaultLocale }, targetOptions, builderName] = await Promise.all([
        localesForTarget(sourceDir, architectHost, buildOrBrowserTarget, workspaceProject),
        architectHost.getOptionsForTarget(buildOrBrowserTarget),
        architectHost.getBuilderNameForTarget(buildOrBrowserTarget),
    ]);
    const buildOutputPath = typeof (targetOptions === null || targetOptions === void 0 ? void 0 : targetOptions.outputPath) === "string"
        ? targetOptions.outputPath
        : (0, path_1.join)("dist", buildOrBrowserTarget.project);
    const outputPath = (0, path_1.join)(buildOutputPath, buildTarget && getBuilderType(builderName) === BuilderType.APPLICATION ? "browser" : "");
    return { locales, baseHref, outputPath, defaultLocale };
}
exports.getBrowserConfig = getBrowserConfig;
async function getServerConfig(sourceDir, configuration) {
    var _a;
    const { architectHost, host, buildTarget, serverTarget, browserTarget, baseHref, workspaceProject, serveOptimizedImages, ssr, } = await getContext(sourceDir, configuration);
    const buildOrBrowserTarget = buildTarget || browserTarget;
    if (!buildOrBrowserTarget) {
        throw new assert_1.AssertionError({ message: "expected build or browser target to be defined" });
    }
    const browserTargetOptions = await architectHost.getOptionsForTarget(buildOrBrowserTarget);
    const buildOutputPath = typeof (browserTargetOptions === null || browserTargetOptions === void 0 ? void 0 : browserTargetOptions.outputPath) === "string"
        ? browserTargetOptions.outputPath
        : (0, path_1.join)("dist", buildOrBrowserTarget.project);
    const browserOutputPath = (0, path_1.join)(buildOutputPath, buildTarget ? "browser" : "")
        .split(path_1.sep)
        .join(path_1.posix.sep);
    const packageJson = JSON.parse(await host.readFile((0, path_1.join)(sourceDir, "package.json")));
    if (!ssr) {
        return {
            packageJson,
            browserOutputPath,
            serverOutputPath: undefined,
            baseHref,
            bundleDependencies: false,
            externalDependencies: [],
            serverLocales: [],
            browserLocales: undefined,
            defaultLocale: undefined,
            serveOptimizedImages,
        };
    }
    const buildOrServerTarget = buildTarget || serverTarget;
    if (!buildOrServerTarget) {
        throw new assert_1.AssertionError({ message: "expected build or server target to be defined" });
    }
    const { locales: serverLocales, defaultLocale } = await localesForTarget(sourceDir, architectHost, buildOrServerTarget, workspaceProject);
    const serverTargetOptions = await architectHost.getOptionsForTarget(buildOrServerTarget);
    if (!serverTargetOptions) {
        throw new assert_1.AssertionError({
            message: `expected "JsonObject" but got "${typeof serverTargetOptions}"`,
        });
    }
    const serverTargetOutputPath = typeof (serverTargetOptions === null || serverTargetOptions === void 0 ? void 0 : serverTargetOptions.outputPath) === "string"
        ? serverTargetOptions.outputPath
        : (0, path_1.join)("dist", buildOrServerTarget.project);
    const serverOutputPath = (0, path_1.join)(serverTargetOutputPath, buildTarget ? "server" : "")
        .split(path_1.sep)
        .join(path_1.posix.sep);
    if (serverLocales && !defaultLocale) {
        throw new error_1.FirebaseError("It's required that your source locale to be one of the localize options");
    }
    const serverEntry = buildTarget ? "server.mjs" : serverTarget && "main.js";
    const externalDependencies = serverTargetOptions.externalDependencies || [];
    const bundleDependencies = (_a = serverTargetOptions.bundleDependencies) !== null && _a !== void 0 ? _a : true;
    const { locales: browserLocales } = await localesForTarget(sourceDir, architectHost, buildOrBrowserTarget, workspaceProject);
    return {
        packageJson,
        browserOutputPath,
        serverOutputPath,
        baseHref,
        bundleDependencies,
        externalDependencies,
        serverLocales,
        browserLocales,
        defaultLocale,
        serveOptimizedImages,
        serverEntry,
    };
}
exports.getServerConfig = getServerConfig;
async function getBuildConfig(sourceDir, configuration) {
    const { targetStringFromTarget } = await (0, utils_1.relativeRequire)(sourceDir, "@angular-devkit/architect");
    const { buildTarget, browserTarget, baseHref, prerenderTarget, serverTarget, architectHost, workspaceProject, serveOptimizedImages, ssr, } = await getContext(sourceDir, configuration);
    const targets = (buildTarget
        ? [buildTarget]
        : prerenderTarget
            ? [prerenderTarget]
            : [browserTarget, serverTarget].filter((it) => !!it)).map((it) => targetStringFromTarget(it));
    const buildOrBrowserTarget = buildTarget || browserTarget;
    if (!buildOrBrowserTarget) {
        throw new assert_1.AssertionError({ message: "expected build or browser target defined" });
    }
    const locales = await localesForTarget(sourceDir, architectHost, buildOrBrowserTarget, workspaceProject);
    return {
        targets,
        baseHref,
        locales,
        serveOptimizedImages,
        ssr,
    };
}
exports.getBuildConfig = getBuildConfig;
/**
 * Get Angular version in the following format: `major.minor.patch`, ignoring
 * canary versions as it causes issues with semver comparisons.
 */
function getAngularVersion(cwd) {
    const dependency = (0, utils_1.findDependency)("@angular/core", { cwd, depth: 0, omitDev: false });
    if (!dependency)
        return undefined;
    const angularVersionSemver = (0, semver_1.coerce)(dependency.version);
    if (!angularVersionSemver)
        return dependency.version;
    return angularVersionSemver.toString();
}
exports.getAngularVersion = getAngularVersion;
/**
 * Try to get options for target, throw an error when expected target doesn't exist in the configuration.
 */
async function tryToGetOptionsForTarget(architectHost, target) {
    return await architectHost.getOptionsForTarget(target).catch(throwCannotDetermineTarget);
}
exports.tryToGetOptionsForTarget = tryToGetOptionsForTarget;
function throwCannotDetermineTarget(error) {
    throw new error_1.FirebaseError(`Unable to determine the application to deploy, specify a target via the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable.`, { original: error });
}
/**
 * Extracts the builder type from a full builder string (everything after the colon)
 * @example
 * getBuilderType("@angular-devkit/build-angular:browser") // returns "browser"
 */
function getBuilderType(builder) {
    const colonIndex = builder.lastIndexOf(":");
    const builderType = colonIndex >= 0 ? builder.slice(colonIndex + 1) : undefined;
    if (!builderType || !Object.values(BuilderType).includes(builderType)) {
        return null;
    }
    return builderType;
}
exports.getBuilderType = getBuilderType;
