import * as _ from "lodash";
import * as clc from "cli-color";
import * as ora from "ora";
import { Command } from "../command";
import { FirebaseError } from "../error";
import * as getProjectId from "../getProjectId";
import { iam } from "../gcp";
import * as extensionsApi from "../extensions/extensionsApi";
import {
  ensureExtensionsApiEnabled,
  logPrefix,
  resourceTypeToNiceName,
} from "../extensions/extensionsHelper";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";
import * as logger from "../logger";

export default new Command("ext:uninstall <extensionInstanceId>")
  .description("uninstall an extension that is installed in your Firebase project by instance ID")
  .option("-f, --force", "No confirmation. Otherwise, a confirmation prompt will appear.")
  .before(requirePermissions, ["firebaseextensions.instances.delete"])
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
    if (!options.force) {
      const serviceAccountMessage = `Uninstalling deletes the service account used by this extension instance:\n${clc.bold(
        instance.serviceAccountEmail
      )}\n\n`;
      const resourcesMessage = _.get(instance, "config.source.spec.resources", []).length
        ? "Uninstalling deletes all extension resources created for this extension instance:\n" +
          instance.config.source.spec.resources
            .map((resource: extensionsApi.Resource) =>
              clc.bold(
                `- ${resourceTypeToNiceName[resource.type] || resource.type}: ${resource.name} \n`
              )
            )
            .join("") +
          "\n"
        : "";
      const artifactsMessage =
        `The following ${clc.bold("will not")} be deleted:\n` +
        "Any artifacts (for example, stored images) created by this extension instance.\n" +
        "Any other project resources with which this extension instance interacted.\n";

      const extensionDeletionMessage =
        `Here's what will happen when you uninstall ${clc.bold(instanceId)} from project ${clc.bold(
          projectId
        )}. Be aware that this cannot be undone.\n\n` +
        `${serviceAccountMessage}` +
        `${resourcesMessage}` +
        `${artifactsMessage}`;

      logger.info(extensionDeletionMessage);
      const confirmedExtensionDeletion = await promptOnce({
        type: "confirm",
        default: true,
        message: "Are you sure that you wish to uninstall this extension?",
      });
      if (!confirmedExtensionDeletion) {
        return utils.reject("Command aborted.", { exit: 1 });
      }
    }

    const spinner = ora.default(
      ` ${clc.green.bold(logPrefix)}: uninstalling ${clc.bold(
        instanceId
      )}. This usually takes 1 to 2 minutes...`
    );
    spinner.start();
    try {
      spinner.info();
      spinner.text = ` ${clc.green.bold(logPrefix)}: deleting your extension instance's resources.`;
      spinner.start();
      await extensionsApi.deleteInstance(projectId, instanceId);
      spinner.succeed(
        ` ${clc.green.bold(logPrefix)}: deleted your extension instance's resources.`
      );
      spinner.text = ` ${clc.green.bold(
        logPrefix
      )}: deleting your extension instance's service account.`;
      spinner.start();
      const saDeletionRes = await iam.deleteServiceAccount(projectId, instance.serviceAccountEmail);
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
          ` ${clc.green.bold(
            logPrefix
          )}: deleted your extension instance's service account ${clc.bold(
            instance.serviceAccountEmail
          )}`
        );
      }
    } catch (err) {
      if (spinner.isSpinning) {
        spinner.fail();
      }
      if (err instanceof FirebaseError) {
        throw err;
      }
      return utils.reject(`Error occurred uninstalling extension ${instanceId}`, { original: err });
    }
    utils.logLabeledSuccess(logPrefix, `uninstalled ${clc.bold(instanceId)}`);
  });
