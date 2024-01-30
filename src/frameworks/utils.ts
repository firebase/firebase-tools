import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { dirname, extname, join, relative } from "path";
import { readFile } from "fs/promises";
import { IncomingMessage, request as httpRequest, ServerResponse, Agent } from "http";
import { sync as spawnSync } from "cross-spawn";
import * as clc from "colorette";
import { satisfies as semverSatisfied } from "semver";

import { logger } from "../logger";
import { FirebaseError } from "../error";
import { fileExistsSync } from "../fsutils";
import { pathToFileURL } from "url";
import {
  DEFAULT_DOCS_URL,
  FEATURE_REQUEST_URL,
  FILE_BUG_URL,
  MAILING_LIST_URL,
  NPM_COMMAND_TIMEOUT_MILLIES,
  VALID_LOCALE_FORMATS,
} from "./constants";
import { BUILD_TARGET_PURPOSE, PackageJson, RequestHandler } from "./interfaces";

// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../dynamicImport");

const NPM_ROOT_TIMEOUT_MILLIES = 5_000;
const NPM_ROOT_MEMO = new Map<string, string>();

/**
 * Whether the given string starts with http:// or https://
 */
export function isUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/**
 * add type to readJSON
 *
 * Note: `throws: false` won't work with the async function: https://github.com/jprichardson/node-fs-extra/issues/542
 */
export function readJSON<JsonType = any>(
  file: string,
  options?: ReadOptions | BufferEncoding | string,
): Promise<JsonType> {
  return originalReadJSON(file, options) as Promise<JsonType>;
}

/**
 * Prints a warning if the build script in package.json
 * contains anything other than allowedBuildScripts.
 */
export async function warnIfCustomBuildScript(
  dir: string,
  framework: string,
  defaultBuildScripts: string[],
): Promise<void> {
  const packageJsonBuffer = await readFile(join(dir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const buildScript = packageJson.scripts?.build;

  if (buildScript && !defaultBuildScripts.includes(buildScript)) {
    console.warn(
      `\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`,
    );
  }
}

/**
 * Proxy a HTTP response
 * It uses the Proxy object to intercept the response and buffer it until the
 * response is finished. This allows us to modify the response before sending
 * it back to the client.
 */
export function proxyResponse(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
): ServerResponse {
  const proxiedRes = new ServerResponse(req);
  // Object to store the original response methods
  const buffer: [
    string,
    Parameters<ServerResponse["write" | "setHeader" | "removeHeader" | "writeHead" | "end"]>,
  ][] = [];

  // Proxy the response methods
  // The apply handler is called when the method e.g. write, setHeader, etc. is called
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy/handler/apply
  // The target is the original method
  // The thisArg is the proxied response
  // The args are the arguments passed to the method
  proxiedRes.write = new Proxy(proxiedRes.write.bind(proxiedRes), {
    apply: (
      target: ServerResponse["write"],
      thisArg: ServerResponse,
      args: Parameters<ServerResponse["write"]>,
    ) => {
      // call the original write method on the proxied response
      target.call(thisArg, ...args);
      // store the method call in the buffer
      buffer.push(["write", args]);
    },
  });

  proxiedRes.setHeader = new Proxy(proxiedRes.setHeader.bind(proxiedRes), {
    apply: (
      target: ServerResponse["setHeader"],
      thisArg: ServerResponse,
      args: Parameters<ServerResponse["setHeader"]>,
    ) => {
      target.call(thisArg, ...args);
      buffer.push(["setHeader", args]);
    },
  });
  proxiedRes.removeHeader = new Proxy(proxiedRes.removeHeader.bind(proxiedRes), {
    apply: (
      target: ServerResponse["removeHeader"],
      thisArg: ServerResponse,
      args: Parameters<ServerResponse["removeHeader"]>,
    ) => {
      target.call(thisArg, ...args);
      buffer.push(["removeHeader", args]);
    },
  });
  proxiedRes.writeHead = new Proxy(proxiedRes.writeHead.bind(proxiedRes), {
    apply: (
      target: ServerResponse["writeHead"],
      thisArg: ServerResponse,
      args: Parameters<ServerResponse["writeHead"]>,
    ) => {
      target.call(thisArg, ...args);
      buffer.push(["writeHead", args]);
    },
  });
  proxiedRes.end = new Proxy(proxiedRes.end.bind(proxiedRes), {
    apply: (
      target: ServerResponse["end"],
      thisArg: ServerResponse,
      args: Parameters<ServerResponse["end"]>,
    ) => {
      // call the original end method on the proxied response
      target.call(thisArg, ...args);
      // if the proxied response is a 404, call next to continue down the middleware chain
      // otherwise, send the buffered response i.e. call the original response methods: write, setHeader, etc.
      // and then end the response and clear the buffer
      if (proxiedRes.statusCode === 404) {
        next();
      } else {
        for (const [fn, args] of buffer) {
          (res as any)[fn](...args);
        }
        res.end(...args);
        buffer.length = 0;
      }
    },
  });

  return proxiedRes;
}

export function simpleProxy(hostOrRequestHandler: string | RequestHandler) {
  const agent = new Agent({ keepAlive: true });
  // If the path is a the auth token sync URL pass through to Cloud Functions
  const firebaseDefaultsJSON = process.env.__FIREBASE_DEFAULTS__;
  const authTokenSyncURL: string | undefined =
    firebaseDefaultsJSON && JSON.parse(firebaseDefaultsJSON)._authTokenSyncURL;
  return async (originalReq: IncomingMessage, originalRes: ServerResponse, next: () => void) => {
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
      const req = httpRequest(opts, (response) => {
        const { statusCode, statusMessage, headers } = response;
        if (statusCode === 404) {
          next();
        } else {
          originalRes.writeHead(statusCode!, statusMessage, headers);
          response.pipe(originalRes);
        }
      });
      originalReq.pipe(req);
      req.on("error", (err) => {
        logger.debug("Error encountered while proxying request:", method, path, err);
        originalRes.end();
      });
    } else {
      const proxiedRes = proxyResponse(originalReq, originalRes, next);
      await hostOrRequestHandler(originalReq, proxiedRes, next);
    }
  };
}

function scanDependencyTree(searchingFor: string, dependencies = {}): any {
  for (const [name, dependency] of Object.entries(
    dependencies as Record<string, Record<string, any>>,
  )) {
    if (name === searchingFor) return dependency;
    const result = scanDependencyTree(searchingFor, dependency.dependencies);
    if (result) return result;
  }
  return;
}

export function getNpmRoot(cwd: string) {
  let npmRoot = NPM_ROOT_MEMO.get(cwd);
  if (npmRoot) return npmRoot;

  npmRoot = spawnSync("npm", ["root"], {
    cwd,
    timeout: NPM_ROOT_TIMEOUT_MILLIES,
  })
    .stdout?.toString()
    .trim();

  NPM_ROOT_MEMO.set(cwd, npmRoot);

  return npmRoot;
}

export function getNodeModuleBin(name: string, cwd: string) {
  const npmRoot = getNpmRoot(cwd);
  if (!npmRoot) {
    throw new FirebaseError(`Error finding ${name} executable: failed to spawn 'npm'`);
  }
  const path = join(npmRoot, ".bin", name);
  if (!fileExistsSync(path)) {
    throw new FirebaseError(`Could not find the ${name} executable.`);
  }
  return path;
}

interface FindDepOptions {
  cwd: string;
  depth?: number;
  omitDev: boolean;
}

const DEFAULT_FIND_DEP_OPTIONS: FindDepOptions = {
  cwd: process.cwd(),
  omitDev: true,
};

/**
 *
 */
export function findDependency(name: string, options: Partial<FindDepOptions> = {}) {
  const { cwd: dir, depth, omitDev } = { ...DEFAULT_FIND_DEP_OPTIONS, ...options };
  const cwd = getNpmRoot(dir);
  if (!cwd) return;
  const env: any = Object.assign({}, process.env);
  delete env.NODE_ENV;
  const result = spawnSync(
    "npm",
    [
      "list",
      name,
      "--json=true",
      ...(omitDev ? ["--omit", "dev"] : []),
      ...(depth === undefined ? [] : ["--depth", depth.toString(10)]),
    ],
    { cwd, env, timeout: NPM_COMMAND_TIMEOUT_MILLIES },
  );
  if (!result.stdout) return;
  const json = JSON.parse(result.stdout.toString());
  return scanDependencyTree(name, json.dependencies);
}

export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/core",
): Promise<typeof import("@angular-devkit/core")>;
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/core/node",
): Promise<typeof import("@angular-devkit/core/node")>;
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/architect",
): Promise<typeof import("@angular-devkit/architect")>;
export function relativeRequire(
  dir: string,
  mod: "@angular-devkit/architect/node",
): Promise<typeof import("@angular-devkit/architect/node")>;
export function relativeRequire(
  dir: string,
  mod: "next/dist/build",
): Promise<typeof import("next/dist/build")>;
export function relativeRequire(
  dir: string,
  mod: "next/dist/server/config",
): Promise<typeof import("next/dist/server/config")>;
export function relativeRequire(
  dir: string,
  mod: "next/constants",
): Promise<typeof import("next/constants")>;
export function relativeRequire(
  dir: string,
  mod: "next",
): Promise<typeof import("next") | (typeof import("next"))["default"]>;
export function relativeRequire(dir: string, mod: "vite"): Promise<typeof import("vite")>;
export function relativeRequire(
  dir: string,
  mod: "jsonc-parser",
): Promise<typeof import("jsonc-parser")>;

// TODO the types for @nuxt/kit are causing a lot of troubles, need to do something other than any
// Nuxt 2
export function relativeRequire(dir: string, mod: "nuxt/dist/nuxt.js"): Promise<any>;
// Nuxt 3
export function relativeRequire(dir: string, mod: "@nuxt/kit"): Promise<any>;

/**
 *
 */
export async function relativeRequire(dir: string, mod: string) {
  try {
    // If being compiled with webpack, use non webpack require for these calls.
    // (VSCode plugin uses webpack which by default replaces require calls
    // with its own require, which doesn't work on files)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const requireFunc: typeof require =
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore prevent VSCE webpack from erroring on non_webpack_require
      // eslint-disable-next-line camelcase
      typeof __webpack_require__ === "function" ? __non_webpack_require__ : require;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore prevent VSCE webpack from erroring on non_webpack_require
    const path = requireFunc.resolve(mod, { paths: [dir] });

    let packageJson: PackageJson | undefined;
    let isEsm = extname(path) === ".mjs";
    if (!isEsm) {
      packageJson = await readJSON<PackageJson | undefined>(
        join(dirname(path), "package.json"),
      ).catch(() => undefined);

      isEsm = packageJson?.type === "module";
    }

    if (isEsm) {
      // in case path resolves to a cjs file, use main from package.json
      if (extname(path) === ".cjs" && packageJson?.main) {
        return dynamicImport(join(dirname(path), packageJson.main));
      }

      return dynamicImport(pathToFileURL(path).toString());
    } else {
      return requireFunc(path);
    }
  } catch (e) {
    const path = relative(process.cwd(), dir);
    console.error(
      `Could not load dependency ${mod} in ${
        path.startsWith("..") ? path : `./${path}`
      }, have you run \`npm install\`?`,
    );
    throw e;
  }
}

export function conjoinOptions(_opts: any[], conjunction = "and", separator = ","): string {
  if (!_opts.length) return "";
  const opts: string[] = _opts.map((it) => it.toString().trim());
  if (opts.length === 1) return opts[0];
  if (opts.length === 2) return `${opts[0]} ${conjunction} ${opts[1]}`;
  const lastElement = opts.slice(-1)[0];
  const allButLast = opts.slice(0, -1);
  return `${allButLast.join(`${separator} `)}${separator} ${conjunction} ${lastElement}`;
}

export function frameworksCallToAction(
  message: string,
  docsUrl = DEFAULT_DOCS_URL,
  prefix = "",
  framework?: string,
  version?: string,
  supportedRange?: string,
  vite = false,
): string {
  return `${prefix}${message}${
    framework && supportedRange && (!version || !semverSatisfied(version, supportedRange))
      ? clc.yellow(
          `\n${prefix}The integration is known to work with ${
            vite ? "Vite" : framework
          } version ${clc.italic(
            conjoinOptions(supportedRange.split("||")),
          )}. You may encounter errors.`,
        )
      : ``
  }

${prefix}${clc.bold("Documentation:")} ${docsUrl}
${prefix}${clc.bold("File a bug:")} ${FILE_BUG_URL}
${prefix}${clc.bold("Submit a feature request:")} ${FEATURE_REQUEST_URL}

${prefix}We'd love to learn from you. Express your interest in helping us shape the future of Firebase Hosting: ${MAILING_LIST_URL}`;
}

export function validateLocales(locales: string[] | undefined = []) {
  const invalidLocales = locales.filter(
    (locale) => !VALID_LOCALE_FORMATS.some((format) => locale.match(format)),
  );
  if (invalidLocales.length) {
    throw new FirebaseError(
      `Invalid i18n locales (${invalidLocales.join(
        ", ",
      )}) for Firebase. See our docs for more information https://firebase.google.com/docs/hosting/i18n-rewrites#country-and-language-codes`,
    );
  }
}

export function getFrameworksBuildTarget(purpose: BUILD_TARGET_PURPOSE, validOptions: string[]) {
  const frameworksBuild = process.env.FIREBASE_FRAMEWORKS_BUILD_TARGET;
  if (frameworksBuild) {
    if (!validOptions.includes(frameworksBuild)) {
      throw new FirebaseError(
        `Invalid value for FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable: ${frameworksBuild}. Valid values are: ${validOptions.join(
          ", ",
        )}`,
      );
    }
    return frameworksBuild;
  } else if (["test", "deploy"].includes(purpose)) {
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
      throw new FirebaseError(
        `We cannot infer your build target from a non-standard NODE_ENV. Please set the FIREBASE_FRAMEWORKS_BUILD_TARGET environment variable. Valid values are: ${validOptions.join(
          ", ",
        )}`,
      );
  }
}
