import { Command } from "../command";
import { Aligner, CmQuery, queryTimeSeries, TimeSeriesView } from "../gcp/cloudmonitoring";
import { requireAuth } from "../requireAuth";
import { checkMinRequiredVersion } from "../checkMinRequiredVersion";
import { parseTimeseriesResponse } from "../extensions/metricsUtils";
import { getPublisherProfile } from "../extensions/extensionsApi";
import { getPublisherProjectFromName } from "../extensions/extensionsHelper";

module.exports = new Command("ext:dev:usage <publisherId>")
  .description("get usage for an extension")
  .help(
    "use this command to get the usage of extensions you published. " +
      "Specify the publisher ID you used to publish your extensions"
  )
  .before(requireAuth)
  .before(checkMinRequiredVersion, "extDevMinVersion")
  .action(async (publisherId: string) => {
    const profile = await getPublisherProfile("-", publisherId);

    const projectNumber = getPublisherProjectFromName(profile.name);

    const past30d = new Date();
    past30d.setDate(past30d.getDate() - 30);

    const query: CmQuery = {
      filter:
        'metric.type="firebaseextensions.googleapis.com/extension/version/active_instances" resource.type="firebaseextensions.googleapis.com/ExtensionVersion"',
      "interval.endTime": new Date().toJSON(),
      "interval.startTime": past30d.toJSON(),
      view: TimeSeriesView.FULL,
      "aggregation.alignmentPeriod": (60 * 60 * 24).toString() + "s",
      "aggregation.perSeriesAligner": Aligner.ALIGN_MAX,
    };

    const response = await queryTimeSeries(query, projectNumber);

    const metrics = parseTimeseriesResponse(response);
    // TODO(lihes): Render the output properly.
    console.log(metrics);
  });
