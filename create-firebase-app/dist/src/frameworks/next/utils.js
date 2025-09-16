"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.installEsbuild = exports.getGlobalEsbuildVersion = exports.findEsbuildPath = exports.whichNextConfigFile = exports.getProductionDistDirFiles = exports.getRoutesWithServerAction = exports.hasStaticAppNotFoundComponent = exports.getNextVersion = exports.getBuildId = exports.getAppMetadataFromMetaFiles = exports.getNonStaticServerComponents = exports.getNonStaticRoutes = exports.getMiddlewareMatcherRegexes = exports.allDependencyNames = exports.isUsingAppDirectory = exports.isUsingNextImageInAppDirectory = exports.isUsingImageOptimization = exports.isUsingMiddleware = exports.hasUnoptimizedImage = exports.usesNextImage = exports.usesAppDirRouter = exports.getNextjsRewritesToUse = exports.isHeaderSupportedByHosting = exports.isRedirectSupportedByHosting = exports.isRewriteSupportedByHosting = exports.cleanI18n = exports.cleanCustomRouteI18n = exports.cleanEscapedChars = exports.I18N_SOURCE = void 0;
const fs_1 = require("fs");
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const glob_1 = require("glob");
const semver_1 = require("semver");
const utils_1 = require("../utils");
const constants_1 = require("./constants");
const fsutils_1 = require("../../fsutils");
const utils_2 = require("../../utils");
const child_process_1 = require("child_process");
const error_1 = require("../../error");
exports.I18N_SOURCE = /\/:nextInternalLocale(\([^\)]+\))?/;
/**
 * Remove escaping from characters used for Regex patch matching that Next.js
 * requires. As Firebase Hosting does not require escaping for those charachters,
 * we remove them.
 *
 * According to the Next.js documentation:
 * ```md
 * The following characters (, ), {, }, :, *, +, ? are used for regex path
 * matching, so when used in the source as non-special values they must be
 * escaped by adding \\ before them.
 * ```
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites#regex-path-matching
 */
function cleanEscapedChars(path) {
    return path.replace(/\\([(){}:+?*])/g, (a, b) => b);
}
exports.cleanEscapedChars = cleanEscapedChars;
/**
 * Remove Next.js internal i18n prefix from headers, redirects and rewrites.
 */
function cleanCustomRouteI18n(path) {
    return path.replace(exports.I18N_SOURCE, "");
}
exports.cleanCustomRouteI18n = cleanCustomRouteI18n;
function cleanI18n(it) {
    const [, localesRegex] = it.source.match(exports.I18N_SOURCE) || [undefined, undefined];
    const source = localesRegex ? cleanCustomRouteI18n(it.source) : it.source;
    const destination = "destination" in it && localesRegex ? cleanCustomRouteI18n(it.destination) : it.destination;
    const regex = "regex" in it && localesRegex ? it.regex.replace(`(?:/${localesRegex})`, "") : it.regex;
    return Object.assign(Object.assign({}, it), { source,
        destination,
        regex });
}
exports.cleanI18n = cleanI18n;
/**
 * Whether a Next.js rewrite is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#rewrites
 *
 * Next.js unsupported rewrites includes:
 * - Rewrites with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/rewrites#header-cookie-and-query-matching
 *
 * - Rewrites to external URLs or URLs using parameters
 */
function isRewriteSupportedByHosting(rewrite) {
    return !("has" in rewrite ||
        "missing" in rewrite ||
        (0, utils_1.isUrl)(rewrite.destination) ||
        rewrite.destination.includes("?"));
}
exports.isRewriteSupportedByHosting = isRewriteSupportedByHosting;
/**
 * Whether a Next.js redirect is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#redirects
 *
 * Next.js unsupported redirects includes:
 * - Redirects with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/redirects#header-cookie-and-query-matching
 *
 * - Next.js internal redirects
 */
function isRedirectSupportedByHosting(redirect) {
    return !("has" in redirect ||
        "missing" in redirect ||
        "internal" in redirect ||
        redirect.destination.includes("?"));
}
exports.isRedirectSupportedByHosting = isRedirectSupportedByHosting;
/**
 * Whether a Next.js custom header is supported by `firebase.json`.
 *
 * See: https://firebase.google.com/docs/hosting/full-config#headers
 *
 * Next.js unsupported headers includes:
 * - Custom header with the `has` or `missing` property that is used by Next.js for Header,
 *   Cookie, and Query Matching.
 *     - https://nextjs.org/docs/api-reference/next.config.js/headers#header-cookie-and-query-matching
 *
 */
function isHeaderSupportedByHosting(header) {
    return !("has" in header || "missing" in header);
}
exports.isHeaderSupportedByHosting = isHeaderSupportedByHosting;
/**
 * Get which Next.js rewrites will be used before checking supported items individually.
 *
 * Next.js rewrites can be arrays or objects:
 * - For arrays, all supported items can be used.
 * - For objects only `beforeFiles` can be used.
 *
 * See: https://nextjs.org/docs/api-reference/next.config.js/rewrites
 */
function getNextjsRewritesToUse(nextJsRewrites) {
    if (Array.isArray(nextJsRewrites)) {
        return nextJsRewrites.map(cleanI18n);
    }
    if (nextJsRewrites === null || nextJsRewrites === void 0 ? void 0 : nextJsRewrites.beforeFiles) {
        return nextJsRewrites.beforeFiles.map(cleanI18n);
    }
    return [];
}
exports.getNextjsRewritesToUse = getNextjsRewritesToUse;
/**
 * Check if `/app` directory is used in the Next.js project.
 * @param sourceDir location of the source directory
 * @return true if app directory is used in the Next.js project
 */
function usesAppDirRouter(sourceDir) {
    const appPathRoutesManifestPath = (0, path_1.join)(sourceDir, constants_1.APP_PATH_ROUTES_MANIFEST);
    return (0, fs_1.existsSync)(appPathRoutesManifestPath);
}
exports.usesAppDirRouter = usesAppDirRouter;
/**
 * Check if the project is using the next/image component based on the export-marker.json file.
 * @param sourceDir location of the source directory
 * @return true if the Next.js project uses the next/image component
 */
async function usesNextImage(sourceDir, distDir) {
    const exportMarker = await (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, constants_1.EXPORT_MARKER));
    return exportMarker.isNextImageImported;
}
exports.usesNextImage = usesNextImage;
/**
 * Check if Next.js is forced to serve the source image as-is instead of being oprimized
 * by setting `unoptimized: true` in next.config.js.
 * https://nextjs.org/docs/api-reference/next/image#unoptimized
 *
 * @param sourceDir location of the source directory
 * @param distDir location of the dist directory
 * @return true if image optimization is disabled
 */
async function hasUnoptimizedImage(sourceDir, distDir) {
    const imagesManifest = await (0, utils_1.readJSON)((0, path_1.join)(sourceDir, distDir, constants_1.IMAGES_MANIFEST));
    return imagesManifest.images.unoptimized;
}
exports.hasUnoptimizedImage = hasUnoptimizedImage;
/**
 * Whether Next.js middleware is being used
 *
 * @param dir in development must be the project root path, otherwise `distDir`
 * @param isDevMode whether the project is running on dev or production
 */
async function isUsingMiddleware(dir, isDevMode) {
    if (isDevMode) {
        const [middlewareJs, middlewareTs] = await Promise.all([
            (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "middleware.js")),
            (0, fs_extra_1.pathExists)((0, path_1.join)(dir, "middleware.ts")),
        ]);
        return middlewareJs || middlewareTs;
    }
    else {
        const middlewareManifest = await (0, utils_1.readJSON)((0, path_1.join)(dir, "server", constants_1.MIDDLEWARE_MANIFEST));
        return Object.keys(middlewareManifest.middleware).length > 0;
    }
}
exports.isUsingMiddleware = isUsingMiddleware;
/**
 * Whether image optimization is being used
 *
 * @param projectDir path to the project directory
 * @param distDir path to `distDir` - where the manifests are located
 */
async function isUsingImageOptimization(projectDir, distDir) {
    let isNextImageImported = await usesNextImage(projectDir, distDir);
    // App directory doesn't use the export marker, look it up manually
    if (!isNextImageImported && isUsingAppDirectory((0, path_1.join)(projectDir, distDir))) {
        if (await isUsingNextImageInAppDirectory(projectDir, distDir)) {
            isNextImageImported = true;
        }
    }
    if (isNextImageImported) {
        const imagesManifest = await (0, utils_1.readJSON)((0, path_1.join)(projectDir, distDir, constants_1.IMAGES_MANIFEST));
        return !imagesManifest.images.unoptimized;
    }
    return false;
}
exports.isUsingImageOptimization = isUsingImageOptimization;
/**
 * Whether next/image is being used in the app directory
 */
async function isUsingNextImageInAppDirectory(projectDir, nextDir) {
    const nextImagePath = ["node_modules", "next", "dist", "client", "image"];
    const nextImageString = utils_2.IS_WINDOWS
        ? // Note: Windows requires double backslashes to match Next.js generated file
            nextImagePath.join(path_1.sep + path_1.sep)
        : (0, path_1.join)(...nextImagePath);
    const files = (0, glob_1.sync)((0, path_1.join)(projectDir, nextDir, "server", "**", "*client-reference-manifest.js"));
    for (const filepath of files) {
        const fileContents = await (0, promises_1.readFile)(filepath, "utf-8");
        // Return true when the first file containing the next/image component is found
        if (fileContents.includes(nextImageString)) {
            return true;
        }
    }
    return false;
}
exports.isUsingNextImageInAppDirectory = isUsingNextImageInAppDirectory;
/**
 * Whether Next.js app directory is being used
 *
 * @param dir path to `distDir` - where the manifests are located
 */
function isUsingAppDirectory(dir) {
    const appPathRoutesManifestPath = (0, path_1.join)(dir, constants_1.APP_PATH_ROUTES_MANIFEST);
    return (0, fsutils_1.fileExistsSync)(appPathRoutesManifestPath);
}
exports.isUsingAppDirectory = isUsingAppDirectory;
/**
 * Given input from `npm ls` flatten the dependency tree and return all module names
 *
 * @param dependencies returned from `npm ls`
 */
function allDependencyNames(mod) {
    if (!mod.dependencies)
        return [];
    const dependencyNames = Object.keys(mod.dependencies).reduce((acc, it) => [...acc, it, ...allDependencyNames(mod.dependencies[it])], []);
    return dependencyNames;
}
exports.allDependencyNames = allDependencyNames;
/**
 * Get regexes from middleware matcher manifest
 */
function getMiddlewareMatcherRegexes(middlewareManifest) {
    const middlewareObjectValues = Object.values(middlewareManifest.middleware);
    let middlewareMatchers;
    if (middlewareManifest.version === 1) {
        middlewareMatchers = middlewareObjectValues.map((page) => ({ regexp: page.regexp }));
    }
    else {
        middlewareMatchers = middlewareObjectValues
            .map((page) => page.matchers)
            .flat();
    }
    return middlewareMatchers.map((matcher) => new RegExp(matcher.regexp));
}
exports.getMiddlewareMatcherRegexes = getMiddlewareMatcherRegexes;
/**
 * Get non static routes based on pages-manifest, prerendered and dynamic routes
 */
function getNonStaticRoutes(pagesManifestJSON, prerenderedRoutes, dynamicRoutes) {
    const nonStaticRoutes = Object.entries(pagesManifestJSON)
        .filter(([it, src]) => !((0, path_1.extname)(src) !== ".js" ||
        ["/_app", "/_error", "/_document"].includes(it) ||
        prerenderedRoutes.includes(it) ||
        dynamicRoutes.includes(it)))
        .map(([it]) => it);
    return nonStaticRoutes;
}
exports.getNonStaticRoutes = getNonStaticRoutes;
/**
 * Get non static components from app directory
 */
function getNonStaticServerComponents(appPathsManifest, appPathRoutesManifest, prerenderedRoutes, dynamicRoutes) {
    const nonStaticServerComponents = Object.entries(appPathsManifest)
        .filter(([it, src]) => {
        if ((0, path_1.extname)(src) !== ".js")
            return;
        const path = appPathRoutesManifest[it];
        return !(prerenderedRoutes.includes(path) || dynamicRoutes.includes(path));
    })
        .map(([it]) => it);
    return new Set(nonStaticServerComponents);
}
exports.getNonStaticServerComponents = getNonStaticServerComponents;
/**
 * Get metadata from .meta files
 */
async function getAppMetadataFromMetaFiles(sourceDir, distDir, basePath, appPathRoutesManifest) {
    const headers = [];
    const pprRoutes = [];
    await Promise.all(Object.entries(appPathRoutesManifest).map(async ([key, source]) => {
        if (!["route", "page"].includes((0, path_1.basename)(key)))
            return;
        const parts = source.split("/").filter((it) => !!it);
        const partsOrIndex = parts.length > 0 ? parts : ["index"];
        const routePath = (0, path_1.join)(sourceDir, distDir, "server", "app", ...partsOrIndex);
        const metadataPath = `${routePath}.meta`;
        if ((0, fsutils_1.dirExistsSync)(routePath) && (0, fsutils_1.fileExistsSync)(metadataPath)) {
            const meta = await (0, utils_1.readJSON)(metadataPath);
            if (meta.headers)
                headers.push({
                    source: path_1.posix.join(basePath, source),
                    headers: Object.entries(meta.headers).map(([key, value]) => ({ key, value })),
                });
            if (meta.postponed)
                pprRoutes.push(source);
        }
    }));
    return { headers, pprRoutes };
}
exports.getAppMetadataFromMetaFiles = getAppMetadataFromMetaFiles;
/**
 * Get build id from .next/BUILD_ID file
 * @throws if file doesn't exist
 */
async function getBuildId(distDir) {
    const buildId = await (0, promises_1.readFile)((0, path_1.join)(distDir, "BUILD_ID"));
    return buildId.toString();
}
exports.getBuildId = getBuildId;
/**
 * Get Next.js version in the following format: `major.minor.patch`, ignoring
 * canary versions as it causes issues with semver comparisons.
 */
function getNextVersion(cwd) {
    const dependency = (0, utils_1.findDependency)("next", { cwd, depth: 0, omitDev: false });
    if (!dependency)
        return undefined;
    const nextVersionSemver = (0, semver_1.coerce)(dependency.version);
    if (!nextVersionSemver)
        return dependency.version;
    return nextVersionSemver.toString();
}
exports.getNextVersion = getNextVersion;
/**
 * Whether the Next.js project has a static `not-found` page in the app directory.
 *
 * The Next.js build manifests are misleading regarding the existence of a static
 * `not-found` component. Therefore, we check if a `_not-found.html` file exists
 * in the generated app directory files to know whether `not-found` is static.
 */
async function hasStaticAppNotFoundComponent(sourceDir, distDir) {
    return (0, fs_extra_1.pathExists)((0, path_1.join)(sourceDir, distDir, "server", "app", "_not-found.html"));
}
exports.hasStaticAppNotFoundComponent = hasStaticAppNotFoundComponent;
/**
 * Find routes using server actions by checking the server-reference-manifest.json
 */
function getRoutesWithServerAction(serverReferenceManifest, appPathRoutesManifest) {
    const routesWithServerAction = new Set();
    for (const key of Object.keys(serverReferenceManifest)) {
        if (key !== "edge" && key !== "node")
            continue;
        const edgeOrNode = serverReferenceManifest[key];
        for (const actionId of Object.keys(edgeOrNode)) {
            if (!edgeOrNode[actionId].layer)
                continue;
            for (const [route, type] of Object.entries(edgeOrNode[actionId].layer)) {
                if (type === constants_1.WEBPACK_LAYERS.actionBrowser) {
                    routesWithServerAction.add(appPathRoutesManifest[route.replace("app", "")]);
                }
            }
        }
    }
    return Array.from(routesWithServerAction);
}
exports.getRoutesWithServerAction = getRoutesWithServerAction;
/**
 * Get files in the dist directory to be deployed to Firebase, ignoring development files.
 *
 * Return relative paths to the dist directory.
 */
async function getProductionDistDirFiles(sourceDir, distDir) {
    return (0, glob_1.glob)("**", {
        ignore: [(0, path_1.join)("cache", "webpack", "*-development", "**"), (0, path_1.join)("cache", "eslint", "**")],
        cwd: (0, path_1.join)(sourceDir, distDir),
        nodir: true,
        absolute: false,
    });
}
exports.getProductionDistDirFiles = getProductionDistDirFiles;
/**
 * Get the Next.js config file name in the project directory, either
 * `next.config.js` or `next.config.mjs`.  If none of them exist, return null.
 */
async function whichNextConfigFile(dir) {
    for (const file of constants_1.CONFIG_FILES) {
        if (await (0, fs_extra_1.pathExists)((0, path_1.join)(dir, file)))
            return file;
    }
    return null;
}
exports.whichNextConfigFile = whichNextConfigFile;
/**
 * Helper function to find the path of esbuild using `npm which`
 */
function findEsbuildPath() {
    var _a;
    try {
        const esbuildBinPath = (_a = (0, child_process_1.execSync)("npx which esbuild", { encoding: "utf8" })) === null || _a === void 0 ? void 0 : _a.trim();
        if (!esbuildBinPath) {
            return null;
        }
        const globalVersion = getGlobalEsbuildVersion(esbuildBinPath);
        if (globalVersion && !(0, semver_1.satisfies)(globalVersion, constants_1.ESBUILD_VERSION)) {
            console.warn(`Warning: Global esbuild version (${globalVersion}) does not match the required version (${constants_1.ESBUILD_VERSION}).`);
        }
        return (0, path_1.resolve)((0, path_1.dirname)(esbuildBinPath), "../esbuild");
    }
    catch (error) {
        console.error(`Failed to find esbuild with npx which: ${error}`);
        return null;
    }
}
exports.findEsbuildPath = findEsbuildPath;
/**
 * Helper function to get the global esbuild version
 */
function getGlobalEsbuildVersion(binPath) {
    var _a;
    try {
        const versionOutput = (_a = (0, child_process_1.execSync)(`"${binPath}" --version`, { encoding: "utf8" })) === null || _a === void 0 ? void 0 : _a.trim();
        if (!versionOutput) {
            return null;
        }
        const versionMatch = versionOutput.match(/(\d+\.\d+\.\d+)/);
        return versionMatch ? versionMatch[0] : null;
    }
    catch (error) {
        console.error(`Failed to get global esbuild version: ${error}`);
        return null;
    }
}
exports.getGlobalEsbuildVersion = getGlobalEsbuildVersion;
/**
 * Helper function to install esbuild dynamically
 */
function installEsbuild(version) {
    const installCommand = `npm install esbuild@${version} --no-save`;
    try {
        (0, child_process_1.execSync)(installCommand, { stdio: "inherit" });
    }
    catch (error) {
        if (error instanceof error_1.FirebaseError) {
            throw error;
        }
        else {
            throw new error_1.FirebaseError(`Failed to install esbuild: ${error}`, { original: error });
        }
    }
}
exports.installEsbuild = installEsbuild;
