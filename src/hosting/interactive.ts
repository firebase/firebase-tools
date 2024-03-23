import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { promptOnce } from "../prompt";
import { Site, createSite } from "./api";

const nameSuggestion = new RegExp("try something like `(.+)`");
// const prompt = "Please provide an unique, URL-friendly id for the site (<id>.web.app):";
const prompt =
  "Please provide an unique, URL-friendly id for your site. Your site's URL will be <site-id>.web.app. " +
  'We recommend using letters, numbers, and hyphens (e.g. "{project-id}-{random-hash}"):';

/**
 * Interactively prompt to create a Hosting site.
 */
export async function interactiveCreateHostingSite(
  siteId: string,
  appId: string,
  options: { projectId?: string; nonInteractive?: boolean },
): Promise<Site> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  let id = siteId;
  let newSite: Site | undefined;
  let suggestion: string | undefined;

  // If we were given an ID, we're going to start with that, so don't check the project ID.
  // If we weren't given an ID, let's _suggest_ the project ID as the site name (or a variant).
  if (!id) {
    const attempt = await trySiteID(projectNumber, projectId);
    if (attempt.available) {
      suggestion = projectId;
    } else {
      suggestion = attempt.suggestion;
    }
  }

  while (!newSite) {
    if (!id || suggestion) {
      id = await promptOnce({
        type: "input",
        message: prompt,
        validate: (s: string) => s.length > 0, // Prevents an empty string from being submitted!
        default: suggestion,
      });
    }
    try {
      newSite = await createSite(projectNumber, id, appId);
    } catch (err: unknown) {
      if (!(err instanceof FirebaseError)) {
        throw err;
      }
      if (options.nonInteractive) {
        throw err;
      }

      suggestion = getSuggestionFromError(err);
    }
  }
  return newSite;
}

async function trySiteID(
  projectNumber: string,
  id: string,
): Promise<{ available: boolean; suggestion?: string }> {
  try {
    await createSite(projectNumber, id, "", true);
    return { available: true };
  } catch (err: unknown) {
    if (!(err instanceof FirebaseError)) {
      throw err;
    }
    const suggestion = getSuggestionFromError(err);
    return { available: false, suggestion };
  }
}

function getSuggestionFromError(err: FirebaseError): string | undefined {
  if (err.status === 400 && err.message.includes("Invalid name:")) {
    const i = err.message.indexOf("Invalid name:");
    logWarning(err.message.substring(i));
    const match = nameSuggestion.exec(err.message);
    if (match) {
      return match[1];
    }
  }
  return;
}
