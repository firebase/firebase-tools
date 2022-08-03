import { logError } from "./logError";
import { FirebaseError } from "./error";
import { setupLoggers } from "./utils";

/**
 * Sets up the process to be exited with an error code specified by the error
 * or a default of `2`.
 * Does *not* call process.exit. End the process by returning from the
 * callsite.
 * @param error an Error to be logged.
 */
export function errorOut(error: Error): void {
  let fbError: FirebaseError;
  if (error instanceof FirebaseError) {
    fbError = error;
  } else {
    fbError = new FirebaseError("An unexpected error has occurred.", {
      original: error,
      exit: 2,
    });
  }

  // In case we've not set them up yet, set up loggers.
  setupLoggers();

  logError(fbError);
  process.exitCode = fbError.exit || 2;
}
