import { FirebaseError } from "./error";
import { Options } from "./options";

export function requireConfig(options: Options): void {
  if (!options.config) {
    throw new FirebaseError("Not in a Firebase project directory (could not locate firebase.json)");
  }
}
