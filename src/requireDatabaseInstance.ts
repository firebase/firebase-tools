import * as clc from "colorette";
import { FirebaseError } from "./error";
import { getDefaultDatabaseInstance } from "./getDefaultDatabaseInstance";

/**
 * Error message to be returned when the default database instance is found to be missing.
 */
export const MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE = `It looks like you haven't created a Realtime Database instance in this project before. Please run ${clc.bold(
  clc.underline("firebase init database"),
)} to create your default Realtime Database instance.`;

/**
 * Ensures that the supplied options have an instance set. If not, tries to fetch the default instance.
 * @param options command options
 * @return void promise.
 */
export async function requireDatabaseInstance(options: any): Promise<void> {
  if (options.instance) {
    return;
  }
  let instance;
  try {
    instance = await getDefaultDatabaseInstance(options);
  } catch (err: any) {
    throw new FirebaseError(`Failed to get details for project: ${options.project}.`, {
      original: err,
    });
  }
  if (instance === "") {
    throw new FirebaseError(MISSING_DEFAULT_INSTANCE_ERROR_MESSAGE);
  }
  options.instance = instance;
}
