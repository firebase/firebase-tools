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
exports.getFrameworksBuildTarget = exports.validateLocales = exports.frameworksCallToAction = exports.conjoinOptions = exports.relativeRequire = exports.findDependency = exports.getNodeModuleBin = exports.getNpmRoot = exports.simpleProxy = exports.proxyResponse = exports.warnIfCustomBuildScript = exports.readJSON = exports.isUrl = void 0;
const fs_extra_1 = require("fs-extra");
const path_1 = require("path");
const promises_1 = require("fs/promises");
const http_1 = require("http");
const cross_spawn_1 = require("cross-spawn");
const clc = __importStar(require("colorette"));
const semver_1 = require("semver");
const logger_1 = require("../logger");
const error_1 = require("../error");
const fsutils_1 = require("../fsutils");
const url_1 = require("url");
const constants_1 = require("./constants");
// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../dynamicImport");
const NPM_ROOT_TIMEOUT_MILLIES = 5000;
const NPM_ROOT_MEMO = new Map();
/**
 * Whether the given string starts with http:// or https://
 */
function isUrl(url) {
    return /^https?:\/\//.test(url);
}
exports.isUrl = isUrl;
/**
 * add type to readJSON
 *
 * Note: `throws: false` won't work with the async function: https://github.com/jprichardson/node-fs-extra/issues/542
 */
function readJSON(file, options) {
    return (0, fs_extra_1.readJSON)(file, options);
}
exports.readJSON = readJSON;
/**
 * Prints a warning if the build script in package.json
 * contains anything other than allowedBuildScripts.
 */
async function warnIfCustomBuildScript(dir, framework, defaultBuildScripts) {
    const packageJsonBuffer = await (0, promises_1.readFile)((0, path_1.join)(dir, "package.json"));
    const packageJson = JSON.parse(packageJsonBuffer.toString());
    const buildScript = packageJson.scripts?.build;
    if (buildScript && !defaultBuildScripts.includes(buildScript)) {
        console.warn(`\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`);
    }
}
exports.warnIfCustomBuildScript = warnIfCustomBuildScript;
/**
 * Proxy a HTTP response
 * It uses the Proxy object to intercept the response and buffer it until the
 * response is finished. This allows us to modify the response before sending
 * it back to the client.
 */
function proxyResponse(req, res, next) {
    const proxiedRes = new http_1.ServerResponse(req);
    // Object to store the original response methods
    const buffer = [];
    // Proxy the response methods
    // The apply handler is called when the method e.g. write, setHeader, etc. is called
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/apply
    // The target is the original method
    // The thisArg is the proxied response
    // The args are the arguments passed to the method
    proxiedRes.write = new Proxy(proxiedRes.write.bind(proxiedRes), {
        apply: (target, thisArg, args) => {
            // call the original write method on the proxied response
            target.call(thisArg, ...args);
            // store the method call in the buffer
            buffer.push(["write", args]);
        },
    });
    proxiedRes.setHeader = new Proxy(proxiedRes.setHeader.bind(proxiedRes), {
        apply: (target, thisArg, args) => {
            target.call(thisArg, ...args);
            buffer.push(["setHeader", args]);
        },
    });
    proxiedRes.removeHeader = new Proxy(proxiedRes.removeHeader.bind(proxiedRes), {
        apply: (target, thisArg, args) => {
            target.call(thisArg, ...args);
            buffer.push(["removeHeader", args]);
        },
    });
    proxiedRes.writeHead = new Proxy(proxiedRes.writeHead.bind(proxiedRes), {
        apply: (target, thisArg, args) => {
            target.call(thisArg, ...args);
            buffer.push(["writeHead", args]);
        },
    });
    proxiedRes.end = new Proxy(proxiedRes.end.bind(proxiedRes), {
        apply: (target, thisArg, args) => {
            // call the original end method on the proxied response
            target.call(thisArg, ...args);
            // if the proxied response is a 404, call next to continue down the middleware chain
            // otherwise, send the buffered response i.e. call the original response methods: write, setHeader, etc.
            // and then end the response and clear the buffer
            if (proxiedRes.statusCode === 404) {
                next();
            }
            else {
                for (const [fn, args] of buffer) {
                    res[fn](...args);
                }
                res.end(...args);
                buffer.length = 0;
            }
        },
    });
    return proxiedRes;
}
exports.proxyResponse = proxyResponse;
function simpleProxy(hostOrRequestHandler) {
    const agent = new http_1.Agent({ keepAlive: true });
    // If the path is a the auth token sync URL pass through to Cloud Functions
    const firebaseDefaultsJSON = process.env.__FIREBASE_DEFAULTS__;
    const authTokenSyncURL = firebaseDefaultsJSON && JSON.parse(firebaseDefaultsJSON)._authTokenSyncURL;
    return async (originalReq, originalRes, next) => {
        const { method, headers, url: path } = originalReq;
        if (!method || !path) {
            originalRes.end();
            return;
        }
        if (path === authTokenSyncURL) {
            return next();
        }
        if (typeof hostOrRequestHandler === "string") {
            const { hostname, port, protocol, username, password } = new URL(hostOrRequestHandler);
            const host = `${hostname}:${port}`;
            const auth = username || password ? `${username}:${password}` : undefined;
            const opts = {
                agent,
                auth,
                protocol,
                hostname,
                port,
                path,
                method,
                headers: {
                    ...headers,
                    host,
                    "X-Forwarded-Host": headers.host,
                },
            };
            const req = (0, http_1.request)(opts, (response) => {
                const { statusCode, statusMessage, headers } = response;
                if (statusCode === 404) {
                    next();
                }
                else {
                    originalRes.writeHead(statusCode, statusMessage, headers);
                    response.pipe(originalRes);
                }
            });
            originalReq.pipe(req);
            req.on("error", (err) => {
                logger_1.logger.debug("Error encountered while proxying request:", method, path, err);
                originalRes.end();
            });
        }
        else {
            const proxiedRes = proxyResponse(originalReq, originalRes, () => {
                // This next function is called when the proxied response is a 404
                // In that case we want to let the handler to use the original response
                void hostOrRequestHandler(originalReq, originalRes, next);
            });
            await hostOrRequestHandler(originalReq, proxiedRes, next);
        }
    };
}
exports.simpleProxy = simpleProxy;
function scanDependencyTree(searchingFor, dependencies = {}) {
    for (const [name, dependency] of Object.entries(dependencies)) {
        if (name === searchingFor)
            return dependency;
        const result = scanDependencyTree(searchingFor, dependency.dependencies);
        if (result)
            return result;
    }
    return;
}
function getNpmRoot(cwd) {
    let npmRoot = NPM_ROOT_MEMO.get(cwd);
    if (npmRoot)
        return npmRoot;
    npmRoot = (0, cross_spawn_1.sync)("npm", ["root"], {
        cwd,
        timeout: NPM_ROOT_TIMEOUT_MILLIES,
    })
        .stdout?.toString()
        .trim();
    NPM_ROOT_MEMO.set(cwd, npmRoot);
    return npmRoot;
}
exports.getNpmRoot = getNpmRoot;
function getNodeModuleBin(name, cwd) {
    const npmRoot = getNpmRoot(cwd);
    if (!npmRoot) {
        throw new error_1.FirebaseError(`Error finding ${name} executable: failed to spawn 'npm'`);
    }
    const path = (0, path_1.join)(npmRoot, ".bin", name);
    if (!(0, fsutils_1.fileExistsSync)(path)) {
        throw new error_1.FirebaseError(`Could not find the ${name} executable.`);
    }
    return path;
}
exports.getNodeModuleBin = getNodeModuleBin;
const DEFAULT_FIND_DEP_OPTIONS = {
    cwd: process.cwd(),
    omitDev: true,
};
/**
 *
 */
function findDependency(name, options = {}) {
    const { cwd: dir, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
    const cwd = getNpmRoot(dir);
    if (!cwd)
        return;
    const env = Object.assign({}, process.env);
    delete env.NODE_ENV;
    const result = (0, cross_spawn_1.sync)("npm", [
        "list",
        name,
        "--json=true",
        ...(omitDev ? ["--omit", "dev"] : []),
        ...(depth === undefined ? [] : ["--depth", depth.toString(10)]),
    ], { cwd, env, timeout: constants_1.NPM_COMMAND_TIMEOUT_MILLIES });
    if (!result.stdout)
        return;
    try {
        const json = JSON.parse(result.stdout.toString());
        return scanDependencyTree(name, json.dependencies);
    }
    catch (e) {
        // fallback to reading the version directly from package.json if npm list times out
        const packageJson = (0, fs_extra_1.readJsonSync)((0, path_1.join)(cwd, name, "package.json"), { throws: false });
        return packageJson?.version ? { version: packageJson.version } : undefined;
    }
}
exports.findDependency = findDependency;
/**
 *
 */
async function relativeRequire(dir, mod) {
    try {
        // If being compiled with webpack, use non webpack require for these calls.
        // (VSCode plugin uses webpack which by default replaces require calls
        // with its own require, which doesn't work on files)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const requireFunc = 
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore prevent VSCE webpack from erroring on non_webpack_require
        // eslint-disable-next-line camelcase
        typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore prevent VSCE webpack from erroring on non_webpack_require
        const path = requireFunc.resolve(mod, { paths: [dir] });
        let packageJson;
        let isEsm = (0, path_1.extname)(path) === ".mjs";
        if (!isEsm) {
            packageJson = await readJSON((0, path_1.join)((0, path_1.dirname)(path), "package.json")).catch(() => undefined);
            isEsm = packageJson?.type === "module";
        }
        if (isEsm) {
            // in case path resolves to a cjs file, use main from package.json
            if ((0, path_1.extname)(path) === ".cjs" && packageJson?.main) {
                return dynamicImport((0, path_1.join)((0, path_1.dirname)(path), packageJson.main));
            }
            return dynamicImport((0, url_1.pathToFileURL)(path).toString());
        }
        else {
            return requireFunc(path);
        }
    }
    catch (e) {
        const path = (0, path_1.relative)(process.cwd(), dir);
        console.error(`Could not load dependency ${mod} in ${path.startsWith("..") ? path : `./${path}`}, have you run \`npm install\`?`);
        throw e;
    }
}
exports.relativeRequire = relativeRequire;
function conjoinOptions(_opts, conjunction = "and", separator = ",") {
    if (!_opts.length)
        return "";
    const opts = _opts.map((it) => it.toString().trim());
    if (opts.length === 1)
        return opts[0];
    if (opts.length === 2)
        return `${opts[0]} ${conjunction} ${opts[1]}`;
    const lastElement = opts.slice(-1)[0];
    const allButLast = opts.slice(0, -1);
    return `${allButLast.join(`${separator} `)}${separator} ${conjunction} ${lastElement}`;
}
exports.conjoinOptions = conjoinOptions;
function frameworksCallToAction(message, docsUrl = constants_1.DEFAULT_DOCS_URL, prefix = "", framework, version, supportedRange, vite = false) {
    return `${prefix}${message}${framework && supportedRange && (!version || !(0, semver_1.satisfies)(version, supportedRange))
        ? clc.yellow(`\n${prefix}The integration is known to work with ${vite ? "Vite" : framework} version ${clc.italic(conjoinOptions(supportedRange.split("||")))}. You may encounter errors.`)
        : ``}

${prefix}${clc.bold("Documentation:")} ${docsUrl}
${prefix}${clc.bold("File a bug:")} ${constants_1.FILE_BUG_URL}
${prefix}${clc.bold("Submit a feature request:")} ${constants_1.FEATURE_REQUEST_URL}

${prefix}We'd love to learn from you. Express your interest in helping us shape the future of Firebase Hosting: ${constants_1.MAILING_LIST_URL}`;
}
exports.frameworksCallToAction = frameworksCallToAction;
function validateLocales(locales = []) {
    const invalidLocales = locales.filter((locale) => !constants_1.VALID_LOCALE_FORMATS.some((format) => locale.match(format)));
    if (invalidLocales.length) {
        throw new error_1.FirebaseError(`Invalid i18n locales (${invalidLocales.join(", ")}) for Firebase. See our docs for more information https://firebase.google.com/docs/hosting/i18n-rewrites#country-and-language-codes`);
    }
}
exports.validateLocales = validateLocales;
function getFrameworksBuildTarget(purpose, validOptions) {
    const frameworksBuild = process.env.FIREBASE_FRAMEWORKS_BUILD_TARGET;
    if (frameworksBuild) {
        if (!validOptions.includes(frameworksBuild)) {
            throw new error_1.FirebaseError(`Invalid value for FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable: ${frameworksBuild}. Valid values are: ${validOptions.join(", ")}`);
        }
        return frameworksBuild;
    }
    else if (["test", "deploy"].includes(purpose)) {
        return "production";
    }
    // TODO handle other language / frameworks environment variables
    switch (process.env.NODE_ENV) {
        case undefined:
        case "development":
            return "development";
        case "production":
        case "test":
            return "production";
        default:
            throw new error_1.FirebaseError(`We cannot infer your build target from a non-standard NODE_ENV. Please set the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable. Valid values are: ${validOptions.join(", ")}`);
    }
}
exports.getFrameworksBuildTarget = getFrameworksBuildTarget;
//# sourceMappingURL=utils.js.map