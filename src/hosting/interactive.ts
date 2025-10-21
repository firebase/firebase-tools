import { FirebaseError } from "../error";
import { logWarning } from "../utils";
import { needProjectId, needProjectNumber } from "../projectUtils";
import { createSite } from "./api";
import { input } from "../prompt";

const nameSuggestion = new RegExp("try something like `(.+)`");
// const prompt = "Please provide an unique, URL-friendly id for the site (<id>.web.app):";
const prompt =
  "Please provide an unique, URL-friendly id for your site. Your site's URL will be <site-id>.web.app. " +
  'We recommend using letters, numbers, and hyphens (e.g. "{project-id}-{random-hash}"):';

/**
 * Interactively prompt to name a Hosting site.
 */
export async function pickHostingSiteName(
  siteId: string,
  options: { projectId?: string; nonInteractive?: boolean },
): Promise<string> {
  const projectId = needProjectId(options);
  const projectNumber = await needProjectNumber(options);
  let id = siteId;
  let nameConfirmed: boolean = false;
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

  while (!nameConfirmed) {
    if (!id || suggestion) {
      id = await input({
        message: prompt,
        validate: (s: string) => s.length > 0, // Prevents an empty string from being submitted!
        default: suggestion,
      });
    }
    const attempt = await trySiteID(projectNumber, id);
    nameConfirmed = attempt.available;
    suggestion = attempt.suggestion;
    if (!nameConfirmed) id = ""; // Clear so the prompt comes back.
  }
  return id;
}

async function trySiteID(
  projectNumber: string,
  id: string,
  nonInteractive = false,
): Promise<{ available: boolean; suggestion?: string }> {
  try {
    await createSite(projectNumber, id, "", true);
    return { available: true };
  } catch (err: unknown) {
    if (!(err instanceof FirebaseError)) {
      throw err;
    }
    if (nonInteractive) {
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
  } else {
    logWarning(err.message);
  }
  return;
}
