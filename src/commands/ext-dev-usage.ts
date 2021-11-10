import Table = require("cli-table");
import * as clc from "cli-color";
import * as utils from "../utils";
import { Command } from "../command";
import { Aligner, CmQuery, queryTimeSeries, TimeSeriesView } from "../gcp/cloudmonitoring";
import { requireAuth } from "../requireAuth";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { buildMetricsTableRow, parseTimeseriesResponse } from "../extensions/metricsUtils";
import { getPublisherProfile } from "../extensions/extensionsApi";
import { getPublisherProjectFromName, logPrefix } from "../extensions/extensionsHelper";
import { FirebaseError } from "../error";
import { logger } from "../logger";

module.exports = new Command("ext:dev:usage <publisherId>")
  .description("get usage for an extension")
  .help(
    "use this command to get the usage of extensions you published. " +
      "Specify the publisher ID you used to publish your extensions, " +
      "or the extension ID of your published extension."
  )
  .before(requireAuth)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (input: string) => {
    const extensionIdRegex = /^[\w\d-]+\/[\w\d-]+$/;

    let extensionName;
    let publisherId;
    if (extensionIdRegex.test(input)) {
      [publisherId, extensionName] = input.split("/");
    } else {
      publisherId = input;
      // TODO: show interactive options to select an extension to show metrics for. (next PR)
      throw new FirebaseError("Interactive selection unimplemented, pass extension ref instead");
    }

    const profile = await getPublisherProfile("-", publisherId);

    const projectNumber = getPublisherProjectFromName(profile.name);

    const past30d = new Date();
    past30d.setDate(past30d.getDate() - 30);

    const query: CmQuery = {
      filter:
        `metric.type="firebaseextensions.googleapis.com/extension/version/active_instances" ` +
        `resource.type="firebaseextensions.googleapis.com/ExtensionVersion" ` +
        `resource.labels.extension="${extensionName}"`,
      "interval.endTime": new Date().toJSON(),
      "interval.startTime": past30d.toJSON(),
      view: TimeSeriesView.FULL,
      "aggregation.alignmentPeriod": (60 * 60 * 24).toString() + "s",
      "aggregation.perSeriesAligner": Aligner.ALIGN_MAX,
    };

    const response = await queryTimeSeries(query, projectNumber);

    const metrics = parseTimeseriesResponse(response);

    const table = new Table({
      head: ["Version", "Active Instances", "Changes last 7 Days", "Changes last 28 Days"],
      style: {
        head: ["yellow"],
      },
      colAligns: ["left", "right", "right", "right"],
    });
    metrics.forEach((m) => {
      table.push(buildMetricsTableRow(m));
    });

    utils.logLabeledBullet(logPrefix, `showing usage stats for ${clc.bold(extensionName)}:`);
    logger.info(table.toString());
  });
