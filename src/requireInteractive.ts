import type { Options } from "./options.js";

import { FirebaseError } from "./error.js";

export default function requireInteractive(options: Options) {
  if (options.nonInteractive) {
    return Promise.reject(
      new FirebaseError("This command cannot run in non-interactive mode", {
        exit: 1,
      })
    );
  }
  return Promise.resolve();
}
