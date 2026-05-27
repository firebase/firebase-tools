import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { listInstances } from "../extensions/extensionsApi";
import { logLabeledBullet } from "../utils";
import { logPrefix } from "../extensions/extensionsHelper";
import * as clc from "colorette";

export const command = new Command("ext:inspect")
  .description("shows the current configuration for extensions that are installed in your Firebase project")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(requirePermissions, ["firebaseextensions.instances.get"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (options: any) => {
    const projectId = needProjectId(options);
    const instances = await listInstances(projectId);
    if (instances.length < 1) {
      logLabeledBullet(
        logPrefix,
        `there are no extensions installed on project ${clc.bold(projectId)}.`,
      );
      return
    }
    instances.forEach((instance) => {
      let liveParams = instance.config.params || {};
      let liveSystemParams = instance.config.systemParams || {};
      let specParams = instance.config.source.spec.params || {};
      let specSystemParams = instance.config.source.spec.systemParams || {};

      specParams.forEach((specParam) => {
        if (specParam.param in liveParams) {
          console.log(specParam.param + '=' + liveParams[specParam.param])
        } else if ('default' in specParam) {
          console.log(specParam.param + '=' + specParam.default)
        } else {
          console.log(specParam.param + '=""')
        }
      });
    });
  });
