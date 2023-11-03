import { bold } from "colorette";
import { FirebaseError } from "./error";
import { errNoDefaultSite, getDefaultHostingSite } from "./getDefaultHostingSite";

/**
 * Ensure that a hosting site is set, fetching it from defaultHostingSite if not already present.
 * @param options command line options passed in.
 */
export async function requireHostingSite(options: any) {
  if (options.site) {
    return Promise.resolve();
  }

  try {
    const site = await getDefaultHostingSite(options);
    options.site = site;
  } catch (err: unknown) {
    if (err === errNoDefaultSite) {
      throw new FirebaseError(
        `Unable to create a channel as there is no Hosting site. Use ${bold(
          "firebase hosting:sites:create"
        )} to create a site.`
      );
    }
  }
}
