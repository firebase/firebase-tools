import * as _ from "lodash";
import * as clc from "cli-color";
import * as ora from "ora";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import { iam } from "../gcp";
import * as extensionsApi from "../extensions/extensionsApi";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

export default new Command("ext:uninstall <extensionInstanceId>")
  .description("uninstall an extension that is installed in your Firebase project by instance ID")
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["firebasemods.instances.delete"])
  .before(ensureExtensionsApiEnabled)
  .action(async (instanceId: string, options: any) => {
    const projectId = getProjectId(options);
    let instance;
    try {
      instance = await extensionsApi.getInstance(projectId, instanceId);
    } catch (err) {
      if (err.status === 404) {
        return utils.reject(`No extension instance ${instanceId} in project ${projectId}.`, {
          exit: 1,
        });
      }
      throw err;
    }
    let confirmedServiceAccountDeletion;
    if (!options.force) {
      const resourcesMessage = _.get(instance, "config.source.spec.resources", []).length
        ? "This will delete the following resources \n" +
          instance.config.source.spec.resources
            .map((resource: extensionsApi.Resource) => `- ${resource.type}: ${resource.name} \n`)
            .join("")
        : "";
      const extensionDeletionMessage = `You are about to uninstall extension ${clc.bold(
        instanceId
      )} from project ${clc.bold(projectId)}.\n${resourcesMessage}Are you sure?`;
      const confirmedExtensionDeletion = await promptOnce({
        type: "confirm",
        default: true,
        message: extensionDeletionMessage,
      });
      if (!confirmedExtensionDeletion) {
        return utils.reject("Command aborted.", { exit: 1 });
      }

      const rolesMessage = _.get(instance, "config.source.spec.roles", []).length
        ? " which had the following authorized roles in your project:\n" +
          instance.config.source.spec.roles
            .map((role: extensionsApi.Role) => `- ${role.role} \n`)
            .join("")
        : ". \n";
      const serviceAccountDeletionMessage = `This extension used service account ${clc.bold(
        instance.serviceAccountEmail
      )} ${rolesMessage}Do you want to delete this service account?`;
      confirmedServiceAccountDeletion = await promptOnce({
        type: "confirm",
        default: false,
        message: serviceAccountDeletionMessage,
      });
    }

    const spinner = ora.default(
      `Uninstalling ${clc.bold(instanceId)}. This usually takes 1 to 2 minutes...`
    );
    spinner.start();
    try {
      await extensionsApi.deleteInstance(projectId, instanceId);
      if (confirmedServiceAccountDeletion || options.force) {
        const saDeletionRes = await iam.deleteServiceAccount(
          projectId,
          instance.serviceAccountEmail
        );
        if (_.get(saDeletionRes, "body.error")) {
          if (_.get(saDeletionRes, "body.error.code") === 404) {
            spinner.succeed(
              ` ${clc.green.bold(logPrefix)}: service account ${clc.bold(
                instance.serviceAccountEmail
              )} was previously deleted.`
            );
          } else {
            throw new FirebaseError("Unable to delete service account", {
              original: saDeletionRes.body.error,
            });
          }
        } else {
          spinner.succeed(
            ` ${clc.green.bold(logPrefix)}: deleted service account ${clc.bold(
              instance.serviceAccountEmail
            )}`
          );
        }
      }
    } catch (err) {
      spinner.fail();
      if (err instanceof FirebaseError) {
        throw err;
      }
      return utils.reject(`Error occurred uninstalling extension ${instanceId}`, { original: err });
    }
    utils.logLabeledSuccess(logPrefix, `uninstalled ${instanceId}`);
  });
