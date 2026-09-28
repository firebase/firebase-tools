import { cloudMonitoringOrigin } from "../api";
import { Client } from "../apiv2";
import { FirebaseError, getErrMsg, getError, getErrStatus } from "../error";

export const CLOUD_MONITORING_VERSION = "v3";

/**
 * Content of this file is borrowed from Cloud monitoring console's source code.
 * https://source.corp.google.com/piper///depot/google3/java/com/google/firebase/console/web/components/cloud_monitoring/typedefs.ts
 */

/** Query from v3 Cloud Monitoring API */
export interface CmQuery {
  filter: string;
  "interval.startTime"?: string;
  "interval.endTime"?: string;
  "aggregation.alignmentPeriod"?: string;
  "aggregation.perSeriesAligner"?: Aligner;
  "aggregation.crossSeriesReducer"?: Reducer;
  "aggregation.groupByFields"?: string;

  orderBy?: string;
  pageSize?: number;
  pageToken?: string;
  view?: TimeSeriesView;
}

/**
 * Controls which fields are returned by ListTimeSeries.
 */
export enum TimeSeriesView {
  FULL = "FULL",
  HEADERS = "HEADERS",
}

/**
 * The Aligner describes how to bring the data points in a single time series
 * into temporal alignment.
 */
export enum Aligner {
  ALIGN_NONE = "ALIGN_NONE",
  ALIGN_DELTA = "ALIGN_DELTA",
  ALIGN_RATE = "ALIGN_RATE",
  ALIGN_INTERPOLATE = "ALIGN_INTERPOLATE",
  ALIGN_NEXT_OLDER = "ALIGN_NEXT_OLDER",
  ALIGN_MIN = "ALIGN_MIN",
  ALIGN_MAX = "ALIGN_MAX",
  ALIGN_MEAN = "ALIGN_MEAN",
  ALIGN_COUNT = "ALIGN_COUNT",
  ALIGN_SUM = "ALIGN_SUM",
  ALIGN_STDDEV = "ALIGN_STDDEV",
  ALIGN_COUNT_TRUE = "ALIGN_COUNT_TRUE",
  ALIGN_FRACTION_TRUE = "ALIGN_FRACTION_TRUE",
}

export enum MetricKind {
  METRIC_KIND_UNSPECIFIED = "METRIC_KIND_UNSPECIFIED",
  GAUGE = "GAUGE",
  DELTA = "DELTA",
  CUMULATIVE = "CUMULATIVE",
}

/**
 * A Reducer describes how to aggregate data points from multiple time series
 * into a single time series.
 */
export enum Reducer {
  REDUCE_NONE = "REDUCE_NONE",
  REDUCE_MEAN = "REDUCE_MEAN",
  REDUCE_MIN = "REDUCE_MIN",
  REDUCE_MAX = "REDUCE_MAX",
  REDUCE_SUM = "REDUCE_SUM",
  REDUCE_STDDEV = "REDUCE_STDDEV",
  REDUCE_COUNT = "REDUCE_COUNT",
  REDUCE_COUNT_TRUE = "REDUCE_COUNT_TRUE",
  REDUCE_FRACTION_TRUE = "REDUCE_FRACTION_TRUE",
  REDUCE_PERCENTILE_99 = "REDUCE_PERCENTILE_99",
  REDUCE_PERCENTILE_95 = "REDUCE_PERCENTILE_95",
  REDUCE_PERCENTILE_50 = "REDUCE_PERCENTILE_50",
  REDUCE_PERCENTILE_05 = "REDUCE_PERCENTILE_05",
}

/** TimeSeries from v3 Cloud Monitoring API */
export interface TimeSeries {
  metric: Metric;
  metricKind: MetricKind;
  points: Point[];
  resource: Resource;
  valueType: ValueType;
}
export type TimeSeriesResponse = TimeSeries[];

/** Resource from v3 Cloud Monitoring API */
export interface Resource {
  labels: { [key: string]: string };
  type: string;
}
export type Metric = Resource;

/** Point from v3 Cloud Monitoring API */
export interface Point {
  interval: Interval;
  value: TypedValue;
}

/** Interval from v3 Cloud Monitoring API */
export interface Interval {
  endTime: string;
  startTime: string;
}

/** TypedValue from v3 Cloud Monitoring API */
export interface TypedValue {
  boolValue?: boolean;
  int64Value?: number;
  doubleValue?: number;
  stringValue?: string;
}

/**
 * The value type of a metric.
 */
export enum ValueType {
  VALUE_TYPE_UNSPECIFIED = "VALUE_TYPE_UNSPECIFIED",
  BOOL = "BOOL",
  INT64 = "INT64",
  DOUBLE = "DOUBLE",
  STRING = "STRING",
}

/**
 * Get usage metrics for all extensions from Cloud Monitoring API.
 */
export async function queryTimeSeries(
  query: CmQuery,
  project: number | string,
): Promise<TimeSeriesResponse> {
  const client = new Client({
    urlPrefix: cloudMonitoringOrigin(),
    apiVersion: CLOUD_MONITORING_VERSION,
  });
  const queryParams: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string" || typeof value === "number") {
      queryParams[key] = value;
    }
  }
  try {
    const res = await client.get<{ timeSeries: TimeSeriesResponse }>(
      `/projects/${project}/timeSeries/`,
      {
        queryParams,
      },
    );
    return res.body.timeSeries;
  } catch (err: unknown) {
    throw new FirebaseError(`Failed to get Cloud Monitoring metric: ${getErrMsg(err)}`, {
      status: getErrStatus(err),
      original: getError(err),
    });
  }
}

/** NotificationChannel from v3 Cloud Monitoring API */
export interface NotificationChannel {
  name?: string;
  type: string;
  displayName?: string;
  description?: string;
  labels?: { [key: string]: string };
  userLabels?: { [key: string]: string };
  enabled?: boolean;
}

/** AlertPolicy from v3 Cloud Monitoring API */
export interface AlertPolicy {
  name: string;
  displayName?: string;
  notificationChannels?: string[];
  userLabels?: { [key: string]: string };
  enabled?: boolean;
}

/**
 * Lists Cloud Monitoring NotificationChannel resources for a project.
 */
export async function listNotificationChannels(
  project: number | string,
  filter?: string,
): Promise<NotificationChannel[]> {
  const client = new Client({
    urlPrefix: cloudMonitoringOrigin(),
    apiVersion: CLOUD_MONITORING_VERSION,
  });
  try {
    const res = await client.get<{ notificationChannels?: NotificationChannel[] }>(
      `/projects/${project}/notificationChannels`,
      filter ? { queryParams: { filter } } : {},
    );
    return res.body?.notificationChannels ?? [];
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to list Cloud Monitoring notification channels: ${getErrMsg(err)}`,
      {
        status: getErrStatus(err),
        original: getError(err),
      },
    );
  }
}

/**
 * Creates a Cloud Monitoring NotificationChannel resource for a project.
 */
export async function createNotificationChannel(
  project: number | string,
  channel: NotificationChannel,
): Promise<NotificationChannel> {
  const client = new Client({
    urlPrefix: cloudMonitoringOrigin(),
    apiVersion: CLOUD_MONITORING_VERSION,
  });
  try {
    const res = await client.post<NotificationChannel, NotificationChannel>(
      `/projects/${project}/notificationChannels`,
      channel,
    );
    return res.body;
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to create Cloud Monitoring notification channel: ${getErrMsg(err)}`,
      {
        status: getErrStatus(err),
        original: getError(err),
      },
    );
  }
}

/**
 * Gets a Cloud Monitoring AlertPolicy resource by its full resource name
 * (e.g., `projects/{project}/alertPolicies/{policyId}`).
 */
export async function getAlertPolicy(name: string): Promise<AlertPolicy> {
  const client = new Client({
    urlPrefix: cloudMonitoringOrigin(),
    apiVersion: CLOUD_MONITORING_VERSION,
  });
  const path = name.startsWith("/") ? name : `/${name}`;
  try {
    const res = await client.get<AlertPolicy>(path);
    return res.body;
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to get Cloud Monitoring alert policy ${name}: ${getErrMsg(err)}`,
      {
        status: getErrStatus(err),
        original: getError(err),
      },
    );
  }
}

/**
 * Updates a Cloud Monitoring AlertPolicy resource.
 */
export async function updateAlertPolicy(
  policy: AlertPolicy,
  updateMask?: string,
): Promise<AlertPolicy> {
  const client = new Client({
    urlPrefix: cloudMonitoringOrigin(),
    apiVersion: CLOUD_MONITORING_VERSION,
  });
  const path = policy.name.startsWith("/") ? policy.name : `/${policy.name}`;
  try {
    const res = await client.patch<AlertPolicy, AlertPolicy>(
      path,
      policy,
      updateMask ? { queryParams: { updateMask } } : {},
    );
    return res.body;
  } catch (err: unknown) {
    throw new FirebaseError(
      `Failed to update Cloud Monitoring alert policy ${policy.name}: ${getErrMsg(err)}`,
      {
        status: getErrStatus(err),
        original: getError(err),
      },
    );
  }
}
