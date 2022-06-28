/**
 * Copyright (c) 2022 Google LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as clc from "cli-color";
import * as semver from "semver";

import * as refs from "../extensions/refs";
import * as utils from "../utils";
import { Command } from "../command";
import { promptOnce } from "../prompt";
import { ensureExtensionsApiEnabled, logPrefix } from "../extensions/extensionsHelper";
import { deprecateExtensionVersion, listExtensionVersions } from "../extensions/extensionsApi";
import { parseVersionPredicate } from "../extensions/versionHelper";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";

/**
 * Deprecate all extension versions that match the version predicate.
 */
export const command = new Command("ext:dev:deprecate <extensionRef> <versionPredicate>")
  .description("deprecate extension versions that match the version predicate")
  .option("-m, --message <deprecationMessage>", "deprecation message")
  .option(
    "-f, --force",
    "override deprecation message for existing deprecated extension versions that match"
  )
  .before(requireAuth)
  .before(ensureExtensionsApiEnabled)
  .action(async (extensionRef: string, versionPredicate: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
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
    const filter = `id${comparator}"${targetSemVer}"`;
    const extensionVersions = await listExtensionVersions(extensionRef, filter);
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
        utils.logLabeledBullet(extensionVersion.ref, extensionVersion.state + message);
        return true;
      });
    if (filteredExtensionVersions.length > 0) {
      if (!options.force) {
        const confirmMessage =
          "You are about to deprecate these extension version(s). Do you wish to continue?";
        const consent = await promptOnce({
          type: "confirm",
          message: confirmMessage,
          default: false,
        });
        if (!consent) {
          throw new FirebaseError("Deprecation canceled.");
        }
      }
    } else {
      throw new FirebaseError("No extension versions matched the version predicate.");
    }
    await utils.allSettled(
      filteredExtensionVersions.map(async (extensionVersion) => {
        await deprecateExtensionVersion(extensionVersion.ref, options.deprecationMessage);
      })
    );
    utils.logLabeledSuccess(logPrefix, "successfully deprecated extension version(s).");
  });
