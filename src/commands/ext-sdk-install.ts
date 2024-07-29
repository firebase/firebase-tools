import * as clc from "colorette";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import * as extensionsApi from "../extensions/extensionsApi";
import { ensureExtensionsApiEnabled } from "../extensions/extensionsHelper";
import { getLocalExtensionSpec, isLocalExtension } from "../extensions/localHelper";
import { requirePermissions } from "../requirePermissions";
import { writeSDK, fixHyperlink } from "../extensions/runtimes/common";
import {ExtensionSpec, isExtensionSpec} from "../extensions/types";
import { FirebaseError } from "../error";
import { displayExtensionVersionInfo } from "../extensions/displayExtensionInfo";
import * as refs from "../extensions/refs";
import { logger } from "../logger";
import * as semver from "semver";
import { confirm } from "../prompt";
import * as utils from "../utils";


/**
 * Command for getting the autogenerated sdk for an extension
 */
export const command = new Command("ext:sdk:install <extensionName>")
  .description("get an SDK for this extension. The SDK will be put in the 'generated' directory")
  .option(`--codebase <codebase>`, `specifies a codebase to install the SDK into`)
  .option(`--force`, `will overwrite existing sdk files if true`)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (extensionName: string, options: any) => {
    let spec: ExtensionSpec;
    let extensionRef;
    let localPath;
    if (isLocalExtension(extensionName)) {
      spec = await getLocalExtensionSpec(extensionName);
      spec.systemParams = []; // These only get added when it is uploaded
      if (!isExtensionSpec(spec)) {
        throw new FirebaseError("Error: extension.yaml does not contain a valid extension specification.");
      }
      localPath = extensionName;
      await displayExtensionVersionInfo({spec});
    } else {
      await requirePermissions(options, ["firebaseextensions.sources.get"]);
      await ensureExtensionsApiEnabled(options);
      const hasPublisherId = extensionName.split("/").length >= 2;
      if (hasPublisherId) {
        const nameAndVersion = extensionName.split("/")[1];
        if (nameAndVersion.split("@").length < 2) {
          extensionName = extensionName + "@latest";
        }
      } else {
        const [name, version] = extensionName.split("@");
        extensionName = `firebase/${name}@${version || "latest"}`;
      }
      const ref = refs.parse(extensionName);
      const extension = await extensionsApi.getExtension(refs.toExtensionRef(ref));
      const version = await extensionsApi.getExtensionVersion(extensionName);
      spec = version.spec;
      extensionRef = version.ref;
      await displayExtensionVersionInfo({
        spec,
        extensionVersion: version,
        latestApprovedVersion: extension.latestApprovedVersion,
        latestVersion: extension.latestVersion,
      });
      if (version.state == "DEPRECATED") {
        throw new FirebaseError(
          `Extension version ${clc.bold(
            extensionName,
          )} is deprecated and cannot be installed. To install an SDK for the ` +
          `latest non-deprecated version, omit the version in the extension ref.`,
        );
      }
      logger.info();
      if (
        (extension.latestApprovedVersion &&
          semver.gt(extension.latestApprovedVersion, version.spec.version)) ||
        (!extension.latestApprovedVersion &&
          extension.latestVersion &&
          semver.gt(extension.latestVersion, version.spec.version))
      ) {
        const latest = extension.latestApprovedVersion || extension.latestVersion;
        logger.info(
          `You are about to install an SDK for extension version ${clc.bold(
            version.spec.version,
          )} which is older than the latest ${
            extension.latestApprovedVersion ? "accepted version" : "version"
          } ${clc.bold(latest!)}.`,
        );
      }
    }

    // Give people a chance to look at the extension information and see
      // if they want to continue
      if (!(await confirm({
        nonInteractive: options.nonInteractive,
        force: options.force,
        default: true,
      }))) {
      return;
    }

    const codeSample = await writeSDK(extensionRef, localPath, spec, options);

    logger.info();
    utils.logSuccess("Extension SDK installed successfully");

    logger.info(codeSample);
  });