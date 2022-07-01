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

import * as semver from "semver";
import { TimeSeries, TimeSeriesResponse } from "../gcp/cloudmonitoring";
import { Bucket, BucketedMetric } from "./metricsTypeDef";
import * as refs from "./refs";
import * as clc from "cli-color";

/**
 * Parse TimeSeriesResponse into structured metric data.
 */
export function parseTimeseriesResponse(series: TimeSeriesResponse): Array<BucketedMetric> {
  const ret: BucketedMetric[] = [];
  for (const s of series) {
    const ref = buildRef(s);

    if (ref === undefined) {
      // Skip if data point has no valid ref.
      continue;
    }

    let valueToday: Bucket | undefined;
    let value7dAgo: Bucket | undefined;
    let value28dAgo: Bucket | undefined;

    // Extract significant data points and convert them to buckets.
    if (s.points.length >= 28 && s.points[27].value.int64Value !== undefined) {
      value28dAgo = parseBucket(s.points[27].value.int64Value);
    }
    if (s.points.length >= 7 && s.points[6].value.int64Value !== undefined) {
      value7dAgo = parseBucket(s.points[6].value.int64Value);
    }
    if (s.points.length >= 1 && s.points[0].value.int64Value !== undefined) {
      valueToday = parseBucket(s.points[0].value.int64Value);
    }

    ret.push({
      ref,
      valueToday,
      value7dAgo,
      value28dAgo,
    });
  }

  ret.sort((a, b) => {
    if (a.ref.version === "all") {
      return 1;
    }
    if (b.ref.version === "all") {
      return -1;
    }
    return semver.lt(a.ref.version!, b.ref.version!) ? 1 : -1;
  });
  return ret;
}

/**
 * Converts a single number back into a range bucket that the raw number falls under.
 *
 * The reverse side of the logic lives here:
 * https://source.corp.google.com/piper///depot/google3/firebase/mods/jobs/metrics/buckets.go
 *
 * @param v Value got from Cloud Monitoring, which is the upper-bound of the bucket.
 */
export function parseBucket(value: number): Bucket {
  // int64Value has type "number" but can still be interupted as "string" sometimes.
  // Force cast into number just in case.
  const v = Number(value);

  if (v >= 200) {
    return { low: v - 100, high: v };
  }
  if (v >= 10) {
    return { low: v - 10, high: v };
  }
  return { low: 0, high: 0 };
}

/**
 * Build a row in the metrics table given a bucketed metric.
 */
export function buildMetricsTableRow(metric: BucketedMetric): Array<string> {
  const ret: string[] = [metric.ref.version!];

  if (metric.valueToday) {
    ret.push(`${metric.valueToday.low} - ${metric.valueToday.high}`);
  } else {
    ret.push("Insufficient data");
  }

  ret.push(renderChangeCell(metric.value7dAgo, metric.valueToday));

  ret.push(renderChangeCell(metric.value28dAgo, metric.valueToday));

  return ret;
}

function renderChangeCell(before: Bucket | undefined, after: Bucket | undefined) {
  if (!(before && after)) {
    return "Insufficient data";
  }
  if (before.high === after.high) {
    return "-";
  }

  if (before.high > after.high) {
    const diff = before.high - after.high;
    const tolerance = diff < 100 ? 10 : 100;
    return clc.red("▼ ") + `-${diff} (±${tolerance})`;
  } else {
    const diff = after.high - before.high;
    const tolerance = diff < 100 ? 10 : 100;
    return clc.green("▲ ") + `${diff} (±${tolerance})`;
  }
}

/**
 * Build an extension ref from a Cloud Monitoring's TimeSeries.
 *
 * Return null if resource labels are malformed.
 */
function buildRef(ts: TimeSeries): refs.Ref | undefined {
  const publisherId = ts.resource.labels["publisher"];
  const extensionId = ts.resource.labels["extension"];
  const version = ts.resource.labels["version"];

  if (!(publisherId && extensionId && version)) {
    return undefined;
  }

  return {
    publisherId,
    extensionId,
    version,
  };
}
