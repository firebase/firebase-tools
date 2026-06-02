import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";
import { listInstances } from "../extensions/extensionsApi";
import { last, logLabeledBullet } from "../utils";
import { logPrefix } from "../extensions/extensionsHelper";
import { FirebaseError } from "../error";

import * as clc from "colorette";

export const command = new Command("ext:instances:get [extensionInstanceId]")
  .description("shows the current configuration for a currently installed Extension")
  .option("--with-secrets", "shows the parameter name (but not value) of SECRET-type params")
  .before(requirePermissions, ["firebaseextensions.instances.list"])
  .before(requirePermissions, ["firebaseextensions.instances.get"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extMinVersion")
  .action(async (wantInstanceId: string, options: any) => {
    const listAll = !wantInstanceId;
    const projectId = needProjectId(options);
    const instances = await listInstances(projectId);
    if (instances.length < 1) {
      logLabeledBullet(
        logPrefix,
        `there are no extensions installed on project ${clc.bold(projectId)}.`,
      );
      return;
    }

    let found = false;
    instances.forEach((instance) => {
      const instanceId = last(instance.name.split("/")) ?? "";
      if (!listAll && instanceId !== wantInstanceId) {
        return;
      }

      found = true;
      const liveParams = instance.config?.params || {};
      const liveSystemParams = instance.config?.systemParams || {};
      const specParams = instance.config?.source?.spec?.params || {};
      const specSystemParams = instance.config?.source?.spec?.systemParams || {};

      if (listAll) {
        console.log("# " + instanceId);
      }

      // Every user param must be available, so we replicate the spec's default behavior if not present
      specParams.forEach((specParam) => {
        if (specParam.type === "SECRET") {
          if (options.withSecrets) {
            console.log("# " + specParam.param + " stored in Cloud Secret Manager");
          }
        } else if (specParam.param in liveParams) {
          console.log(specParam.param + "=" + liveParams[specParam.param]);
        } else if ("default" in specParam) {
          console.log(specParam.param + "=" + specParam.default);
        } else {
          console.log(specParam.param + '=""');
        }
      });

      // System params aren't necessarily defined in the spec, but we do respect any defaults
      Object.entries(liveSystemParams).forEach(([sysParamName, sysParamValue]) => {
        const renamed = sysParamName.replace(
          "firebaseextensions.v1beta.function/",
          "extensions_system_",
        );
        console.log(renamed + "=" + sysParamValue);
      });
      Object.entries(specSystemParams).forEach(([, specSystemParam]) => {
        if (specSystemParam.param in liveSystemParams) {
          return;
        }
        if ("default" in specSystemParam) {
          const renamed = specSystemParam.param.replace(
            "firebaseextensions.v1beta.function/",
            "extensions_system_",
          );
          console.log(renamed + "=" + specSystemParam.default);
        }
      });
    });
    if (!found) {
      throw new FirebaseError(
        `Could not find extension instance ${wantInstanceId} in active extensions`,
        { status: 404 },
      );
    }
  });
