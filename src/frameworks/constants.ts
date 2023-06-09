import { readdirSync, statSync } from "fs";
import { join } from "path";
import { Framework, SupportLevel } from "./interfaces";
import * as clc from "colorette";

export const NPM_COMMAND_TIMEOUT_MILLIES = 10_000;

export const SupportLevelWarnings = {
  [SupportLevel.Experimental]: (framework: string) => `Thank you for trying our ${clc.italic(
    "experimental"
  )} support for ${framework} on Firebase Hosting.
   ${clc.yellow(`While this integration is maintained by Googlers it is not a supported Firebase product.
   Issues filed on GitHub will be addressed on a best-effort basis by maintainers and other community members.`)}`,
  [SupportLevel.Preview]: (framework: string) => `Thank you for trying our ${clc.italic(
    "early preview"
  )} of ${framework} support on Firebase Hosting.
   ${clc.yellow(
     "During the preview, support is best-effort and breaking changes can be expected. Proceed with caution."
   )}`,
};

export const DEFAULT_DOCS_URL =
  "https://firebase.google.com/docs/hosting/frameworks/frameworks-overview";
export const FILE_BUG_URL =
  "https://github.com/firebase/firebase-tools/issues/new?template=bug_report.md";
export const FEATURE_REQUEST_URL =
  "https://github.com/firebase/firebase-tools/issues/new?template=feature_request.md";
export const MAILING_LIST_URL = "https://goo.gle/41enW5X";

export const FIREBASE_FRAMEWORKS_VERSION = "^0.10.1";
export const FIREBASE_FUNCTIONS_VERSION = "^4.3.0";
export const FIREBASE_ADMIN_VERSION = "^11.0.1";
export const SHARP_VERSION = "^0.32.1";
export const NODE_VERSION = parseInt(process.versions.node, 10);
export const VALID_ENGINES = { node: [16, 18, 20] };

export const VALID_LOCALE_FORMATS = [/^ALL_[a-z]+$/, /^[a-z]+_ALL$/, /^[a-z]+(_[a-z]+)?$/];

export const DEFAULT_REGION = "us-central1";
export const ALLOWED_SSR_REGIONS = [
  { name: "us-central1 (Iowa)", value: "us-central1" },
  { name: "us-west1 (Oregon)", value: "us-west1" },
  { name: "us-east1 (South Carolina)", value: "us-east1" },
  { name: "europe-west1 (Belgium)", value: "europe-west1" },
  { name: "asia-east1 (Taiwan)", value: "asia-east1" },
];

export const I18N_ROOT = "/";

export const WebFrameworks: Record<string, Framework> = Object.fromEntries(
  readdirSync(__dirname)
    .filter((path) => statSync(join(__dirname, path)).isDirectory())
    .map((path) => {
      // If not called by the CLI, (e.g., by the VS Code Extension)
      // __dirname won't refer to this folder and these files won't be available.
      // Instead it may find sibling folders that aren't modules, and this
      // require will throw.
      // Long term fix may be to bundle this instead of reading files at runtime
      // but for now, this prevents crashing.
      try {
        return [path, require(join(__dirname, path))];
      } catch (e) {
        return [];
      }
    })
    .filter(
      ([, obj]) =>
        obj && obj.name && obj.discover && obj.build && obj.type !== undefined && obj.support
    )
);

export function GET_DEFAULT_BUILD_TARGETS() {
  return Promise.resolve(["production", "development"]);
}

export function DEFAULT_SHOULD_USE_DEV_MODE_HANDLE(target: string) {
  return Promise.resolve(target === "development");
}
