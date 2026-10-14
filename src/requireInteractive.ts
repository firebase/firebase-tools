import type { Options } from "./options";

import { FirebaseError } from "./error";

export default function requireInteractive(options: Options) {
  if (options.nonInteractive) {
    return Promise.reject(
      new FirebaseError("This command cannot run in non-interactive mode", {
        exit: 1,
      }),
    );
  }
  return Promise.resolve();
}
