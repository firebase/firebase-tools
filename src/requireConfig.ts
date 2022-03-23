import { FirebaseError } from "./error";
import { Options } from "./options";

export async function requireConfig(options: Options): Promise<void> {
  await Promise.resolve(); // Allows this function to remain `async`.
  if (!options.config) {
    throw options.configError
      ? options.configError
      : new FirebaseError("Not in a Firebase project directory (could not locate firebase.json)");
  }
}
