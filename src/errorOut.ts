import { logError } from "./logError";
import { FirebaseError } from "./error";
import { maybeLaunchGemini } from "./gemini";
import { findAvailableLogFile } from "./logger";
import { Options } from "./options";

/**
 * Errors out by calling `process.exit` with an exit code of 2.
 * @param error an Error to be logged.
 */
export async function errorOut(error: Error, options?: Options): Promise<void> {
  let fbError: FirebaseError;
  if (error instanceof FirebaseError) {
    fbError = error;
  } else {
    fbError = new FirebaseError("An unexpected error has occurred.", {
      original: error,
      exit: 2,
    });
  }

  logError(fbError);

  if (options?.command === "deploy") {
    const logFile = findAvailableLogFile();
    await maybeLaunchGemini(fbError, logFile, options);
  }

  process.exitCode = fbError.exit || 2;
  setTimeout(() => {
    process.exit();
  }, 250);
}
