import { logError } from "./logError";
import { FirebaseError } from "./error";

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

  logError(fbError);
  process.exitCode = fbError.exit || 2;
}
