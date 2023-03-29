import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { join } from "path";
import { readFile } from "fs/promises";
import { IncomingMessage, request, ServerResponse } from "http";

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

interface ProxyOptions {
  serve404: boolean;
}

function proxyResponse(original: ServerResponse, next: () => void, options: ProxyOptions) {
  return (response: IncomingMessage | ServerResponse) => {
    const { statusCode, statusMessage } = response;
    if (!statusCode) {
      original.end();
      return;
    }
    if (statusCode === 404 && !options.serve404) {
      return next();
    }
    const headers = "getHeaders" in response ? response.getHeaders() : response.headers;
    original.writeHead(statusCode, statusMessage, headers);
    response.pipe(original);
  };
}

export function simpleProxy(
  hostOrRequestHandler: string | RequestHandler,
  options: ProxyOptions = { serve404: true }
) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const { method, headers, url: path } = req;
    if (!method || !path) {
      return res.end();
    }
    // If the path is a the auth token sync URL pass through to Cloud Functions
    const firebaseDefaultsJSON = process.env.__FIREBASE_DEFAULTS__;
    const authTokenSyncURL: string | undefined =
      firebaseDefaultsJSON && JSON.parse(firebaseDefaultsJSON)._authTokenSyncURL;
    if (path === authTokenSyncURL) {
      return next();
    }
    if (typeof hostOrRequestHandler === "string") {
      const host = hostOrRequestHandler;
      const { hostname, port, protocol } = new URL(host);
      const opts = {
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
      const a = proxyResponse(res, next, options);
      const proxy = request(opts, a);
      req.pipe(proxy);
    } else if (options.serve404) {
      hostOrRequestHandler(req, res);
    } else {
      const proxiedRes = new ServerResponse(req);
      await hostOrRequestHandler(req, proxiedRes);
      proxyResponse(res, next, options)(proxiedRes);
    }
  };
}
