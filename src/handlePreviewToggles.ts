import { unset, has } from "lodash";
import { bold } from "cli-color";

import { configstore } from "./configstore";
import * as previews from "./previews";

function errorOut(name: string): void {
  console.log(bold.red("Error:"), "Did not recognize preview feature", bold(name));
  process.exit(1);
}

/**
 * handlePreviewToggles sets the preview flag as provided in the argument
 * and saves it in the CLI's config.
 * @param args commander args.
 * @return void.
 */
export function handlePreviewToggles(args: string[]): void {
  const previewFeature = args[1];
  const isValidPreview = has(previews, previewFeature);
  if (args[0] === "--open-sesame") {
    if (isValidPreview) {
      console.log("Enabling preview feature", bold(previewFeature) + "...");
      const newPreviews = Object.assign({}, previews, { [previewFeature]: true });
      configstore.set("previews", newPreviews);
      console.log("Preview feature enabled!");
      return process.exit(0);
    }
    return errorOut(previewFeature);
  } else if (args[0] === "--close-sesame") {
    if (isValidPreview) {
      console.log("Disabling preview feature", bold(previewFeature));
      const newPreviews = Object.assign({}, previews);
      unset(newPreviews, previewFeature);
      configstore.set("previews", newPreviews);
      return process.exit(0);
    }
    return errorOut(previewFeature);
  }
  return;
}
