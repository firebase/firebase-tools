"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.queryTimeSeries = exports.ValueType = exports.Reducer = exports.MetricKind = exports.Aligner = exports.TimeSeriesView = exports.CLOUD_MONITORING_VERSION = void 0;
const api_1 = require("../api");
const apiv2_1 = require("../apiv2");
const error_1 = require("../error");
exports.CLOUD_MONITORING_VERSION = "v3";
/**
 * Controls which fields are returned by ListTimeSeries.
 */
var TimeSeriesView;
(function (TimeSeriesView) {
    TimeSeriesView["FULL"] = "FULL";
    TimeSeriesView["HEADERS"] = "HEADERS";
})(TimeSeriesView = exports.TimeSeriesView || (exports.TimeSeriesView = {}));
/**
 * The Aligner describes how to bring the data points in a single time series
 * into temporal alignment.
 */
var Aligner;
(function (Aligner) {
    Aligner["ALIGN_NONE"] = "ALIGN_NONE";
    Aligner["ALIGN_DELTA"] = "ALIGN_DELTA";
    Aligner["ALIGN_RATE"] = "ALIGN_RATE";
    Aligner["ALIGN_INTERPOLATE"] = "ALIGN_INTERPOLATE";
    Aligner["ALIGN_NEXT_OLDER"] = "ALIGN_NEXT_OLDER";
    Aligner["ALIGN_MIN"] = "ALIGN_MIN";
    Aligner["ALIGN_MAX"] = "ALIGN_MAX";
    Aligner["ALIGN_MEAN"] = "ALIGN_MEAN";
    Aligner["ALIGN_COUNT"] = "ALIGN_COUNT";
    Aligner["ALIGN_SUM"] = "ALIGN_SUM";
    Aligner["ALIGN_STDDEV"] = "ALIGN_STDDEV";
    Aligner["ALIGN_COUNT_TRUE"] = "ALIGN_COUNT_TRUE";
    Aligner["ALIGN_FRACTION_TRUE"] = "ALIGN_FRACTION_TRUE";
})(Aligner = exports.Aligner || (exports.Aligner = {}));
var MetricKind;
(function (MetricKind) {
    MetricKind["METRIC_KIND_UNSPECIFIED"] = "METRIC_KIND_UNSPECIFIED";
    MetricKind["GAUGE"] = "GAUGE";
    MetricKind["DELTA"] = "DELTA";
    MetricKind["CUMULATIVE"] = "CUMULATIVE";
})(MetricKind = exports.MetricKind || (exports.MetricKind = {}));
/**
 * A Reducer describes how to aggregate data points from multiple time series
 * into a single time series.
 */
var Reducer;
(function (Reducer) {
    Reducer["REDUCE_NONE"] = "REDUCE_NONE";
    Reducer["REDUCE_MEAN"] = "REDUCE_MEAN";
    Reducer["REDUCE_MIN"] = "REDUCE_MIN";
    Reducer["REDUCE_MAX"] = "REDUCE_MAX";
    Reducer["REDUCE_SUM"] = "REDUCE_SUM";
    Reducer["REDUCE_STDDEV"] = "REDUCE_STDDEV";
    Reducer["REDUCE_COUNT"] = "REDUCE_COUNT";
    Reducer["REDUCE_COUNT_TRUE"] = "REDUCE_COUNT_TRUE";
    Reducer["REDUCE_FRACTION_TRUE"] = "REDUCE_FRACTION_TRUE";
    Reducer["REDUCE_PERCENTILE_99"] = "REDUCE_PERCENTILE_99";
    Reducer["REDUCE_PERCENTILE_95"] = "REDUCE_PERCENTILE_95";
    Reducer["REDUCE_PERCENTILE_50"] = "REDUCE_PERCENTILE_50";
    Reducer["REDUCE_PERCENTILE_05"] = "REDUCE_PERCENTILE_05";
})(Reducer = exports.Reducer || (exports.Reducer = {}));
/**
 * The value type of a metric.
 */
var ValueType;
(function (ValueType) {
    ValueType["VALUE_TYPE_UNSPECIFIED"] = "VALUE_TYPE_UNSPECIFIED";
    ValueType["BOOL"] = "BOOL";
    ValueType["INT64"] = "INT64";
    ValueType["DOUBLE"] = "DOUBLE";
    ValueType["STRING"] = "STRING";
})(ValueType = exports.ValueType || (exports.ValueType = {}));
/**
 * Get usage metrics for all extensions from Cloud Monitoring API.
 */
async function queryTimeSeries(query, project) {
    const client = new apiv2_1.Client({
        urlPrefix: (0, api_1.cloudMonitoringOrigin)(),
        apiVersion: exports.CLOUD_MONITORING_VERSION,
    });
    try {
        const res = await client.get(`/projects/${project}/timeSeries/`, {
            queryParams: query,
        });
        return res.body.timeSeries;
    }
    catch (err) {
        throw new error_1.FirebaseError(`Failed to get Cloud Monitoring metric: ${err}`, {
            status: err.status,
        });
    }
}
exports.queryTimeSeries = queryTimeSeries;
//# sourceMappingURL=cloudmonitoring.js.map