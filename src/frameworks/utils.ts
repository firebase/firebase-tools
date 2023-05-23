import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { extname, join, relative } from "path";
import { readFile } from "fs/promises";
import { IncomingMessage, request as httpRequest, ServerResponse, Agent } from "http";
import { sync as spawnSync } from "cross-spawn";
import * as clc from "colorette";

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

// Use "true &&"" to keep typescript from compiling this file and rewriting
// the import statement into a require
const { dynamicImport } = require(true && "../dynamicImport");

const NPM_ROOT_TIMEOUT_MILLIES = 2_000;

/**
 * Whether the given string starts with http:// or https://
 */
export function isUrl(url: string): boolean {
  return /^https?:\/\//.test(url);
}

/**
 * add type to readJSON
 */
export function readJSON<JsonType = any>(
  file: string,
  options?: ReadOptions | BufferEncoding | string
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
  defaultBuildScripts: string[]
): Promise<void> {
  const packageJsonBuffer = await readFile(join(dir, "package.json"));
  const packageJson = JSON.parse(packageJsonBuffer.toString());
  const buildScript = packageJson.scripts?.build;

  if (buildScript && !defaultBuildScripts.includes(buildScript)) {
    console.warn(
      `\nWARNING: Your package.json contains a custom build that is being ignored. Only the ${framework} default build script (e.g, "${defaultBuildScripts[0]}") is respected. If you have a more advanced build process you should build a custom integration https://firebase.google.com/docs/hosting/express\n`
    );
  }
}

type RequestHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

export function simpleProxy(hostOrRequestHandler: string | RequestHandler) {
  const agent = new Agent({ keepAlive: true });
  return async (originalReq: IncomingMessage, originalRes: ServerResponse, next: () => void) => {
    const { method, headers, url: path } = originalReq;
    if (!method || !path) {
      originalRes.end();
      return;
    }
    // If the path is a the auth token sync URL pass through to Cloud Functions
    const firebaseDefaultsJSON = process.env.__FIREBASE_DEFAULTS__;
    const authTokenSyncURL: string | undefined =
      firebaseDefaultsJSON && JSON.parse(firebaseDefaultsJSON)._authTokenSyncURL;
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
        originalRes.writeHead(statusCode!, statusMessage, headers);
        response.pipe(originalRes);
      });
      originalReq.pipe(req);
      req.on("error", (err) => {
        logger.debug("Error encountered while proxying request:", method, path, err);
        originalRes.end();
      });
    } else {
      await hostOrRequestHandler(originalReq, originalRes);
    }
  };
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

export function getNpmRoot(cwd: string) {
  return spawnSync("npm", ["root"], { cwd, timeout: NPM_ROOT_TIMEOUT_MILLIES })
    .stdout?.toString()
    .trim();
}

export function getNodeModuleBin(name: string, cwd: string) {
  const cantFindExecutable = new FirebaseError(`Could not find the ${name} executable.`);
  const npmRoot = getNpmRoot(cwd);
  if (!npmRoot) {
    throw cantFindExecutable;
  }
  const path = join(npmRoot, ".bin", name);
  if (!fileExistsSync(path)) {
    throw cantFindExecutable;
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
    { cwd, env, timeout: NPM_COMMAND_TIMEOUT_MILLIES }
  );
  if (!result.stdout) return;
  const json = JSON.parse(result.stdout.toString());
  return scanDependencyTree(name, json.dependencies);
}

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
export function relativeRequire(
  dir: string,
  mod: "next"
): typeof import("next") | typeof import("next")["default"];
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

export function conjoinOptions(
  opts: any[],
  conjunction: string = "and",
  separator: string = ","
): string | undefined {
  if (!opts.length) return;
  if (opts.length === 1) return opts[0].toString();
  if (opts.length === 2) return `${opts[0].toString()} ${conjunction} ${opts[1].toString()}`;
  const lastElement = opts.slice(-1)[0].toString();
  const allButLast = opts.slice(0, -1).map((it) => it.toString());
  return `${allButLast.join(`${separator} `)}${separator} ${conjunction} ${lastElement}`;
}

export function frameworksCallToAction(message: string, docsUrl = DEFAULT_DOCS_URL, prefix = "") {
  return `${prefix}${message}

${prefix}${clc.bold("Documentation:")} ${docsUrl}
${prefix}${clc.bold("File a bug:")} ${FILE_BUG_URL}
${prefix}${clc.bold("Submit a feature request:")} ${FEATURE_REQUEST_URL}

${prefix}We'd love to learn from you. Express your interest in helping us shape the future of Firebase Hosting: ${MAILING_LIST_URL}`;
}

export function validateLocales(locales: string[] | undefined = []) {
  const invalidLocales = locales.filter(
    (locale) => !VALID_LOCALE_FORMATS.some((format) => locale.match(format))
  );
  if (invalidLocales.length) {
    throw new FirebaseError(
      `Invalid i18n locales (${invalidLocales.join(
        ", "
      )}) for Firebase. See our docs for more information https://firebase.google.com/docs/hosting/i18n-rewrites#country-and-language-codes`
    );
  }
}
