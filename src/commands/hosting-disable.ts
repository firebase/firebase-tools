import * as clc from "cli-color";

import { Client } from "../apiv2";
import { Command } from "../command";
import { hostingApiOrigin } from "../api";
import { promptOnce } from "../prompt";
import { requireHostingSite } from "../requireHostingSite";
import { requirePermissions } from "../requirePermissions";
import * as utils from "../utils";

export default new Command("hosting:disable")
  .description("stop serving web traffic to your Firebase Hosting site")
  .option("-y, --confirm", "skip confirmation")
  .option("-s, --site <siteName>", "the site to disable")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireHostingSite)
  .action(async (options) => {
    let confirm = Boolean(options.confirm);
    const siteToDisable: string = options.site;

    if (!confirm) {
      confirm = await promptOnce({
        type: "confirm",
        name: "confirm",
        message: `Are you sure you want to disable Firebase Hosting for the site ${clc.underline(
          siteToDisable
        )}\n${clc.underline("This will immediately make your site inaccessible!")}`,
      });
    }

    if (!confirm) {
      return;
    }

    const c = new Client({ urlPrefix: hostingApiOrigin, apiVersion: "v1beta1", auth: true });
    await c.post(`/sites/${siteToDisable}/releases`, { type: "SITE_DISABLE" });

    utils.logSuccess(
      `Hosting has been disabled for ${clc.bold(siteToDisable)}. Deploy a new version to re-enable.`
    );
  });
