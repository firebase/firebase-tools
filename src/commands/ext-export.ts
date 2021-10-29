import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import * as planner from "../deploy/extensions/planner";
import {
  displayExportInfo,
  parameterizeProject,
  setSecretParamsToLatest,
  writeFiles,
} from "../extensions/export";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { partition } from "../functional";
import { getProjectNumber } from "../getProjectNumber";
import { logger } from "../logger";
import { needProjectId } from "../projectUtils";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";

module.exports = new Command("ext:export")
  .description(
    "export all Extension instances installed on a project to a local Firebase directory"
  )
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .withForce()
  .action(async (options: any) => {
    const projectId = needProjectId(options);
    const projectNumber = await getProjectNumber(options);
    // Look up the instances that already exist,
    // set any secrets to latest version,
    // and strip project IDs from the param values.
    const have = await Promise.all(
      (await planner.have(projectId)).map(async (i) => {
        const subbed = await setSecretParamsToLatest(i);
        return parameterizeProject(projectId, projectNumber, subbed);
      })
    );

    if (have.length == 0) {
      logger.info(
        `No extension instances installed on ${projectId}, so there is nothing to export.`
      );
      return;
    }

    // If an instance spec is missing a ref, that instance must have been installed from a local source.
    const [withRef, withoutRef] = partition(have, (s) => !!s.ref);

    displayExportInfo(withRef, withoutRef);

    if (
      !options.nonInteractive &&
      !options.force &&
      !(await promptOnce({
        message: "Do you wish to add these Extension instances to firebase.json?",
        type: "confirm",
        default: true,
      }))
    ) {
      logger.info("Exiting. No changes made.");
      return;
    }

    await writeFiles(withRef, options);
  });
