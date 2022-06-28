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
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-var-requires
const { marked } = require("marked");
import TerminalRenderer = require("marked-terminal");

import { Command } from "../command";
import { publishExtensionVersionFromLocalSource, logPrefix } from "../extensions/extensionsHelper";
import * as refs from "../extensions/refs";
import { findExtensionYaml } from "../extensions/localHelper";
import { consoleInstallLink } from "../extensions/publishHelpers";
import { requireAuth } from "../requireAuth";
import { FirebaseError } from "../error";
import * as utils from "../utils";

marked.setOptions({
  renderer: new TerminalRenderer(),
});

/**
 * Command for publishing an extension version.
 */
export const command = new Command("ext:dev:publish <extensionRef>")
  .description(`publish a new version of an extension`)
  .withForce()
  .help(
    "if you have not previously published a version of this extension, this will " +
      "create the extension. If you have previously published a version of this extension, this version must " +
      "be greater than previous versions."
  )
  .before(requireAuth)
  .action(async (extensionRef: string, options: any) => {
    const { publisherId, extensionId, version } = refs.parse(extensionRef);
    if (version) {
      throw new FirebaseError(
        `The input extension reference must be of the format ${clc.bold(
          "<publisherId>/<extensionId>"
        )}. Version should not be supplied and will be inferred directly from extension.yaml. Please increment the version in extension.yaml if you would like to bump/specify a version.`
      );
    }
    if (!publisherId || !extensionId) {
      throw new FirebaseError(
        `Error parsing publisher ID and extension ID from extension reference '${clc.bold(
          extensionRef
        )}'. Please use the format '${clc.bold("<publisherId>/<extensionId>")}'.`
      );
    }
    const extensionYamlDirectory = findExtensionYaml(process.cwd());
    const res = await publishExtensionVersionFromLocalSource({
      publisherId,
      extensionId,
      rootDirectory: extensionYamlDirectory,
      nonInteractive: options.nonInteractive,
      force: options.force,
    });
    if (res) {
      utils.logLabeledBullet(logPrefix, marked(`[Install Link](${consoleInstallLink(res.ref)})`));
    }
    return res;
  });
