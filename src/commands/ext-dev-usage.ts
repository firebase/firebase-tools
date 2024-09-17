const Table = require("cli-table");
import * as clc from "colorette";
import * as utils from "../utils";
import { Command } from "../command";
import { Aligner, CmQuery, queryTimeSeries, TimeSeriesView } from "../gcp/cloudmonitoring";
import { requireAuth } from "../requireAuth";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { buildMetricsTableRow, parseTimeseriesResponse } from "../extensions/metricsUtils";
import { getPublisherProfile, listExtensions } from "../extensions/publisherApi";
import { getPublisherProjectFromName, logPrefix } from "../extensions/extensionsHelper";
import { FirebaseError } from "../error";
import { logger } from "../logger";
import { promptOnce } from "../prompt";
import { shortenUrl } from "../shortenUrl";

export const command = new Command("ext:dev:usage <publisherId>")
  .description("get usage for an extension")
  .help(
    "use this command to get the usage of extensions you published. " +
      "Specify the publisher ID you used to publish your extensions, " +
      "or the extension ref of your published extension.",
  )
  .before(requireAuth)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (input: string) => {
    const extensionRefRegex = /^[\w\d-]+\/[\w\d-]+$/;

    let extensionName;
    let publisherId;
    if (extensionRefRegex.test(input)) {
      [publisherId, extensionName] = input.split("/");
    } else {
      // If input doesn't match extensionRef regex then treat it as a publisher ID.
      // We use the interactive flow to let users choose which extension to show stats for.
      publisherId = input;

      let extensions;
      try {
        extensions = await listExtensions(publisherId);
      } catch (err: any) {
        throw new FirebaseError(err);
      }

      if (extensions.length < 1) {
        throw new FirebaseError(
          `There are no published extensions associated with publisher ID ${clc.bold(
            publisherId,
          )}. This could happen for two reasons:\n` +
            "  - The publisher ID doesn't exist or could be misspelled\n" +
            "  - This publisher has not published any extensions\n\n" +
            "If you are expecting some extensions to appear, please make sure you have the correct publisher ID and try again.",
        );
      }

      extensionName = await promptOnce({
        type: "list",
        name: "extension",
        message: "Which published extension do you want to view the stats for?",
        choices: extensions.map((e) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const [_, name] = e.ref.split("/");
          return {
            name,
            value: name,
          };
        }),
      });
    }

    const profile = await getPublisherProfile("-", publisherId);

    const projectNumber = getPublisherProjectFromName(profile.name);

    const past45d = new Date();
    past45d.setDate(past45d.getDate() - 45);

    const query: CmQuery = {
      filter:
        `metric.type="firebaseextensions.googleapis.com/extension/version/active_instances" ` +
        `resource.type="firebaseextensions.googleapis.com/ExtensionVersion" ` +
        `resource.labels.extension="${extensionName}"`,
      "interval.endTime": new Date().toJSON(),
      "interval.startTime": past45d.toJSON(),
      view: TimeSeriesView.FULL,
      "aggregation.alignmentPeriod": (60 * 60 * 24).toString() + "s",
      "aggregation.perSeriesAligner": Aligner.ALIGN_MAX,
    };

    let response;
    try {
      response = await queryTimeSeries(query, projectNumber);
    } catch (err: any) {
      throw new FirebaseError(
        `Error occurred when fetching usage data for extension ${extensionName}`,
        {
          original: err,
        },
      );
    }
    if (!response) {
      throw new FirebaseError(`Couldn't find any usage data for extension ${extensionName}`);
    }

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

    utils.logLabeledBullet(logPrefix, `How to read this table:`);
    logger.info(`* Due to privacy considerations, numbers are reported as ranges.`);
    logger.info(`* In the absence of significant changes, we will render a '-' symbol.`);
    logger.info(
      `* You will need more than 10 installs over a period of more than 28 days to render sufficient data.`,
    );
    // TODO(b/216289102): Add buildCloudMonitoringLink back after UI is fixed.
  });

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- b/216289102
async function buildCloudMonitoringLink(args: {
  projectNumber: number;
  extensionName: string;
}): Promise<string> {
  // This JSON can be exported from the cloud monitoring page.
  const pageState = {
    xyChart: {
      dataSets: [
        {
          timeSeriesFilter: {
            filter:
              `metric.type="firebaseextensions.googleapis.com/extension/version/active_instances"` +
              ` resource.type="firebaseextensions.googleapis.com/ExtensionVersion"` +
              ` resource.label.extension="${args.extensionName}"`,
            minAlignmentPeriod: "86400s",
            aggregations: [
              {
                perSeriesAligner: "ALIGN_MEAN",
                crossSeriesReducer: "REDUCE_MAX",
                alignmentPeriod: "86400s",
                groupByFields: ['resource.label."extension"', 'resource.label."version"'],
              },
              {
                crossSeriesReducer: "REDUCE_NONE",
                alignmentPeriod: "60s",
                groupByFields: [],
              },
            ],
          },
        },
      ],
    },
    isAutoRefresh: true,
    timeSelection: {
      timeRange: "4w",
    },
  };

  let uri =
    `https://console.cloud.google.com/monitoring/metrics-explorer?project=${args.projectNumber}` +
    `&pageState=${JSON.stringify(pageState)}`;
  uri = encodeURI(uri);
  uri = await shortenUrl(uri);
  return uri;
}
