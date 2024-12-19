import * as path from "path";
import fs from "fs";
import sinon from "sinon";

export function resolve(specifier, context, nextResolve) {
  if (specifier.includes("/getAccessToken.js")) {
    return nextResolve(`${import.meta.dirname}/mockAuth.js`, context);
  }
    return nextResolve(specifier, context);
}