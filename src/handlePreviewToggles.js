"use strict";

import { unset, has } from "lodash";
import { bold } from "cli-color";

import { configstore } from "./configstore";
import * as previews from "./previews";

function _errorOut(name) {
  console.log(bold.red("Error:"), "Did not recognize preview feature", bold(name));
  process.exit(1);
}

module.exports = function(args) {
  const isValidPreview = has(previews, args[1]);
  if (args[0] === "--open-sesame") {
    if (isValidPreview) {
      console.log("Enabling preview feature", bold(args[1]) + "...");
      const newPreviews = Object.assign({}, previews, { [args[1]]: true });
      configstore.set("previews", newPreviews);
      console.log("Preview feature enabled!");
      return process.exit(0);
    }

    _errorOut();
  } else if (args[0] === "--close-sesame") {
    if (isValidPreview) {
      console.log("Disabling preview feature", bold(args[1]));
      const newPreviews = Object.assign({}, previews);
      unset(newPreviews, args[1]);
      configstore.set("previews", newPreviews);
      return process.exit(0);
    }

    _errorOut();
  }

  return undefined;
};
