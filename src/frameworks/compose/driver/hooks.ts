import { AppBundle, Hook } from "../interfaces";

export const BUNDLE_PATH = "./.firebase/bundle.json" as const;

/**
 * Generate a script that wraps the given hook to output the resulting AppBundle
 * to a well-known path.
 */
export function genHookScript(bundle: AppBundle, hook: Hook): string {
  return `
const fs = require("node:fs");
const path = require("node:path");

const bundleDir = path.dirname("${BUNDLE_PATH}");
if (!fs.existsSync(bundleDir)) {
  fs.mkdirSync(path.dirname("${BUNDLE_PATH}"));
}
const bundle = (${hook.toString()})(${JSON.stringify(bundle)});
fs.writeFileSync("${BUNDLE_PATH}", JSON.stringify(bundle));
`;
}
