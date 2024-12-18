import * as clc from "colorette";
import * as semver from "semver";

import * as refs from "../extensions/refs.js";
import * as utils from "../utils.js";
import { Command } from "../command.js";
import { promptOnce } from "../prompt.js";
import { ensureExtensionsPublisherApiEnabled, logPrefix } from "../extensions/extensionsHelper.js";
import { undeprecateExtensionVersion, listExtensionVersions } from "../extensions/publisherApi.js";
import { parseVersionPredicate } from "../extensions/versionHelper.js";
import { requireAuth } from "../requireAuth.js";
import { FirebaseError } from "../error.js";

/**
 * Undeprecate all extension versions that match the version predicate.
 */
export const command = new Command("ext:dev:undeprecate <extensionRef> <versionPredicate>")
  .description("undeprecate extension versions that match the version predicate")
  .before(requireAuth)
  .before(ensureExtensionsPublisherApiEnabled)
  .action(async (extensionRef: string, versionPredicate: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
    if (version) {
      throw new FirebaseError(
        `The input extension reference must be of the format ${clc.bold(
          "<publisherId>/<extensionId>",
        )}. Version should be supplied in the version predicate argument.`,
      );
    }
    if (!publisherId || !extensionId) {
      throw new FirebaseError(
        `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
          extensionRef,
        )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`,
      );
    }
    const { comparator, targetSemVer } = parseVersionPredicate(versionPredicate);
    const filter = `id${comparator}"${targetSemVer}"`;
    const extensionVersions = await listExtensionVersions(extensionRef, filter);
    extensionVersions
      .sort((ev1, ev2) => {
        return -semver.compare(ev1.spec.version, ev2.spec.version);
      })
      .forEach((extensionVersion) => {
        utils.logLabeledBullet(extensionVersion.ref, extensionVersion.state);
      });
    if (extensionVersions.length > 0) {
      if (!options.force) {
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
      }
    } else {
      throw new FirebaseError("No extension versions matched the version predicate.");
    }
    await utils.allSettled(
      extensionVersions.map(async (extensionVersion) => {
        await undeprecateExtensionVersion(extensionVersion.ref);
      }),
    );
    utils.logLabeledSuccess(logPrefix, "successfully undeprecated extension version(s).");
  });
