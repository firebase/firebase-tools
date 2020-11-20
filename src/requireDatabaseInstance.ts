import * as clc from "cli-color";
import { FirebaseError } from "./error";
import { getDefaultDatabaseInstance } from "./getDefaultDatabaseInstance";
import * as utils from "./utils";

/**
 * Ensures that the supplied options have an instance set. If not, tries to fetch the default instance.
 * @param options command options
 * @return void promise.
 */
export async function requireDatabaseInstance(options: any): Promise<void> {
  if (options.instance) {
    return Promise.resolve();
  }
  let instance;
  try {
    instance = await getDefaultDatabaseInstance(options);
  } catch (err) {
    return utils.reject(`Failed to get details for project: ${options.project}.`, {
      original: err,
    });
  }
  if (instance === "") {
    throw new FirebaseError(
      `It looks like you haven't created a Realtime Database instance in this project before. Go to ${clc.bold.underline(
        `https://console.firebase.google.com/project/${options.project}/database`
      )} to create your default Realtime Database instance.`
    );
  }
  options.instance = instance;
  return;
}
