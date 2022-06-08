"use strict";

import lodash from "lodash";
const { unset, has } = lodash;
import clccolor from "cli-color";
const { bold } = clccolor;

import { configstore } from "./configstore.js";
import { previews } from "./previews.js";

function _errorOut(name?: string) {
  console.log(bold.red("Error:"), "Did not recognize preview feature", bold(name));
  process.exit(1);
}

export function handlePreviewToggles(args: string[]) {
  const isValidPreview = has(previews, args[1]);
  if (args[0] === "--open-sesame") {
    if (isValidPreview) {
      console.log("Enabling preview feature", bold(args[1]) + "...");
      (previews as any)[args[1]] = true;
      configstore.set("previews", previews);
      console.log("Preview feature enabled!");
      return process.exit(0);
    }

    _errorOut();
  } else if (args[0] === "--close-sesame") {
    if (isValidPreview) {
      console.log("Disabling preview feature", bold(args[1]));
      unset(previews, args[1]);
      configstore.set("previews", previews);
      return process.exit(0);
    }

    _errorOut();
  }
}
