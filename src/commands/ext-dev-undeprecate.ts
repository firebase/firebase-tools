import * as clc from "cli-color";

import { Command } from "../command";
import { promptOnce } from "../prompt";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { undeprecateExtensionVersion, listExtensionVersions } from "../extensions/extensionsApi";
import * as refs from "../extensions/refs";
import { parseVersionPredicate, compareVersions } from "../extensions/versionHelper";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import * as utils from "../utils";

interface VersionPredicate {
  comparator: string;
  targetSemVer: string;
}

/**
 * Undeprecate all extension versions that match the version predicate.
 */
export default new Command("ext:dev:undeprecate <extensionRef> <versionPredicate>")
  .description("undeprecate extension versions that match the version predicate")
  .before(requireAuth)
  .before(ensureExtensionsApiEnabled)
  .action(async (extensionRef: string, versionPredicate: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
    const baseExtensionRef = publisherId + "/" + extensionId;
    if (version) {
      throw new FirebaseError(
        `The input extension reference must be of the format ${clc.bold(
          "<publisherId>/<extensionId>"
        )}. Version should be supplied in the version predicate argument.`
      );
    }
    if (!publisherId || !extensionId) {
      throw new FirebaseError(
        `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
          extensionRef
        )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`
      );
    }
    const { comparator, targetSemVer } = parseVersionPredicate(versionPredicate);
    const extensionVersions = await listExtensionVersions(baseExtensionRef);
    const filteredExtensionVersions = extensionVersions.filter((extensionVersion) => {
      const semVer = refs.parse(extensionVersion.ref).version!;
      if (!compareVersions(semVer, targetSemVer, comparator)) {
        return false;
      }
      utils.logLabeledBullet(extensionVersion.ref, extensionVersion.state);
      return true;
    });
    if (filteredExtensionVersions.length > 0) {
      const confirmMessage =
        "You are about to undeprecate these extension version(s). Do you wish to continue?";
      const consent = await promptOnce({
        type: "confirm",
        message: confirmMessage,
        default: false,
      });
      if (!consent) {
        throw new FirebaseError("Undeprecation canceled.");
      }
    } else {
      throw new FirebaseError("No extension versions matched the version predicate.");
    }
    await utils.allSettled(
      filteredExtensionVersions.map(async (extensionVersion) => {
        await undeprecateExtensionVersion(extensionVersion.ref);
      })
    );
    utils.logLabeledSuccess(logPrefix, "successfully undeprecated extension version(s).");
  });
