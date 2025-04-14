import { requireDatabaseInstance } from "../requireDatabaseInstance";
import { requirePermissions } from "../requirePermissions";
import { checkServiceAccountIam } from "../deploy/functions/checkIam";
import { checkValidTargetFilters } from "../checkValidTargetFilters";
import { Command } from "../command";
import { deploy } from "../deploy";
import { requireConfig } from "../requireConfig";
import { filterTargets } from "../filterTargets";
import { requireHostingSite } from "../requireHostingSite";
import { errNoDefaultSite } from "../getDefaultHostingSite";
import { FirebaseError } from "../error";
import { bold } from "colorette";
import { interactiveCreateHostingSite } from "../hosting/interactive";
import { logBullet } from "../utils";

// in order of least time-consuming to most time-consuming
export const VALID_DEPLOY_TARGETS = [
  "database",
  "storage",
  "firestore",
  "functions",
  "hosting",
  "remoteconfig",
  "extensions",
  "dataconnect",
];
export const TARGET_PERMISSIONS: Record<(typeof VALID_DEPLOY_TARGETS)[number], string[]> = {
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
    "cloudsql.instances.create", // TODO: Support users who don't have cSQL writer permissions and want to use existing instances
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

export const command = new Command("deploy")
  .description("deploy code and assets to your Firebase project")
  .withForce(
    "delete Cloud Functions missing from the current working directory and bypass interactive prompts",
  )
  .option("-p, --public <path>", "override the Hosting public directory specified in firebase.json")
  .option("-m, --message <message>", "an optional message describing this deploy")
  .option(
    "--only <targets>",
    'only deploy to specified, comma-separated targets (e.g. "hosting,storage"). For functions, ' +
      'can specify filters with colons to scope function deploys to only those functions (e.g. "--only functions:func1,functions:func2"). ' +
      "When filtering based on export groups (the exported module object keys), use dots to specify group names " +
      '(e.g. "--only functions:group1.subgroup1,functions:group2"). ' +
      "When filtering based on codebases, use colons to specify codebase names " +
      '(e.g. "--only functions:codebase1:func1,functions:codebase2:group1.subgroup1"). ' +
      "For data connect, can specify filters with colons to deploy only a service, connector, or schema" +
      '(e.g. "--only dataconnect:serviceId,dataconnect:serviceId:connectorId,dataconnect:serviceId:schema")',
  )
  .option("--except <targets>", 'deploy to all targets except specified (e.g. "database")')
  .option(
    "--dry-run",
    "perform a dry run of your deployment. Validates your changes and builds your code without deploying any changes to your project. " +
      "In order to provide better validation, this may still enable APIs on the target project",
  )
  .before(requireConfig)
  .before((options) => {
    options.filteredTargets = filterTargets(options, VALID_DEPLOY_TARGETS);
    const permissions = options.filteredTargets.reduce((perms: string[], target: string) => {
      return perms.concat(TARGET_PERMISSIONS[target]);
    }, []);
    return requirePermissions(options, permissions);
  })
  .before((options) => {
    if (options.filteredTargets.includes("functions")) {
      return checkServiceAccountIam(options.project);
    }
  })
  .before(async (options) => {
    // only fetch the default instance for hosting or database deploys
    if (options.filteredTargets.includes("database")) {
      await requireDatabaseInstance(options);
    }

    if (options.filteredTargets.includes("hosting")) {
      let createSite = false;
      try {
        await requireHostingSite(options);
      } catch (err: unknown) {
        const isPermissionError =
          err instanceof FirebaseError &&
          err.original instanceof FirebaseError &&
          err.original.status === 403;
        if (isPermissionError) {
          throw err;
        } else if (err === errNoDefaultSite) {
          createSite = true;
        }
      }
      if (!createSite) {
        return;
      }
      if (options.nonInteractive) {
        throw new FirebaseError(
          `Unable to deploy to Hosting as there is no Hosting site. Use ${bold(
            "firebase hosting:sites:create",
          )} to create a site.`,
        );
      }
      logBullet("No Hosting site detected.");
      await interactiveCreateHostingSite("", "", options);
    }
  })
  .before(checkValidTargetFilters)
  .action((options) => {
    return deploy(options.filteredTargets, options);
  });
