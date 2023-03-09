import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { join } from "path";
import { readFile } from "fs/promises";
import { IncomingMessage, request, ServerResponse } from "http";
import { parse } from "url";

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

export function simpleProxy(host: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const { method, headers, url: path } = req;
    if (!method || !path) {
      return res.end();
    }
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
    const proxy = request(opts, (proxyResponse) => {
      if (!proxyResponse.statusCode) {
        return res.end();
      }
      res.writeHead(proxyResponse.statusCode, proxyResponse.headers);
      proxyResponse.pipe(res);
    });
    req.pipe(proxy);
  };
}
