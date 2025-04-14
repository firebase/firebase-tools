import * as clc from "colorette";
import * as semver from "semver";

import * as refs from "../extensions/refs";
import * as utils from "../utils";
import { Command } from "../command";
import { confirm } from "../prompt";
import { ensureExtensionsPublisherApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { deprecateExtensionVersion, listExtensionVersions } from "../extensions/publisherApi";
import { parseVersionPredicate } from "../extensions/versionHelper";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import { Options } from "../options";

interface ExtDevDeprecateOptions extends Options {
  message: string;
}

/**
 * Deprecate all extension versions that match the version predicate.
 */
export const command = new Command("ext:dev:deprecate <extensionRef> [versionPredicate]")
  .description("deprecate extension versions that match the version predicate")
  .option("-m, --message <deprecationMessage>", "deprecation message")
  .option(
    "-f, --force",
    "override deprecation message for existing deprecated extension versions that match",
  )
  .before(requireAuth)
  .before(ensureExtensionsPublisherApiEnabled)
  .action(
    async (extensionRef: string, versionPredicate: string, options: ExtDevDeprecateOptions) => {
      const ref = refs.parse(extensionRef);
      return deprecate(ref, versionPredicate, options);
    },
  );

async function deprecate(
  extensionRef: refs.Ref,
  versionPredicate: string,
  options: ExtDevDeprecateOptions,
) {
  const { publisherId, extensionId, version } = extensionRef;
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
        refs.toExtensionRef(extensionRef),
      )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`,
    );
  }

  let filter = "";
  if (versionPredicate) {
    const { comparator, targetSemVer } = parseVersionPredicate(versionPredicate);
    filter = `id${comparator}"${targetSemVer}"`;
  }
  const extensionVersions = await listExtensionVersions(refs.toExtensionRef(extensionRef), filter);
  const filteredExtensionVersions = extensionVersions
    .sort((ev1, ev2) => {
      return -semver.compare(ev1.spec.version, ev2.spec.version);
    })
    .filter((extensionVersion) => {
      if (extensionVersion.state === "DEPRECATED" && !options.force) {
        return false;
      }
      const message =
        extensionVersion.state === "DEPRECATED" ? ", will overwrite deprecation message" : "";
      // TODO: This should not print out PUBLISHED since that means something else now.
      utils.logLabeledBullet(extensionVersion.ref, extensionVersion.state + message);
      return true;
    });
  if (filteredExtensionVersions.length > 0) {
    const consent = await confirm({
      default: false,
      force: options.force,
      nonInteractive: options.nonInteractive,
    });
    if (!consent) {
      throw new FirebaseError("Deprecation canceled.");
    }
  } else {
    throw new FirebaseError("No extension versions matched the version predicate.");
  }
  await utils.allSettled(
    filteredExtensionVersions.map(async (extensionVersion) => {
      await deprecateExtensionVersion(extensionVersion.ref, options.message);
    }),
  );
  utils.logLabeledSuccess(logPrefix, "successfully deprecated extension version(s).");
}
