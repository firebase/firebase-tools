"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.command = exports.TARGET_PERMISSIONS = exports.VALID_DEPLOY_TARGETS = void 0;
const requireDatabaseInstance_1 = require("../requireDatabaseInstance");
const requirePermissions_1 = require("../requirePermissions");
const checkIam_1 = require("../deploy/functions/checkIam");
const checkValidTargetFilters_1 = require("../checkValidTargetFilters");
const command_1 = require("../command");
const deploy_1 = require("../deploy");
const requireConfig_1 = require("../requireConfig");
const filterTargets_1 = require("../filterTargets");
const requireHostingSite_1 = require("../requireHostingSite");
const getDefaultHostingSite_1 = require("../getDefaultHostingSite");
const error_1 = require("../error");
const colorette_1 = require("colorette");
const interactive_1 = require("../hosting/interactive");
const utils_1 = require("../utils");
// in order of least time-consuming to most time-consuming
exports.VALID_DEPLOY_TARGETS = [
    "database",
    "storage",
    "firestore",
    "functions",
    "hosting",
    "remoteconfig",
    "extensions",
    "dataconnect",
    "apphosting",
];
exports.TARGET_PERMISSIONS = {
    database: ["firebasedatabase.instances.update"],
    hosting: ["firebasehosting.sites.update"],
    functions: [
        "cloudfunctions.functions.list",
        "cloudfunctions.functions.create",
        "cloudfunctions.functions.get",
        "cloudfunctions.functions.update",
        "cloudfunctions.functions.delete",
        "cloudfunctions.operations.get",
    ],
    firestore: [
        "datastore.indexes.list",
        "datastore.indexes.create",
        "datastore.indexes.update",
        "datastore.indexes.delete",
    ],
    storage: [
        "firebaserules.releases.create",
        "firebaserules.rulesets.create",
        "firebaserules.releases.update",
    ],
    remoteconfig: ["cloudconfig.configs.get", "cloudconfig.configs.update"],
    dataconnect: [
        "cloudsql.databases.create",
        "cloudsql.databases.update",
        "cloudsql.instances.connect",
        "cloudsql.instances.create",
        "cloudsql.instances.get",
        "cloudsql.instances.list",
        "cloudsql.instances.update",
        "cloudsql.users.create",
        "firebasedataconnect.connectors.create",
        "firebasedataconnect.connectors.delete",
        "firebasedataconnect.connectors.list",
        "firebasedataconnect.connectors.update",
        "firebasedataconnect.operations.get",
        "firebasedataconnect.services.create",
        "firebasedataconnect.services.delete",
        "firebasedataconnect.services.update",
        "firebasedataconnect.services.list",
        "firebasedataconnect.schemas.create",
        "firebasedataconnect.schemas.delete",
        "firebasedataconnect.schemas.list",
        "firebasedataconnect.schemas.update",
    ],
};
exports.command = new command_1.Command("deploy")
    .description("deploy code and assets to your Firebase project")
    .withForce("delete Cloud Functions missing from the current working directory and bypass interactive prompts")
    .option("-p, --public <path>", "override the Hosting public directory specified in firebase.json")
    .option("-m, --message <message>", "an optional message describing this deploy")
    .option("--only <targets>", 'only deploy to specified, comma-separated targets (e.g. "hosting,storage"). For functions, ' +
    'can specify filters with colons to scope function deploys to only those functions (e.g. "--only functions:func1,functions:func2"). ' +
    "When filtering based on export groups (the exported module object keys), use dots to specify group names " +
    '(e.g. "--only functions:group1.subgroup1,functions:group2"). ' +
    "When filtering based on codebases, use colons to specify codebase names " +
    '(e.g. "--only functions:codebase1:func1,functions:codebase2:group1.subgroup1"). ' +
    "For data connect, can specify filters with colons to deploy only a service, connector, or schema" +
    '(e.g. "--only dataconnect:serviceId,dataconnect:serviceId:connectorId,dataconnect:serviceId:schema")')
    .option("--except <targets>", 'deploy to all targets except specified (e.g. "database")')
    .option("--dry-run", "perform a dry run of your deployment. Validates your changes and builds your code without deploying any changes to your project. " +
    "In order to provide better validation, this may still enable APIs on the target project")
    .before(requireConfig_1.requireConfig)
    .before((options) => {
    options.filteredTargets = (0, filterTargets_1.filterTargets)(options, exports.VALID_DEPLOY_TARGETS);
    const permissions = options.filteredTargets.reduce((perms, target) => {
        return perms.concat(exports.TARGET_PERMISSIONS[target]);
    }, []);
    return (0, requirePermissions_1.requirePermissions)(options, permissions);
})
    .before((options) => {
    if (options.filteredTargets.includes("functions")) {
        return (0, checkIam_1.checkServiceAccountIam)(options.project);
    }
})
    .before(async (options) => {
    // only fetch the default instance for hosting or database deploys
    if (options.filteredTargets.includes("database")) {
        await (0, requireDatabaseInstance_1.requireDatabaseInstance)(options);
    }
    if (options.filteredTargets.includes("hosting")) {
        let createSite = false;
        try {
            await (0, requireHostingSite_1.requireHostingSite)(options);
        }
        catch (err) {
            const isPermissionError = err instanceof error_1.FirebaseError &&
                err.original instanceof error_1.FirebaseError &&
                err.original.status === 403;
            if (isPermissionError) {
                throw err;
            }
            else if (err === getDefaultHostingSite_1.errNoDefaultSite) {
                createSite = true;
            }
        }
        if (!createSite) {
            return;
        }
        if (options.nonInteractive) {
            throw new error_1.FirebaseError(`Unable to deploy to Hosting as there is no Hosting site. Use ${(0, colorette_1.bold)("firebase hosting:sites:create")} to create a site.`);
        }
        (0, utils_1.logBullet)("No Hosting site detected.");
        await (0, interactive_1.interactiveCreateHostingSite)("", "", options);
    }
})
    .before(checkValidTargetFilters_1.checkValidTargetFilters)
    .action((options) => {
    return (0, deploy_1.deploy)(options.filteredTargets, options);
});
//# sourceMappingURL=deploy.js.map