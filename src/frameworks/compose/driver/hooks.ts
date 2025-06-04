import { AppBundle, Hook } from "../interfaces";

export const BUNDLE_PATH = "/home/firebase/app/.firebase/.output/bundle.json" as const;

/**
 * Generate a script that wraps the given hook to output the resulting AppBundle
 * to a well-known path.
 */
export function genHookScript(bundle: AppBundle, hook: Hook): string {
  let hookSrc = hook.toString().trimLeft();
  // Hook must be IIFE-able. All hook functions are IFFE-able without modification
  // except for function defined inside an object in the following form:
  //
  //   {
  //      afterInstall(b) {
  //        ...
  // .    }
  //   }
  //
  // We detect and transform function defined in this form by prefixing "functions "
  if (!hookSrc.startsWith("(") && !hookSrc.startsWith("function ")) {
    hookSrc = `function ${hookSrc}`;
  }
  return `
const fs = require("node:fs");
const path = require("node:path");

const bundleDir = path.dirname("${BUNDLE_PATH}");
if (!fs.existsSync(bundleDir)) {
  fs.mkdirSync(bundleDir, { recursive: true });
}
const bundle = (${hookSrc})(${JSON.stringify(bundle)});
fs.writeFileSync("${BUNDLE_PATH}", JSON.stringify(bundle));
`;
}
