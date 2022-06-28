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

import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { Command } from "../command";
import { needProjectId } from "../projectUtils";
import { logger } from "../logger";
import {
  createSourceFromLocation,
  ensureExtensionsApiEnabled,
} from "../extensions/extensionsHelper";
import { requirePermissions } from "../requirePermissions";

/**
 * Command for creating a extension source
 */
export const command = new Command("ext:sources:create <sourceLocation>")
  .description(`create a extension source from sourceLocation`)
  .help(
    "sourceLocation can be a local directory containing an extension, or URL pointing to a zipped extension. " +
      'If using a URL, you can specify a root folder for the extension by adding "#<extensionRoot>". ' +
      "For example, if your extension.yaml is in the my/extension directory of the archive, " +
      "you should use sourceUrl#my/extension. If no extensionRoot is specified, / is assumed."
  )
  .before(requirePermissions, ["firebaseextensions.sources.create"])
  .before(ensureExtensionsApiEnabled)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (sourceLocation: string, options: any) => {
    const projectId = needProjectId(options);
    const res = await createSourceFromLocation(projectId, sourceLocation);
    logger.info(
      `Extension source creation successful for ${res.spec.name}! Your new source is ${res.name}`
    );
    return res;
  });
