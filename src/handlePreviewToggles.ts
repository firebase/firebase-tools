import { unset, has } from "lodash";
import { bold, red } from "colorette";

import { configstore } from "./configstore";
import { previews } from "./previews";
import { FirebaseError } from "./error";

/**
 * Checks for `--[open|close]-sesame` flags and handles them.
 * Returns true if a a flag was provided and handled.
 */
export function handlePreviewToggles(args: string[]): boolean {
  const isValidPreview = has(previews, args[1]);
  if (args[0] === "--open-sesame") {
    if (!isValidPreview) {
      throw new FirebaseError(`Did not recognize preview feature ${bold(args[1])}`);
    }
    console.log("Enabling preview feature", bold(args[1]) + "...");
    (previews as any)[args[1]] = true;
    configstore.set("previews", previews);
    console.log("Preview feature enabled!");
    return true;
  } else if (args[0] === "--close-sesame") {
    if (!isValidPreview) {
      throw new FirebaseError(`Did not recognize preview feature ${bold(args[1])}`);
    }
    console.log("Disabling preview feature", bold(args[1]));
    unset(previews, args[1]);
    configstore.set("previews", previews);
    return true;
  }
  return false;
}
