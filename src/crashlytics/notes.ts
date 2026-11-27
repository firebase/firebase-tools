import { logger } from "../logger";
import { FirebaseError, getError } from "../error";
import { CRASHLYTICS_API_CLIENT, parseProjectNumber, TIMEOUT } from "./utils";
import { Note } from "./types";

type NoteRequest = {
  body: string;
};

/**
 * Create a Crashlytics note for an issue.
 * @param appId Firebase app id
 * @param issueId Crashlytics issue id
 * @param note The note to add
 * @return the created Note
 */
export async function createNote(appId: string, issueId: string, note: string): Promise<Note> {
  const requestProjectNumber = parseProjectNumber(appId);
  logger.debug(
    `[crashlytics] createNote called with appId: ${appId}, issueId: ${issueId}, note: ${note}`,
  );
  try {
    const response = await CRASHLYTICS_API_CLIENT.request<NoteRequest, Note>({
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`,
      body: { body: note },
      timeout: TIMEOUT,
    });

    return response.body;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to create note for issue ${issueId}, app ${appId}`, {
      original: getError(err),
    });
  }
}

/**
 * Delete a Crashlytics note from an issue.
 * @param appId Firebase app id
 * @param issueId Crashlytics issue id
 * @param noteId Crashlytics note id
 */
export async function deleteNote(appId: string, issueId: string, noteId: string): Promise<string> {
  const requestProjectNumber = parseProjectNumber(appId);
  logger.debug(
    `[crashlytics] deleteNote called with appId: ${appId}, issueId: ${issueId}, noteId: ${noteId}`,
  );
  await CRASHLYTICS_API_CLIENT.request<void, void>({
    method: "DELETE",
    path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes/${noteId}`,
    timeout: TIMEOUT,
  });
  return `Deleted note ${noteId}`;
}

/**
 * Lists Crashlytics notes for an issue.
 * @param appId Firebase app id
 * @param issueId Crashlytics issue id
 * @param pageSize The number of notes to return
 * @return A list of notes
 */
export async function listNotes(appId: string, issueId: string, pageSize = 20): Promise<Note[]> {
  const requestProjectNumber = parseProjectNumber(appId);
  const queryParams = new URLSearchParams();
  queryParams.set("page_size", `${pageSize}`);
  logger.debug(
    `[crashlytics] listNotes called with appId: ${appId}, issueId: ${issueId}, pageSize: ${pageSize}`,
  );
  const response = await CRASHLYTICS_API_CLIENT.request<void, { notes: Note[] }>({
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    path: `/projects/${requestProjectNumber}/apps/${appId}/issues/${issueId}/notes`,
    queryParams: queryParams,
    timeout: TIMEOUT,
  });
  return response.body.notes || [];
}
