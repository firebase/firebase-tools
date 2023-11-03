import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { needProjectNumber } from "../projectUtils";
import { Options } from "../options";
import { promptOnce } from "../prompt";
import { Site, createSite } from "./api";

/**
 * Interactively prompt to create a Hosting site.
 */
export async function interactiveCreateHostingSite(
  siteId: string,
  appId: string,
  options: Options
): Promise<Site> {
  const nameSuggestion = new RegExp("try something like `(.+)`");
  console.error("HELLO NEW FLOW");

  const projectNumber = await needProjectNumber(options);
  let id = siteId;
  let newSite: Site | undefined;
  let suggestion: string | undefined;
  while (!newSite) {
    if (!id || suggestion) {
      id = await promptOnce({
        type: "input",
        message: "Please provide an unique, URL-friendly id for the site (<id>.web.app):",
        // TODO: bkendall@ - it should be possible to use validate_only to check the availability of the site ID.
        validate: (s: string) => s.length > 0, // Prevents an empty string from being submitted!
        default: suggestion,
      });
    }
    try {
      newSite = await createSite(projectNumber, id, appId);
    } catch (err: unknown) {
      if (err instanceof FirebaseError) {
        if (err.status === 400 && err.message.includes("Invalid name:")) {
          const i = err.message.indexOf("Invalid name:");
          logWarning(err.message.substring(i));
          const match = nameSuggestion.exec(err.message);
          if (match) {
            suggestion = match[1];
          }
        }
      } else {
        throw err;
      }
    }
  }
  return newSite;
}
