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
