import { SupportLevel } from "./interfaces";
import * as clc from "colorette";
import * as experiments from "../experiments";

export const NPM_COMMAND_TIMEOUT_MILLIES = 10_000;

export const SupportLevelWarnings = {
  [SupportLevel.Experimental]: (framework: string) => `Thank you for trying our ${clc.italic(
    "experimental",
  )} support for ${framework} on Firebase Hosting.
   ${clc.red(`While this integration is maintained by Googlers it is not a supported Firebase product.
   Issues filed on GitHub will be addressed on a best-effort basis by maintainers and other community members.`)}`,
  [SupportLevel.Preview]: (framework: string) => `Thank you for trying our ${clc.italic(
    "early preview",
  )} of ${framework} support on Firebase Hosting.
   ${clc.red(
     "During the preview, support is best-effort and breaking changes can be expected. Proceed with caution.",
   )}`,
};

export const DEFAULT_DOCS_URL =
  "https://firebase.google.com/docs/hosting/frameworks/frameworks-overview";
export const FILE_BUG_URL =
  "https://github.com/firebase/firebase-tools/issues/new?template=bug_report.md";
export const FEATURE_REQUEST_URL =
  "https://github.com/firebase/firebase-tools/issues/new?template=feature_request.md";
export const MAILING_LIST_URL = "https://goo.gle/41enW5X";

const DEFAULT_FIREBASE_FRAMEWORKS_VERSION = "^0.11.0";
export const FIREBASE_FRAMEWORKS_VERSION =
  (experiments.isEnabled("internaltesting") && process.env.FIREBASE_FRAMEWORKS_VERSION) ||
  DEFAULT_FIREBASE_FRAMEWORKS_VERSION;
export const FIREBASE_FUNCTIONS_VERSION = "^4.5.0";
export const FIREBASE_ADMIN_VERSION = "^11.11.1";
export const SHARP_VERSION = "^0.32.1";
export const NODE_VERSION = parseInt(process.versions.node, 10);
export const VALID_ENGINES = { node: [16, 18, 20] };

export const VALID_LOCALE_FORMATS = [/^ALL_[a-z]+$/, /^[a-z]+_ALL$/, /^[a-z]+(_[a-z]+)?$/];

export const DEFAULT_REGION = "us-central1";
export const ALLOWED_SSR_REGIONS = [
  { name: "us-central1 (Iowa)", value: "us-central1", recommended: true },
  { name: "us-east1 (South Carolina)", value: "us-east1", recommended: true },
  { name: "us-east4 (Northern Virginia)", value: "us-east4" },
  { name: "us-west1 (Oregon)", value: "us-west1", recommended: true },
  { name: "us-west2 (Los Angeles)", value: "us-west2" },
  { name: "us-west3 (Salt Lake City)", value: "us-west3" },
  { name: "us-west4 (Las Vegas)", value: "us-west4" },
  { name: "asia-east1 (Taiwan)", value: "asia-east1", recommended: true },
  { name: "asia-east2 (Hong Kong)", value: "asia-east2" },
  { name: "asia-northeast1 (Tokyo)", value: "asia-northeast1" },
  { name: "asia-northeast2 (Osaka)", value: "asia-northeast2" },
  { name: "asia-northeast3 (Seoul)", value: "asia-northeast3" },
  { name: "asia-south1 (Mumbai)", value: "asia-south1" },
  { name: "asia-south2 (Delhi)", value: "asia-south2" },
  { name: "asia-southeast1 (Singapore)", value: "asia-southeast1" },
  { name: "asia-southeast2 (Jakarta)", value: "asia-southeast2" },
  { name: "australia-southeast1 (Sydney)", value: "australia-southeast1" },
  { name: "australia-southeast2 (Melbourne)", value: "australia-southeast2" },
  { name: "europe-central2 (Warsaw)", value: "europe-central2" },
  { name: "europe-north1 (Finland)", value: "europe-north1" },
  { name: "europe-west1 (Belgium)", value: "europe-west1", recommended: true },
  { name: "europe-west2 (London)", value: "europe-west2" },
  { name: "europe-west3 (Frankfurt)", value: "europe-west3" },
  { name: "europe-west4 (Netherlands)", value: "europe-west4" },
  { name: "europe-west6 (Zurich)", value: "europe-west6" },
  { name: "northamerica-northeast1 (Montreal)", value: "northamerica-northeast1" },
  { name: "northamerica-northeast2 (Toronto)", value: "northamerica-northeast2" },
  { name: "southamerica-east1 (São Paulo)", value: "southamerica-east1" },
  { name: "southamerica-west1 (Santiago)", value: "southamerica-west1" },
];

export const I18N_ROOT = "/";

export function GET_DEFAULT_BUILD_TARGETS() {
  return Promise.resolve(["production", "development"]);
}

export function DEFAULT_SHOULD_USE_DEV_MODE_HANDLE(target: string) {
  return Promise.resolve(target === "development");
}
