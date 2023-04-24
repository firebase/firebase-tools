import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { join } from "path";
import { readFile } from "fs/promises";
import { IncomingMessage, request as httpRequest, ServerResponse, Agent } from "http";
import { logger } from "../logger";

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
      return originalRes.end();
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
