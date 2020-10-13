import * as clc from "cli-color";

import { Command } from "../command";
import { promptOnce } from "../prompt";
import { requirePermissions } from "../requirePermissions";
import * as api from "../api";
import * as requireInstance from "../requireInstance";
import * as utils from "../utils";

export default new Command("hosting:disable")
  .description("stop serving web traffic to your Firebase Hosting site")
  .option("-y, --confirm", "skip confirmation")
  .option("-s, --site <siteName>", "the site to disable")
  .before(requirePermissions, ["firebasehosting.sites.update"])
  .before(requireInstance)
  .action(async (options) => {
    let confirm = Boolean(options.confirm);
    const siteToDisable: string = options.site || options.instance;

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

    await api.request("POST", `/v1beta1/sites/${siteToDisable}/releases`, {
      auth: true,
      data: {
        type: "SITE_DISABLE",
      },
      origin: api.hostingApiOrigin,
    });

    utils.logSuccess(
      `Hosting has been disabled for ${clc.bold(siteToDisable)}. Deploy a new version to re-enable.`
    );
  });
