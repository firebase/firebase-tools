import { readJSON as originalReadJSON } from "fs-extra";
import type { ReadOptions } from "fs-extra";
import { join } from "path";
import { readFile } from "fs/promises";
import { getSite, getSiteDomains } from "../hosting/api";

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

/**
 * Join the default domain and the custom domains of a Hosting site
 *
 * @param projectId the project id
 * @param siteId the site id
 * @return array of domains
 */
export async function getAllSiteDomains(projectId: string, siteId: string): Promise<string[]> {
  const [hostingDomains, defaultDomain] = await Promise.all([
    getSiteDomains(projectId, siteId),
    getSite(projectId, siteId),
  ]);

  const defaultDomainWithoutHttp = defaultDomain.defaultUrl.replace(/^https?:\/\//, "");

  const allSiteDomains = new Set([
    ...hostingDomains.map(({ domainName }) => domainName),
    defaultDomainWithoutHttp,
    `${projectId}.web.app`,
    `${projectId}.firebaseapp.com`,
  ]);

  return Array.from(allSiteDomains);
}
