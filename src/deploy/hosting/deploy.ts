import { Uploader } from "./uploader";
import { detectProjectRoot } from "../../detectProjectRoot";
import { listFiles } from "../../listFiles";
import { logger } from "../../logger";
import { track } from "../../track";
import { envOverride, logLabeledBullet, logLabeledSuccess } from "../../utils";
import { HostingDeploy } from "./hostingDeploy";

import * as clc from "cli-color";
const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

// Feature from cli-color 2.0.0 that we want to use:
// See: https://github.com/medikoo/cli-color/blob/master/erase.js
const _ERASE_LINE = "\x1b[2K";

export async function deploy(
  context: { hosting?: { deploys?: HostingDeploy[] } },
  options: {
    cwd?: string;
    configPath?: string;
    debug?: boolean;
    nonInteractive?: boolean;
    config: { path: (path: string) => string };
  }
): Promise<void> {
  if (!context.hosting?.deploys) {
    return;
  }

  let spins = 0;
  function updateSpinner(newMessage: string, debugging: boolean): void {
    // don't try to rewrite lines if debugging since it's likely to get interrupted
    if (debugging) {
      logLabeledBullet("hosting", newMessage);
    } else {
      process.stdout.write(_ERASE_LINE + clc.move(-9999, 0));
      process.stdout.write(
        clc.bold.cyan(SPINNER[spins % SPINNER.length] + "  hosting: ") + newMessage
      );
    }
    spins++;
  }

  async function runDeploys(deploys: HostingDeploy[], debugging: boolean): Promise<void> {
    const deploy = deploys.shift();
    if (!deploy) {
      return;
    }

    // No need to run Uploader for no-file deploys
    if (!deploy.config?.public) {
      logLabeledBullet(
        `hosting[${deploy.site}]`,
        'no "public" directory to upload, continuing with release'
      );
      return runDeploys(deploys, debugging);
    }

    logLabeledBullet("hosting[" + deploy.site + "]", "beginning deploy...");
    const t0 = Date.now();

    const publicDir = options.config.path(deploy.config.public);
    const files = listFiles(publicDir, deploy.config.ignore);

    logLabeledBullet(
      `hosting[${deploy.site}]`,
      `found ${files.length} files in ${clc.bold(deploy.config.public)}`
    );

    let concurrency = 200;
    const envConcurrency = envOverride("FIREBASE_HOSTING_UPLOAD_CONCURRENCY", "");
    if (envConcurrency) {
      const c = parseInt(envConcurrency, 10);
      if (!isNaN(c) && c > 0) {
        concurrency = c;
      }
    }

    logger.debug(`[hosting] uploading with ${concurrency} concurrency`);
    const uploader = new Uploader({
      version: deploy.version,
      files: files,
      public: publicDir,
      cwd: options.cwd,
      projectRoot: detectProjectRoot(options),
      uploadConcurrency: concurrency,
    });

    const progressInterval = setInterval(
      () => updateSpinner(uploader.statusMessage(), debugging),
      debugging ? 2000 : 200
    );

    try {
      await uploader.start();
    } catch (err: any) {
      void track("Hosting Deploy", "failure");
      throw err;
    } finally {
      clearInterval(progressInterval);
    }

    if (!debugging) {
      process.stdout.write(_ERASE_LINE + clc.move(-9999, 0));
    }

    logLabeledSuccess("hosting[" + deploy.site + "]", "file upload complete");
    const dt = Date.now() - t0;
    logger.debug("[hosting] deploy completed after " + dt + "ms");

    void track("Hosting Deploy", "success", dt);
    return runDeploys(deploys, debugging);
  }

  const debugging = !!(options.debug || options.nonInteractive);
  const deploys = [...(context.hosting?.deploys || [])];
  return runDeploys(deploys, debugging);
}
