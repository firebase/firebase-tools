import { FirebaseError } from "./error";
import { Options } from "./options";

/**
 * Rejects if there is no config in `options`.
 */
export async function requireConfig(options: Options): Promise<void> {
  return new Promise((resolve, reject) =>
    options.config
      ? resolve()
      : reject(
          options.configError ??
            new FirebaseError(
              "Not in a Firebase project directory (could not locate firebase.json)",
            ),
        ),
  );
}
