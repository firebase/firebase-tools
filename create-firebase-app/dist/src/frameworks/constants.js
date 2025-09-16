"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_SHOULD_USE_DEV_MODE_HANDLE = exports.GET_DEFAULT_BUILD_TARGETS = exports.I18N_ROOT = exports.ALLOWED_SSR_REGIONS = exports.DEFAULT_REGION = exports.VALID_LOCALE_FORMATS = exports.VALID_ENGINES = exports.NODE_VERSION = exports.SHARP_VERSION = exports.FIREBASE_ADMIN_VERSION = exports.FIREBASE_FUNCTIONS_VERSION = exports.FIREBASE_FRAMEWORKS_VERSION = exports.MAILING_LIST_URL = exports.FEATURE_REQUEST_URL = exports.FILE_BUG_URL = exports.DEFAULT_DOCS_URL = exports.SupportLevelWarnings = exports.NPM_COMMAND_TIMEOUT_MILLIES = void 0;
const clc = require("colorette");
const experiments = require("../experiments");
exports.NPM_COMMAND_TIMEOUT_MILLIES = 60000;
exports.SupportLevelWarnings = {
    ["experimental" /* SupportLevel.Experimental */]: (framework) => `Thank you for trying our ${clc.italic("experimental")} support for ${framework} on Firebase Hosting.
   ${clc.red(`While this integration is maintained by Googlers it is not a supported Firebase product.
   Issues filed on GitHub will be addressed on a best-effort basis by maintainers and other community members.`)}`,
    ["preview" /* SupportLevel.Preview */]: (framework) => `Thank you for trying our ${clc.italic("early preview")} of ${framework} support on Firebase Hosting.
   ${clc.red("During the preview, support is best-effort and breaking changes can be expected. Proceed with caution.")}`,
};
exports.DEFAULT_DOCS_URL = "https://firebase.google.com/docs/hosting/frameworks/frameworks-overview";
exports.FILE_BUG_URL = "https://github.com/firebase/firebase-tools/issues/new?template=bug_report.md";
exports.FEATURE_REQUEST_URL = "https://github.com/firebase/firebase-tools/issues/new?template=feature_request.md";
exports.MAILING_LIST_URL = "https://goo.gle/41enW5X";
const DEFAULT_FIREBASE_FRAMEWORKS_VERSION = "^0.11.0";
exports.FIREBASE_FRAMEWORKS_VERSION = (experiments.isEnabled("internaltesting") && process.env.FIREBASE_FRAMEWORKS_VERSION) ||
    DEFAULT_FIREBASE_FRAMEWORKS_VERSION;
exports.FIREBASE_FUNCTIONS_VERSION = "^6.0.1";
exports.FIREBASE_ADMIN_VERSION = "^11.11.1";
exports.SHARP_VERSION = "^0.32 || ^0.33";
exports.NODE_VERSION = parseInt(process.versions.node, 10);
exports.VALID_ENGINES = { node: [16, 18, 20] };
exports.VALID_LOCALE_FORMATS = [/^ALL_[a-z]+$/, /^[a-z]+_ALL$/, /^[a-z]+(_[a-z]+)?$/];
exports.DEFAULT_REGION = "us-central1";
exports.ALLOWED_SSR_REGIONS = [
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
exports.I18N_ROOT = "/";
function GET_DEFAULT_BUILD_TARGETS() {
    return Promise.resolve(["production", "development"]);
}
exports.GET_DEFAULT_BUILD_TARGETS = GET_DEFAULT_BUILD_TARGETS;
function DEFAULT_SHOULD_USE_DEV_MODE_HANDLE(target) {
    return Promise.resolve(target === "development");
}
exports.DEFAULT_SHOULD_USE_DEV_MODE_HANDLE = DEFAULT_SHOULD_USE_DEV_MODE_HANDLE;
