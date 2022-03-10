import { FunctionsConfig } from "../firebaseConfig";
import { FirebaseError } from "../error";

/**
 * Normalize Functions config to return functions config in an array form.
 */
export function normalizeConfig(config: FunctionsConfig | undefined): FunctionsConfig {
  if (config === undefined) {
    throw new FirebaseError("No valid functions configuration detected in firebase.json");
  }
  if (Array.isArray(config)) {
    if (config.length < 1) {
      throw new FirebaseError("Requires at least one functions.source in firebase.json.");
    }
    if (config.length > 1) {
      throw new FirebaseError("More than one functions.source detected in firebase.json");
    }
    return [config[0]];
  }
  return [config];
}
