import * as refs from "./refs";

/**
 * Interface for representing a metric to be rendered by the extension's CLI.
 */
export interface BucketedMetric {
  ref: refs.Ref;
  valueToday: Bucket | undefined;
  value7dAgo: Bucket | undefined;
  value28dAgo: Bucket | undefined;
}

/**
 * Bucket is the range that a raw number falls under.
 *
 * Valid bucket sizes are:
 * 0
 * 0 - 10
 * 10 - 20
 * 20 - 30
 * ...
 * 90 - 100
 * 100 - 200
 * 200 - 300
 * every 100...
 *
 * Note the buckets overlaps intentionally as a UX-optimization.
 */
export interface Bucket {
  low: number;
  high: number;
}
