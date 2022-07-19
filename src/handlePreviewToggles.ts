import { unset, has } from "lodash";
import { bold } from "cli-color";

import { configstore } from "./configstore";
import { previews } from "./previews";
import { FirebaseError } from "./error";

/**
 * Checks for `--[open|close]-sesame` flags and handles them.
 */
export function handlePreviewToggles(args: string[]): void {
  const isValidPreview = has(previews, args[1]);
  if (args[0] === "--open-sesame") {
    if (isValidPreview) {
      console.log("Enabling preview feature", bold(args[1]) + "...");
      (previews as any)[args[1]] = true;
      configstore.set("previews", previews);
      console.log("Preview feature enabled!");
      return process.exit(0);
    }

    throw new FirebaseError(`Did not recognize preview feature ${bold(args[1])}`);
  } else if (args[0] === "--close-sesame") {
    if (isValidPreview) {
      console.log("Disabling preview feature", bold(args[1]));
      unset(previews, args[1]);
      configstore.set("previews", previews);
      return process.exit(0);
    }

    throw new FirebaseError(`Did not recognize preview feature ${bold(args[1])}`);
  }
}
