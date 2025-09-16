"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDevModeHandle = exports.ɵcodegenFunctionsDirectory = exports.ɵcodegenPublicDirectory = exports.init = exports.build = exports.discover = exports.docsUrl = exports.type = exports.support = exports.name = exports.supportedRange = void 0;
const child_process_1 = require("child_process");
const cross_spawn_1 = require("cross-spawn");
const promises_1 = require("fs/promises");
const path_1 = require("path");
const fs_extra_1 = require("fs-extra");
const url_1 = require("url");
const semver_1 = require("semver");
const clc = require("colorette");
const stream_chain_1 = require("stream-chain");
const stream_json_1 = require("stream-json");
const Pick_1 = require("stream-json/filters/Pick");
const StreamObject_1 = require("stream-json/streamers/StreamObject");
const fsutils_1 = require("../../fsutils");
const prompt_1 = require("../../prompt");
const error_1 = require("../../error");
const utils_1 = require("../utils");
const utils_2 = require("./utils");
const constants_1 = require("../constants");
const constants_2 = require("./constants");
const api_1 = require("../../hosting/api");
const logger_1 = require("../../logger");
const env_1 = require("../../functions/env");
const DEFAULT_BUILD_SCRIPT = ["next build"];
const PUBLIC_DIR = "public";
exports.supportedRange = "12 - 15.0";
exports.name = "Next.js";
exports.support = "preview" /* SupportLevel.Preview */;
exports.type = 2 /* FrameworkType.MetaFramework */;
exports.docsUrl = "https://firebase.google.com/docs/hosting/frameworks/nextjs";
const DEFAULT_NUMBER_OF_REASONS_TO_LIST = 5;
function getReactVersion(cwd) {
    var _a;
    return (_a = (0, utils_1.findDependency)("react-dom", { cwd, omitDev: false })) === null || _a === void 0 ? void 0 : _a.version;
}
/**
 * Returns whether this codebase is a Next.js backend.
 */
async function discover(dir) {
    if (!(await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "package.json"))))
        return;
    const version = (0, utils_2.getNextVersion)(dir);
    if (!(await (0, utils_2.whichNextConfigFile)(dir)) && !version)
        return;
    return { mayWantBackend: true, publicDirectory: (0, path_1.join)(dir, PUBLIC_DIR), version };
}
exports.discover = discover;
/**
 * Build a next.js application.
 */
async function build(dir, target, context) {
    var _a, _b;
    await (0, utils_1.warnIfCustomBuildScript)(dir, exports.name, DEFAULT_BUILD_SCRIPT);
    const reactVersion = getReactVersion(dir);
    if (reactVersion && (0, semver_1.gte)(reactVersion, "18.0.0")) {
        // This needs to be set for Next build to succeed with React 18
        process.env.__NEXT_REACT_ROOT = "true";
    }
    let env = Object.assign({}, process.env);
    // Check if the .env.<PROJECT-ID> file exists and make it available for the build process
    if (context === null || context === void 0 ? void 0 : context.projectId) {
        const projectEnvPath = (0, path_1.join)(dir, `.env.${context.projectId}`);
        if (await (0, fs_extra_1.pathExists)(projectEnvPath)) {
            const projectEnvVars = (0, env_1.parseStrict)((await (0, fs_extra_1.readFile)(projectEnvPath)).toString());
            // Merge the parsed variables with the existing environment variables
            env = Object.assign(Object.assign({}, projectEnvVars), env);
        }
    }
    if ((context === null || context === void 0 ? void 0 : context.projectId) && (context === null || context === void 0 ? void 0 : context.site)) {
        const deploymentDomain = await (0, api_1.getDeploymentDomain)(context.projectId, context.site, context.hostingChannel);
        if (deploymentDomain) {
            // Add the deployment domain to VERCEL_URL env variable, which is
            // required for dynamic OG images to work without manual configuration.
            // See: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#default-value
            env["VERCEL_URL"] = deploymentDomain;
        }
    }
    const cli = (0, utils_1.getNodeModuleBin)("next", dir);
    const nextBuild = new Promise((resolve, reject) => {
        var _a, _b;
        const buildProcess = (0, cross_spawn_1.spawn)(cli, ["build"], { cwd: dir, env });
        (_a = buildProcess.stdout) === null || _a === void 0 ? void 0 : _a.on("data", (data) => logger_1.logger.info(data.toString()));
        (_b = buildProcess.stderr) === null || _b === void 0 ? void 0 : _b.on("data", (data) => logger_1.logger.info(data.toString()));
        buildProcess.on("error", (err) => {
            reject(new error_1.FirebaseError(`Unable to build your Next.js app: ${err}`));
        });
        buildProcess.on("exit", (code) => {
            resolve(code);
        });
    });
    await nextBuild;
    const reasonsForBackend = new Set();
    const { distDir, trailingSlash, basePath: baseUrl } = await getConfig(dir);
    if (await (0, utils_2.isUsingMiddleware)((0, path_1.join)(dir, distDir), false)) {
        reasonsForBackend.add("middleware");
    }
    if (await (0, utils_2.isUsingImageOptimization)(dir, distDir)) {
        reasonsForBackend.add(`Image Optimization`);
    }
    const prerenderManifest = await (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, constants_2.PRERENDER_MANIFEST));
    const dynamicRoutesWithFallback = Object.entries(prerenderManifest.dynamicRoutes || {}).filter(([, it]) => it.fallback !== false);
    if (dynamicRoutesWithFallback.length > 0) {
        for (const [key] of dynamicRoutesWithFallback) {
            reasonsForBackend.add(`use of fallback ${key}`);
        }
    }
    const routesWithRevalidate = Object.entries(prerenderManifest.routes).filter(([, it]) => it.initialRevalidateSeconds);
    if (routesWithRevalidate.length > 0) {
        for (const [, { srcRoute }] of routesWithRevalidate) {
            reasonsForBackend.add(`use of revalidate ${srcRoute}`);
        }
    }
    const pagesManifestJSON = await (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, "server", constants_2.PAGES_MANIFEST));
    const prerenderedRoutes = Object.keys(prerenderManifest.routes);
    const dynamicRoutes = Object.keys(prerenderManifest.dynamicRoutes);
    const unrenderedPages = (0, utils_2.getNonStaticRoutes)(pagesManifestJSON, prerenderedRoutes, dynamicRoutes);
    for (const key of unrenderedPages) {
        reasonsForBackend.add(`non-static route ${key}`);
    }
    const manifest = await (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, constants_2.ROUTES_MANIFEST));
    const { headers: nextJsHeaders = [], redirects: nextJsRedirects = [], rewrites: nextJsRewrites = [], i18n: nextjsI18n, } = manifest;
    const isEveryHeaderSupported = nextJsHeaders.map(utils_2.cleanI18n).every(utils_2.isHeaderSupportedByHosting);
    if (!isEveryHeaderSupported) {
        reasonsForBackend.add("advanced headers");
    }
    const headers = nextJsHeaders
        .map(utils_2.cleanI18n)
        .filter(utils_2.isHeaderSupportedByHosting)
        .map(({ source, headers }) => ({
        // clean up unnecessary escaping
        source: (0, utils_2.cleanEscapedChars)(source),
        headers,
    }));
    const [appPathsManifest, appPathRoutesManifest, serverReferenceManifest] = await Promise.all([
        (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, "server", constants_2.APP_PATHS_MANIFEST)).catch(() => undefined),
        (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, constants_2.APP_PATH_ROUTES_MANIFEST)).catch(() => undefined),
        (0, utils_1.readJSON)((0, path_1.join)(dir, distDir, "server", constants_2.SERVER_REFERENCE_MANIFEST)).catch(() => undefined),
    ]);
    if (appPathRoutesManifest) {
        const { headers: headersFromMetaFiles, pprRoutes } = await (0, utils_2.getAppMetadataFromMetaFiles)(dir, distDir, baseUrl, appPathRoutesManifest);
        headers.push(...headersFromMetaFiles);
        for (const route of pprRoutes) {
            reasonsForBackend.add(`route with PPR ${route}`);
        }
        if (appPathsManifest) {
            const unrenderedServerComponents = (0, utils_2.getNonStaticServerComponents)(appPathsManifest, appPathRoutesManifest, prerenderedRoutes, dynamicRoutes);
            const notFoundPageKey = ["/_not-found", "/_not-found/page"].find((key) => unrenderedServerComponents.has(key));
            if (notFoundPageKey && (await (0, utils_2.hasStaticAppNotFoundComponent)(dir, distDir))) {
                unrenderedServerComponents.delete(notFoundPageKey);
            }
            for (const key of unrenderedServerComponents) {
                reasonsForBackend.add(`non-static component ${key}`);
            }
        }
        if (serverReferenceManifest) {
            const routesWithServerAction = (0, utils_2.getRoutesWithServerAction)(serverReferenceManifest, appPathRoutesManifest);
            for (const key of routesWithServerAction) {
                reasonsForBackend.add(`route with server action ${key}`);
            }
        }
    }
    const isEveryRedirectSupported = nextJsRedirects
        .filter((it) => !it.internal)
        .every(utils_2.isRedirectSupportedByHosting);
    if (!isEveryRedirectSupported) {
        reasonsForBackend.add("advanced redirects");
    }
    const redirects = nextJsRedirects
        .map(utils_2.cleanI18n)
        .filter(utils_2.isRedirectSupportedByHosting)
        .map(({ source, destination, statusCode: type }) => ({
        // clean up unnecessary escaping
        source: (0, utils_2.cleanEscapedChars)(source),
        destination,
        type,
    }));
    const nextJsRewritesToUse = (0, utils_2.getNextjsRewritesToUse)(nextJsRewrites);
    // rewrites.afterFiles / rewrites.fallback are not supported by firebase.json
    if (!Array.isArray(nextJsRewrites) &&
        (((_a = nextJsRewrites.afterFiles) === null || _a === void 0 ? void 0 : _a.length) || ((_b = nextJsRewrites.fallback) === null || _b === void 0 ? void 0 : _b.length))) {
        reasonsForBackend.add("advanced rewrites");
    }
    const isEveryRewriteSupported = nextJsRewritesToUse.every(utils_2.isRewriteSupportedByHosting);
    if (!isEveryRewriteSupported) {
        reasonsForBackend.add("advanced rewrites");
    }
    const rewrites = nextJsRewritesToUse
        .filter(utils_2.isRewriteSupportedByHosting)
        .map(utils_2.cleanI18n)
        .map(({ source, destination }) => ({
        // clean up unnecessary escaping
        source: (0, utils_2.cleanEscapedChars)(source),
        destination,
    }));
    const wantsBackend = reasonsForBackend.size > 0;
    if (wantsBackend) {
        logger_1.logger.info("Building a Cloud Function to run this application. This is needed due to:");
        for (const reason of Array.from(reasonsForBackend).slice(0, DEFAULT_NUMBER_OF_REASONS_TO_LIST)) {
            logger_1.logger.info(` • ${reason}`);
        }
        for (const reason of Array.from(reasonsForBackend).slice(DEFAULT_NUMBER_OF_REASONS_TO_LIST)) {
            logger_1.logger.debug(` • ${reason}`);
        }
        if (reasonsForBackend.size > DEFAULT_NUMBER_OF_REASONS_TO_LIST && !process.env.DEBUG) {
            logger_1.logger.info(` • and ${reasonsForBackend.size - DEFAULT_NUMBER_OF_REASONS_TO_LIST} other reasons, use --debug to see more`);
        }
        logger_1.logger.info("");
    }
    const i18n = !!nextjsI18n;
    return {
        wantsBackend,
        headers,
        redirects,
        rewrites,
        trailingSlash,
        i18n,
        baseUrl,
    };
}
exports.build = build;
/**
 * Utility method used during project initialization.
 */
async function init(setup, config) {
    const language = await (0, prompt_1.select)({
        default: "TypeScript",
        message: "What language would you like to use?",
        choices: [
            { name: "JavaScript", value: "js" },
            { name: "TypeScript", value: "ts" },
        ],
    });
    (0, child_process_1.execSync)(`npx --yes create-next-app@"${exports.supportedRange}" -e hello-world ` +
        `${setup.hosting.source} --use-npm --${language}`, { stdio: "inherit", cwd: config.projectDir });
}
exports.init = init;
/**
 * Create a directory for SSG content.
 */
async function ɵcodegenPublicDirectory(sourceDir, destDir, _, context) {
    const { distDir, i18n, basePath } = await getConfig(sourceDir);
    let matchingI18nDomain = undefined;
    if (i18n === null || i18n === void 0 ? void 0 : i18n.domains) {
        const siteDomains = await (0, api_1.getAllSiteDomains)(context.project, context.site);
        matchingI18nDomain = i18n.domains.find(({ domain }) => siteDomains.includes(domain));
    }
    const singleLocaleDomain = !i18n || ((matchingI18nDomain || i18n).locales || []).length <= 1;
    const publicPath = (0, path_1.join)(sourceDir, "public");
    await (0, promises_1.mkdir)((0, path_1.join)(destDir, basePath, "_next", "static"), { recursive: true });
    if (await (0, fs_extra_1.pathExists)(publicPath)) {
        await (0, fs_extra_1.copy)(publicPath, (0, path_1.join)(destDir, basePath));
    }
    await (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, distDir, "static"), (0, path_1.join)(destDir, basePath, "_next", "static"));
    const [middlewareManifest, prerenderManifest, routesManifest, pagesManifest, appPathRoutesManifest, serverReferenceManifest,] = await Promise.all([
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, "server", constants_2.MIDDLEWARE_MANIFEST)),
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, constants_2.PRERENDER_MANIFEST)),
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, constants_2.ROUTES_MANIFEST)),
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, "server", constants_2.PAGES_MANIFEST)),
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, constants_2.APP_PATH_ROUTES_MANIFEST)).catch(() => ({})),
        (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, "server", constants_2.SERVER_REFERENCE_MANIFEST)).catch(() => ({ node: {}, edge: {}, encryptionKey: "" })),
    ]);
    const appPathRoutesEntries = Object.entries(appPathRoutesManifest);
    const middlewareMatcherRegexes = (0, utils_2.getMiddlewareMatcherRegexes)(middlewareManifest);
    const { redirects = [], rewrites = [], headers = [] } = routesManifest;
    const rewritesRegexesNotSupportedByHosting = (0, utils_2.getNextjsRewritesToUse)(rewrites)
        .filter((rewrite) => !(0, utils_2.isRewriteSupportedByHosting)(rewrite))
        .map(utils_2.cleanI18n)
        .map((rewrite) => new RegExp(rewrite.regex));
    const redirectsRegexesNotSupportedByHosting = redirects
        .filter((it) => !it.internal)
        .filter((redirect) => !(0, utils_2.isRedirectSupportedByHosting)(redirect))
        .map(utils_2.cleanI18n)
        .map((redirect) => new RegExp(redirect.regex));
    const headersRegexesNotSupportedByHosting = headers
        .filter((header) => !(0, utils_2.isHeaderSupportedByHosting)(header))
        .map((header) => new RegExp(header.regex));
    const pathsUsingsFeaturesNotSupportedByHosting = [
        ...middlewareMatcherRegexes,
        ...rewritesRegexesNotSupportedByHosting,
        ...redirectsRegexesNotSupportedByHosting,
        ...headersRegexesNotSupportedByHosting,
    ];
    const staticRoutesUsingServerActions = (0, utils_2.getRoutesWithServerAction)(serverReferenceManifest, appPathRoutesManifest);
    const pagesManifestLikePrerender = Object.fromEntries(Object.entries(pagesManifest)
        .filter(([, srcRoute]) => srcRoute.endsWith(".html"))
        .map(([path]) => {
        return [
            path,
            {
                srcRoute: null,
                initialRevalidateSeconds: false,
                dataRoute: "",
                experimentalPPR: false,
                prefetchDataRoute: "",
            },
        ];
    }));
    const routesToCopy = Object.assign(Object.assign({}, prerenderManifest.routes), pagesManifestLikePrerender);
    const { pprRoutes } = await (0, utils_2.getAppMetadataFromMetaFiles)(sourceDir, distDir, basePath, appPathRoutesManifest);
    await Promise.all(Object.entries(routesToCopy).map(async ([path, route]) => {
        var _a, _b;
        if (route.initialRevalidateSeconds) {
            logger_1.logger.debug(`skipping ${path} due to revalidate`);
            return;
        }
        if (pathsUsingsFeaturesNotSupportedByHosting.some((it) => path.match(it))) {
            logger_1.logger.debug(`skipping ${path} due to it matching an unsupported rewrite/redirect/header or middlware`);
            return;
        }
        if (staticRoutesUsingServerActions.some((it) => path === it)) {
            logger_1.logger.debug(`skipping ${path} due to server action`);
            return;
        }
        const appPathRoute = route.srcRoute && ((_a = appPathRoutesEntries.find(([, it]) => it === route.srcRoute)) === null || _a === void 0 ? void 0 : _a[0]);
        const contentDist = (0, path_1.join)(sourceDir, distDir, "server", appPathRoute ? "app" : "pages");
        const sourceParts = path.split("/").filter((it) => !!it);
        const locale = (i18n === null || i18n === void 0 ? void 0 : i18n.locales.includes(sourceParts[0])) ? sourceParts[0] : undefined;
        const includeOnThisDomain = !locale ||
            !matchingI18nDomain ||
            matchingI18nDomain.defaultLocale === locale ||
            !matchingI18nDomain.locales ||
            matchingI18nDomain.locales.includes(locale);
        if (!includeOnThisDomain) {
            logger_1.logger.debug(`skipping ${path} since it is for a locale not deployed on this domain`);
            return;
        }
        const sourcePartsOrIndex = sourceParts.length > 0 ? sourceParts : ["index"];
        const destParts = sourceParts.slice(locale ? 1 : 0);
        const destPartsOrIndex = destParts.length > 0 ? destParts : ["index"];
        const isDefaultLocale = !locale || ((_b = (matchingI18nDomain || i18n)) === null || _b === void 0 ? void 0 : _b.defaultLocale) === locale;
        let sourcePath = (0, path_1.join)(contentDist, ...sourcePartsOrIndex);
        let localizedDestPath = !singleLocaleDomain &&
            locale &&
            (0, path_1.join)(destDir, constants_1.I18N_ROOT, locale, basePath, ...destPartsOrIndex);
        let defaultDestPath = isDefaultLocale && (0, path_1.join)(destDir, basePath, ...destPartsOrIndex);
        if (!(0, fsutils_1.fileExistsSync)(sourcePath) && (0, fsutils_1.fileExistsSync)(`${sourcePath}.html`)) {
            sourcePath += ".html";
            if (pprRoutes.includes(path)) {
                logger_1.logger.debug(`skipping ${path} due to ppr`);
                return;
            }
            if (localizedDestPath)
                localizedDestPath += ".html";
            if (defaultDestPath)
                defaultDestPath += ".html";
        }
        else if (appPathRoute &&
            (0, path_1.basename)(appPathRoute) === "route" &&
            (0, fsutils_1.fileExistsSync)(`${sourcePath}.body`)) {
            sourcePath += ".body";
        }
        else if (!(0, fs_extra_1.pathExistsSync)(sourcePath)) {
            console.error(`Cannot find ${path} in your compiled Next.js application.`);
            return;
        }
        if (localizedDestPath) {
            await (0, promises_1.mkdir)((0, path_1.dirname)(localizedDestPath), { recursive: true });
            await (0, promises_1.copyFile)(sourcePath, localizedDestPath);
        }
        if (defaultDestPath) {
            await (0, promises_1.mkdir)((0, path_1.dirname)(defaultDestPath), { recursive: true });
            await (0, promises_1.copyFile)(sourcePath, defaultDestPath);
        }
        if (route.dataRoute && !appPathRoute) {
            const dataSourcePath = `${(0, path_1.join)(...sourcePartsOrIndex)}.json`;
            const dataDestPath = (0, path_1.join)(destDir, basePath, route.dataRoute);
            await (0, promises_1.mkdir)((0, path_1.dirname)(dataDestPath), { recursive: true });
            await (0, promises_1.copyFile)((0, path_1.join)(contentDist, dataSourcePath), dataDestPath);
        }
    }));
}
exports.ɵcodegenPublicDirectory = ɵcodegenPublicDirectory;
/**
 * Create a directory for SSR content.
 */
async function ɵcodegenFunctionsDirectory(sourceDir, destDir, target, context) {
    const { distDir } = await getConfig(sourceDir);
    const packageJson = await (0, utils_1.readJSON)((0, path_1.join)(sourceDir, "package.json"));
    // Bundle their next.config.js with esbuild via NPX, pinned version was having troubles on m1
    // macs and older Node versions; either way, we should avoid taking on any deps in firebase-tools
    // Alternatively I tried using @swc/spack and the webpack bundled into Next.js but was
    // encountering difficulties with both of those
    const configFile = await (0, utils_2.whichNextConfigFile)(sourceDir);
    if (configFile) {
        try {
            // Check if esbuild is installed using `npx which`, if not, install it
            let esbuildPath = (0, utils_2.findEsbuildPath)();
            if (!esbuildPath || !(0, fs_extra_1.pathExistsSync)(esbuildPath)) {
                console.warn("esbuild not found, installing...");
                (0, utils_2.installEsbuild)(constants_2.ESBUILD_VERSION);
                esbuildPath = (0, utils_2.findEsbuildPath)();
                if (!esbuildPath || !(0, fs_extra_1.pathExistsSync)(esbuildPath)) {
                    throw new error_1.FirebaseError("Failed to locate esbuild after installation.");
                }
            }
            // Dynamically require esbuild from the found path
            const esbuild = require(esbuildPath);
            if (!esbuild) {
                throw new error_1.FirebaseError(`Failed to load esbuild from path: ${esbuildPath}`);
            }
            const productionDeps = await new Promise((resolve) => {
                const dependencies = [];
                const npmLs = (0, cross_spawn_1.spawn)("npm", ["ls", "--omit=dev", "--all", "--json=true"], {
                    cwd: sourceDir,
                    timeout: constants_1.NPM_COMMAND_TIMEOUT_MILLIES,
                });
                const pipeline = (0, stream_chain_1.chain)([
                    npmLs.stdout,
                    (0, stream_json_1.parser)({ packValues: false, packKeys: true, streamValues: false }),
                    (0, Pick_1.pick)({ filter: "dependencies" }),
                    (0, StreamObject_1.streamObject)(),
                    ({ key, value }) => [
                        key,
                        ...(0, utils_2.allDependencyNames)(value),
                    ],
                ]);
                pipeline.on("data", (it) => dependencies.push(it));
                pipeline.on("end", () => {
                    resolve([...new Set(dependencies)]);
                });
            });
            // Mark all production deps as externals, so they aren't bundled
            // DevDeps won't be included in the Cloud Function, so they should be bundled
            const esbuildArgs = {
                entryPoints: [(0, path_1.join)(sourceDir, configFile)],
                outfile: (0, path_1.join)(destDir, configFile),
                bundle: true,
                platform: "node",
                target: `node${constants_1.NODE_VERSION}`,
                logLevel: "error",
                external: productionDeps,
            };
            if (configFile === "next.config.mjs") {
                // ensure generated file is .mjs if the config is .mjs
                esbuildArgs.format = "esm";
            }
            const bundle = await esbuild.build(esbuildArgs);
            if (bundle.errors && bundle.errors.length > 0) {
                throw new error_1.FirebaseError(bundle.errors.toString());
            }
        }
        catch (e) {
            console.warn(`Unable to bundle ${configFile} for use in Cloud Functions, proceeding with deploy but problems may be encountered.`);
            console.error(e.message || e);
            await (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, configFile), (0, path_1.join)(destDir, configFile));
        }
    }
    if (await (0, fs_extra_1.pathExists)((0, path_1.join)(sourceDir, "public"))) {
        await (0, promises_1.mkdir)((0, path_1.join)(destDir, "public"));
        await (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, "public"), (0, path_1.join)(destDir, "public"));
    }
    // Add the `sharp` library if app is using image optimization
    if (await (0, utils_2.isUsingImageOptimization)(sourceDir, distDir)) {
        packageJson.dependencies["sharp"] = constants_1.SHARP_VERSION;
    }
    const dotEnv = {};
    if ((context === null || context === void 0 ? void 0 : context.projectId) && (context === null || context === void 0 ? void 0 : context.site)) {
        const deploymentDomain = await (0, api_1.getDeploymentDomain)(context.projectId, context.site, context.hostingChannel);
        if (deploymentDomain) {
            // Add the deployment domain to VERCEL_URL env variable, which is
            // required for dynamic OG images to work without manual configuration.
            // See: https://nextjs.org/docs/app/api-reference/functions/generate-metadata#default-value
            dotEnv["VERCEL_URL"] = deploymentDomain;
        }
    }
    const [productionDistDirfiles] = await Promise.all([
        (0, utils_2.getProductionDistDirFiles)(sourceDir, distDir),
        (0, fs_extra_1.mkdirp)((0, path_1.join)(destDir, distDir)),
    ]);
    await Promise.all(productionDistDirfiles.map((file) => (0, fs_extra_1.copy)((0, path_1.join)(sourceDir, distDir, file), (0, path_1.join)(destDir, distDir, file), {
        recursive: true,
    })));
    return { packageJson, frameworksEntry: "next.js", dotEnv };
}
exports.ɵcodegenFunctionsDirectory = ɵcodegenFunctionsDirectory;
/**
 * Create a dev server.
 */
async function getDevModeHandle(dir, _, hostingEmulatorInfo) {
    // throw error when using Next.js middleware with firebase serve
    if (!hostingEmulatorInfo) {
        if (await (0, utils_2.isUsingMiddleware)(dir, true)) {
            throw new error_1.FirebaseError(`${clc.bold("firebase serve")} does not support Next.js Middleware. Please use ${clc.bold("firebase emulators:start")} instead.`);
        }
    }
    let next = await (0, utils_1.relativeRequire)(dir, "next");
    if ("default" in next)
        next = next.default;
    const nextApp = next({
        dev: true,
        dir,
        hostname: hostingEmulatorInfo === null || hostingEmulatorInfo === void 0 ? void 0 : hostingEmulatorInfo.host,
        port: hostingEmulatorInfo === null || hostingEmulatorInfo === void 0 ? void 0 : hostingEmulatorInfo.port,
    });
    const handler = nextApp.getRequestHandler();
    await nextApp.prepare();
    return (0, utils_1.simpleProxy)(async (req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url, true);
        await handler(req, res, parsedUrl);
    });
}
exports.getDevModeHandle = getDevModeHandle;
async function getConfig(dir) {
    var _a;
    var _b;
    let config = {};
    const configFile = await (0, utils_2.whichNextConfigFile)(dir);
    if (configFile) {
        const version = (0, utils_2.getNextVersion)(dir);
        if (!version)
            throw new Error("Unable to find the next dep, try NPM installing?");
        if ((0, semver_1.gte)(version, "12.0.0")) {
            const [{ default: loadConfig }, { PHASE_PRODUCTION_BUILD }] = await Promise.all([
                (0, utils_1.relativeRequire)(dir, "next/dist/server/config"),
                (0, utils_1.relativeRequire)(dir, "next/constants"),
            ]);
            config = await loadConfig(PHASE_PRODUCTION_BUILD, dir);
        }
        else {
            try {
                config = await (_a = (0, url_1.pathToFileURL)((0, path_1.join)(dir, configFile)).toString(), Promise.resolve().then(() => require(_a)));
            }
            catch (e) {
                throw new Error(`Unable to load ${configFile}.`);
            }
        }
    }
    (0, utils_1.validateLocales)((_b = config.i18n) === null || _b === void 0 ? void 0 : _b.locales);
    return Object.assign({ distDir: ".next", 
        // trailingSlash defaults to false in Next.js: https://nextjs.org/docs/api-reference/next.config.js/trailing-slash
        trailingSlash: false, basePath: "/" }, config);
}
