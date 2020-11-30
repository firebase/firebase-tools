import { getDefaultHostingSite } from "./getDefaultHostingSite";

/**
 * Ensure that a hosting site is set, fetching it from defaultHostingSite if not already present.
 * @param options command line options passed in.
 */
export async function requireHostingSite(options: any) {
  if (options.site) {
    return Promise.resolve();
  }

  const site = await getDefaultHostingSite(options);
  options.site = site;
}
