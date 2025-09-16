"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flushToDisk = exports.assertEnabled = exports.enableExperimentsFromCliEnvVariable = exports.setEnabled = exports.isEnabled = exports.experimentNameAutocorrect = exports.isValidExperiment = exports.ALL_EXPERIMENTS = void 0;
const colorette_1 = require("colorette");
const leven = require("leven");
const path_1 = require("path");
const configstore_1 = require("./configstore");
const error_1 = require("./error");
const github_1 = require("./init/features/hosting/github");
// Utility method to ensure there are no typos in defining ALL_EXPERIMENTS
function experiments(exp) {
    return Object.freeze(exp);
}
exports.ALL_EXPERIMENTS = experiments({
    // meta:
    experiments: {
        shortDescription: "enables the experiments family of commands",
    },
    // Realtime Database experiments
    rtdbrules: {
        shortDescription: "Advanced security rules management",
    },
    rtdbmanagement: {
        shortDescription: "Use new endpoint to administer realtime database instances",
    },
    // Cloud Functions for Firebase experiments
    functionsv2deployoptimizations: {
        shortDescription: "Optimize deployments of v2 firebase functions",
        fullDescription: "Reuse build images across funtions to increase performance and reliaibility " +
            "of deploys. This has been made an experiment due to backend bugs that are " +
            "temporarily causing failures in some regions with this optimization enabled",
        public: true,
        default: true,
    },
    deletegcfartifacts: {
        shortDescription: `Add the ${(0, colorette_1.bold)("functions:deletegcfartifacts")} command to purge docker build images`,
        fullDescription: `Add the ${(0, colorette_1.bold)("functions:deletegcfartifacts")}` +
            "command. Google Cloud Functions creates Docker images when building your " +
            "functions. Cloud Functions for Firebase automatically cleans up these " +
            "images for you on deploy. Customers who predated this cleanup, or customers " +
            "who also deploy Google Cloud Functions with non-Firebase tooling may have " +
            "old Docker images stored in either Google Container Repository or Artifact " +
            `Registry. The ${(0, colorette_1.bold)("functions:deletegcfartifacts")} command ` +
            "will delete all Docker images created by Google Cloud Functions irrespective " +
            "of how that image was created.",
        public: true,
    },
    dangerouslyAllowFunctionsConfig: {
        shortDescription: "Allows the use of deprecated functions.config() API",
        fullDescription: "The functions.config() API is deprecated and will be removed on December 31, 2025. " +
            "This experiment allows continued use of the API during the migration period.",
        default: true,
        public: true,
    },
    runfunctions: {
        shortDescription: "Functions created using the V2 API target Cloud Run Functions (not production ready)",
        public: false,
    },
    // Emulator experiments
    emulatoruisnapshot: {
        shortDescription: "Load pre-release versions of the emulator UI",
    },
    emulatorapphosting: {
        shortDescription: "App Hosting emulator",
        public: false,
    },
    // Hosting experiments
    webframeworks: {
        shortDescription: "Native support for popular web frameworks",
        fullDescription: "Adds support for popular web frameworks such as Next.js " +
            "Angular, React, Svelte, and Vite-compatible frameworks. A manual migration " +
            "may be required when the non-experimental support for these frameworks " +
            "is released",
        docsUri: "https://firebase.google.com/docs/hosting/frameworks-overview",
        public: true,
    },
    pintags: {
        shortDescription: "Adds the pinTag option to Run and Functions rewrites",
        fullDescription: "Adds support for the 'pinTag' boolean on Runction and Run rewrites for " +
            "Firebase Hosting. With this option, newly released hosting sites will be " +
            "bound to the current latest version of their referenced functions or services. " +
            "This option depends on Run pinned traffic targets, of which only 2000 can " +
            "exist per region. firebase-tools aggressively garbage collects tags it creates " +
            "if any service exceeds 500 tags, but it is theoretically possible that a project " +
            "exceeds the region-wide limit of tags and an old site version fails",
        public: true,
        default: true,
    },
    // Access experiments
    crossservicerules: {
        shortDescription: "Allow Firebase Rules to reference resources in other services",
    },
    internaltesting: {
        shortDescription: "Exposes Firebase CLI commands intended for internal testing purposes.",
        fullDescription: "Exposes Firebase CLI commands intended for internal testing purposes. " +
            "These commands are not meant for public consumption and may break or disappear " +
            "without a notice.",
    },
    apphosting: {
        shortDescription: "Allow CLI option for Frameworks",
        default: true,
        public: false,
    },
    // TODO(joehanley): Delete this once weve scrubbed all references to experiment from docs.
    dataconnect: {
        shortDescription: "Deprecated. Previosuly, enabled Data Connect related features.",
        fullDescription: "Deprecated. Previously, enabled Data Connect related features.",
        public: false,
    },
    genkit: {
        shortDescription: "Enable Genkit related features.",
        fullDescription: "Enable Genkit related features.",
        default: true,
        public: false,
    },
    appsinit: {
        shortDescription: "Adds experimental `apps:init` command.",
        fullDescription: "Adds experimental `apps:init` command. When run from an app directory, this command detects the app's platform and configures required files.",
        default: false,
        public: true,
    },
    mcp: {
        shortDescription: "Adds experimental `firebase mcp` command for running a Firebase MCP server.",
        default: true,
        public: false,
    },
    mcpalpha: {
        shortDescription: "Opt-in to early MCP features before they're widely released.",
        default: false,
        public: true,
    },
    apptesting: {
        shortDescription: "Adds experimental App Testing feature",
        public: true,
    },
});
/** Determines whether a name is a valid experiment name. */
function isValidExperiment(name) {
    return Object.keys(exports.ALL_EXPERIMENTS).includes(name);
}
exports.isValidExperiment = isValidExperiment;
/**
 * Detects experiment names that were potentially what a customer intended to
 * type when they provided malformed.
 * Returns null if the malformed name is actually an experiment. Returns all
 * possible typos.
 */
function experimentNameAutocorrect(malformed) {
    if (isValidExperiment(malformed)) {
        throw new error_1.FirebaseError("Assertion failed: experimentNameAutocorrect given actual experiment name", { exit: 2 });
    }
    // N.B. I personally would use < (name.length + malformed.length) * 0.2
    // but this logic matches src/index.ts. I neither want to change something
    // with such potential impact nor to create divergent behavior.
    return Object.keys(exports.ALL_EXPERIMENTS).filter((name) => leven(name, malformed) < malformed.length * 0.4);
}
exports.experimentNameAutocorrect = experimentNameAutocorrect;
let localPreferencesCache = undefined;
function localPreferences() {
    if (!localPreferencesCache) {
        localPreferencesCache = (configstore_1.configstore.get("previews") || {});
        for (const key of Object.keys(localPreferencesCache)) {
            if (!isValidExperiment(key)) {
                delete localPreferencesCache[key];
            }
        }
    }
    return localPreferencesCache;
}
/** Returns whether an experiment is enabled. */
function isEnabled(name) {
    var _a, _b, _c;
    return (_c = (_a = localPreferences()[name]) !== null && _a !== void 0 ? _a : (_b = exports.ALL_EXPERIMENTS[name]) === null || _b === void 0 ? void 0 : _b.default) !== null && _c !== void 0 ? _c : false;
}
exports.isEnabled = isEnabled;
/**
 * Sets whether an experiment is enabled.
 * Set to a boolean value to explicitly opt in or out of an experiment.
 * Set to null to go on the default track for this experiment.
 */
function setEnabled(name, to) {
    if (to === null) {
        delete localPreferences()[name];
    }
    else {
        localPreferences()[name] = to;
    }
}
exports.setEnabled = setEnabled;
/**
 * Enables multiple experiments given a comma-delimited environment variable:
 * `FIREBASE_CLI_EXPERIMENTS`.
 *
 * Example:
 * FIREBASE_CLI_PREVIEWS=experiment1,experiment2,turtle
 *
 * Would silently enable `experiment1` and `experiment2`, but would not enable `turtle`.
 */
function enableExperimentsFromCliEnvVariable() {
    const experiments = process.env.FIREBASE_CLI_EXPERIMENTS || "";
    for (const experiment of experiments.split(",")) {
        if (isValidExperiment(experiment)) {
            setEnabled(experiment, true);
        }
    }
}
exports.enableExperimentsFromCliEnvVariable = enableExperimentsFromCliEnvVariable;
/**
 * Assert that an experiment is enabled before following a code path.
 * This code is unnecessary in code paths guarded by ifEnabled. When
 * a customer's project was clearly written against an experiment that
 * was not enabled, assertEnabled will throw a standard error. The "task"
 * param is part of this error. It will be presented as "Cannot ${task}".
 */
function assertEnabled(name, task) {
    var _a;
    if (!isEnabled(name)) {
        const prefix = `Cannot ${task} because the experiment ${(0, colorette_1.bold)(name)} is not enabled.`;
        if ((0, github_1.isRunningInGithubAction)()) {
            const path = (_a = process.env.GITHUB_WORKFLOW_REF) === null || _a === void 0 ? void 0 : _a.split("@")[0];
            const filename = path ? `.github/workflows/${(0, path_1.basename)(path)}` : "your action's yml";
            const newValue = [process.env.FIREBASE_CLI_EXPERIMENTS, name].filter((it) => !!it).join(",");
            throw new error_1.FirebaseError(`${prefix} To enable add a ${(0, colorette_1.bold)("FIREBASE_CLI_EXPERIMENTS")} environment variable to ${filename}, like so: ${(0, colorette_1.italic)(`

- uses: FirebaseExtended/action-hosting-deploy@v0
  with:
    ...
  env:
    FIREBASE_CLI_EXPERIMENTS: ${newValue}
`)}`);
        }
        else {
            throw new error_1.FirebaseError(`${prefix} To enable ${(0, colorette_1.bold)(name)} run ${(0, colorette_1.bold)(`firebase experiments:enable ${name}`)}`);
        }
    }
}
exports.assertEnabled = assertEnabled;
/** Saves the current set of enabled experiments to disk. */
function flushToDisk() {
    configstore_1.configstore.set("previews", localPreferences());
}
exports.flushToDisk = flushToDisk;
