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

import * as path from "path";
import * as clc from "cli-color";

import { FirebaseError } from "../../error";
import { resolveProjectPath } from "../../projectPath";
import { dirExistsSync } from "../../fsutils";
import { logLabeledWarning } from "../../utils";
import { HostingDeploy } from "./hostingDeploy";

export function validateDeploy(deploy: HostingDeploy, options: any) {
  const cfg = deploy.config;

  const hasPublicDir = !!cfg.public;
  const hasAnyStaticRewrites = !!(cfg.rewrites || []).filter((rw) => rw.destination)?.length;
  const hasAnyDynamicRewrites = !!(cfg.rewrites || []).filter((rw) => !rw.destination)?.length;
  const hasAnyRedirects = !!cfg.redirects?.length;

  if (!hasPublicDir && hasAnyStaticRewrites) {
    throw new FirebaseError('Must supply a "public" directory when using "destination" rewrites.');
  }

  if (!hasPublicDir && !hasAnyDynamicRewrites && !hasAnyRedirects) {
    throw new FirebaseError(
      'Must supply a "public" directory or at least one rewrite or redirect in each "hosting" config.'
    );
  }

  if (hasPublicDir && !dirExistsSync(resolveProjectPath(options, cfg.public!))) {
    throw new FirebaseError(
      `Specified "public" directory "${cfg.public}" does not exist, can't deploy hosting to site "${deploy.site}"`
    );
  }

  if (cfg.i18n) {
    if (!hasPublicDir) {
      throw new FirebaseError('Must supply a "public" directory when using "i18n" configuration.');
    }

    if (!cfg.i18n.root) {
      throw new FirebaseError('Must supply a "root" in "i18n" config.');
    } else {
      const i18nPath = path.join(cfg.public!, cfg.i18n.root);
      if (!dirExistsSync(resolveProjectPath(options, i18nPath))) {
        logLabeledWarning(
          "hosting",
          `Couldn't find specified i18n root directory ${clc.bold(
            cfg.i18n.root
          )} in public directory ${clc.bold(cfg.public)}.`
        );
      }
    }
  }
}
