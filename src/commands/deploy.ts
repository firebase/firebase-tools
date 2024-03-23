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
      '(e.g. "--only functions:group1.subgroup1,functions:group2)"',
  )
  .option("--except <targets>", 'deploy to all targets except specified (e.g. "database")')
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
        if (err === errNoDefaultSite) {
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
