import * as _ from "lodash";
import { expect } from "chai";
import * as clc from "cli-color";

import {
  buildMetricsTableRow,
  parseBucket,
  parseTimeseriesResponse,
} from "../../extensions/metricsUtils";
import { TimeSeriesResponse, MetricKind, ValueType } from "../../gcp/cloudmonitoring";
import { BucketedMetric } from "../../extensions/metricsTypeDef";

describe("metricsUtil", () => {
  describe(`${parseBucket.name}`, () => {
    it("should parse a bucket based on the higher bound value", () => {
      expect(parseBucket(10)).to.deep.equals({ low: 0, high: 10 });
      expect(parseBucket(50)).to.deep.equals({ low: 40, high: 50 });
      expect(parseBucket(200)).to.deep.equals({ low: 100, high: 200 });
      expect(parseBucket(2200)).to.deep.equals({ low: 2100, high: 2200 });
      expect(parseBucket(0)).to.deep.equals({ low: 0, high: 0 });
    });
  });

  describe("buildMetricsTableRow", () => {
    it("shows decreasing instance count properly", () => {
      const metric: BucketedMetric = {
        ref: {
          publisherId: "firebase",
          extensionId: "bq-export",
          version: "0.0.1",
        },
        valueToday: {
          high: 500,
          low: 400,
        },
        value7dAgo: {
          high: 400,
          low: 300,
        },
        value28dAgo: {
          high: 200,
          low: 100,
        },
      };
      expect(buildMetricsTableRow(metric)).to.deep.equals([
        "0.0.1",
        "400 - 500",
        clc.green("▲ ") + "100 (±100)",
        clc.green("▲ ") + "300 (±100)",
      ]);
    });
    it("shows decreasing instance count properly", () => {
      const metric: BucketedMetric = {
        ref: {
          publisherId: "firebase",
          extensionId: "bq-export",
          version: "0.0.1",
        },
        valueToday: {
          high: 200,
          low: 100,
        },
        value7dAgo: {
          high: 200,
          low: 100,
        },
        value28dAgo: {
          high: 300,
          low: 200,
        },
      };
      expect(buildMetricsTableRow(metric)).to.deep.equals([
        "0.0.1",
        "100 - 200",
        "-",
        clc.red("▼ ") + "-100 (±100)",
      ]);
    });
  });

  describe(`${parseTimeseriesResponse.name}`, () => {
    it("should parse TimeSeriesResponse into list of BucketedMetrics", () => {
      const series: TimeSeriesResponse = [
        {
          metric: {
            type: "firebaseextensions.googleapis.com/extension/version/active_instances",
            labels: {
              extension: "export-bigquery",
              publisher: "firebase",
              version: "0.1.0",
            },
          },
          metricKind: MetricKind.GAUGE,
          resource: {
            labels: {
              extension: "export-bigquery",
              publisher: "firebase",
              version: "all",
            },
            type: "firebaseextensions.googleapis.com/ExtensionVersion",
          },
          valueType: ValueType.INT64,
          points: [
            {
              interval: {
                startTime: "2021-10-30T17:56:21.027Z",
                endTime: "2021-10-30T17:56:21.027Z",
              },
              value: {
                int64Value: 10,
              },
            },
          ],
        },
        {
          metric: {
            type: "firebaseextensions.googleapis.com/extension/version/active_instances",
            labels: {
              extension: "export-bigquery",
              publisher: "firebase",
              version: "0.1.0",
            },
          },
          metricKind: MetricKind.GAUGE,
          resource: {
            labels: {
              extension: "export-bigquery",
              publisher: "firebase",
              version: "0.1.0",
            },
            type: "firebaseextensions.googleapis.com/ExtensionVersion",
          },
          valueType: ValueType.INT64,
          points: [
            {
              interval: {
                startTime: "2021-10-30T17:56:21.027Z",
                endTime: "2021-10-30T17:56:21.027Z",
              },
              value: {
                int64Value: 10,
              },
            },
            {
              interval: {
                startTime: "2021-10-29T17:56:21.027Z",
                endTime: "2021-10-29T17:56:21.027Z",
              },
              value: {
                int64Value: 20,
              },
            },
            {
              interval: {
                startTime: "2021-10-28T17:56:21.027Z",
                endTime: "2021-10-28T17:56:21.027Z",
              },
              value: {
                int64Value: 30,
              },
            },
            {
              interval: {
                startTime: "2021-10-27T17:56:21.027Z",
                endTime: "2021-10-27T17:56:21.027Z",
              },
              value: {
                int64Value: 40,
              },
            },
            {
              interval: {
                startTime: "2021-10-26T17:56:21.027Z",
                endTime: "2021-10-26T17:56:21.027Z",
              },
              value: {
                int64Value: 50,
              },
            },
            {
              interval: {
                startTime: "2021-10-25T17:56:21.027Z",
                endTime: "2021-10-25T17:56:21.027Z",
              },
              value: {
                int64Value: 60,
              },
            },
            {
              interval: {
                startTime: "2021-10-24T17:56:21.027Z",
                endTime: "2021-10-24T17:56:21.027Z",
              },
              value: {
                int64Value: 70,
              },
            },
            {
              interval: {
                startTime: "2021-10-23T17:56:21.027Z",
                endTime: "2021-10-23T17:56:21.027Z",
              },
              value: {
                int64Value: 80,
              },
            },
            {
              interval: {
                startTime: "2021-10-22T17:56:21.027Z",
                endTime: "2021-10-22T17:56:21.027Z",
              },
              value: {
                int64Value: 90,
              },
            },
            {
              interval: {
                startTime: "2021-10-21T17:56:21.027Z",
                endTime: "2021-10-21T17:56:21.027Z",
              },
              value: {
                int64Value: 100,
              },
            },
            {
              interval: {
                startTime: "2021-10-20T17:56:21.027Z",
                endTime: "2021-10-20T17:56:21.027Z",
              },
              value: {
                int64Value: 200,
              },
            },
            {
              interval: {
                startTime: "2021-10-19T17:56:21.027Z",
                endTime: "2021-10-19T17:56:21.027Z",
              },
              value: {
                int64Value: 300,
              },
            },
            {
              interval: {
                startTime: "2021-10-18T17:56:21.027Z",
                endTime: "2021-10-18T17:56:21.027Z",
              },
              value: {
                int64Value: 400,
              },
            },
            {
              interval: {
                startTime: "2021-10-17T17:56:21.027Z",
                endTime: "2021-10-17T17:56:21.027Z",
              },
              value: {
                int64Value: 500,
              },
            },
            {
              interval: {
                startTime: "2021-10-16T17:56:21.027Z",
                endTime: "2021-10-16T17:56:21.027Z",
              },
              value: {
                int64Value: 600,
              },
            },
            {
              interval: {
                startTime: "2021-10-15T17:56:21.027Z",
                endTime: "2021-10-15T17:56:21.027Z",
              },
              value: {
                int64Value: 700,
              },
            },
            {
              interval: {
                startTime: "2021-10-14T17:56:21.027Z",
                endTime: "2021-10-14T17:56:21.027Z",
              },
              value: {
                int64Value: 800,
              },
            },
            {
              interval: {
                startTime: "2021-10-13T17:56:21.027Z",
                endTime: "2021-10-13T17:56:21.027Z",
              },
              value: {
                int64Value: 900,
              },
            },
            {
              interval: {
                startTime: "2021-10-12T17:56:21.027Z",
                endTime: "2021-10-12T17:56:21.027Z",
              },
              value: {
                int64Value: 1000,
              },
            },
            {
              interval: {
                startTime: "2021-10-11T17:56:21.027Z",
                endTime: "2021-10-11T17:56:21.027Z",
              },
              value: {
                int64Value: 1100,
              },
            },
            {
              interval: {
                startTime: "2021-10-10T17:56:21.027Z",
                endTime: "2021-10-10T17:56:21.027Z",
              },
              value: {
                int64Value: 1200,
              },
            },
            {
              interval: {
                startTime: "2021-10-09T17:56:21.027Z",
                endTime: "2021-10-09T17:56:21.027Z",
              },
              value: {
                int64Value: 1300,
              },
            },
            {
              interval: {
                startTime: "2021-10-08T17:56:21.027Z",
                endTime: "2021-10-08T17:56:21.027Z",
              },
              value: {
                int64Value: 1400,
              },
            },
            {
              interval: {
                startTime: "2021-10-07T17:56:21.027Z",
                endTime: "2021-10-07T17:56:21.027Z",
              },
              value: {
                int64Value: 1500,
              },
            },
            {
              interval: {
                startTime: "2021-10-06T17:56:21.027Z",
                endTime: "2021-10-06T17:56:21.027Z",
              },
              value: {
                int64Value: 1600,
              },
            },
            {
              interval: {
                startTime: "2021-10-05T17:56:21.027Z",
                endTime: "2021-10-05T17:56:21.027Z",
              },
              value: {
                int64Value: 1700,
              },
            },
            {
              interval: {
                startTime: "2021-10-04T17:56:21.027Z",
                endTime: "2021-10-04T17:56:21.027Z",
              },
              value: {
                int64Value: 1800,
              },
            },
            {
              interval: {
                startTime: "2021-10-03T17:56:21.027Z",
                endTime: "2021-10-03T17:56:21.027Z",
              },
              value: {
                int64Value: 1900,
              },
            },
            {
              interval: {
                startTime: "2021-10-02T17:56:21.027Z",
                endTime: "2021-10-02T17:56:21.027Z",
              },
              value: {
                int64Value: 2000,
              },
            },
            {
              interval: {
                startTime: "2021-10-01T17:56:21.027Z",
                endTime: "2021-10-01T17:56:21.027Z",
              },
              value: {
                int64Value: 2100,
              },
            },
          ],
        },
      ];

      expect(parseTimeseriesResponse(series)).to.deep.equals([
        {
          ref: {
            extensionId: "export-bigquery",
            publisherId: "firebase",
            version: "0.1.0",
          },
          value28dAgo: {
            high: 1900,
            low: 1800,
          },
          value7dAgo: {
            high: 70,
            low: 60,
          },
          valueToday: {
            high: 10,
            low: 0,
          },
        },
        // Should sort "all" to the end.
        {
          ref: {
            extensionId: "export-bigquery",
            publisherId: "firebase",
            version: "all",
          },
          value28dAgo: undefined,
          value7dAgo: undefined,
          valueToday: {
            high: 10,
            low: 0,
          },
        },
      ]);
    });
  });
});
