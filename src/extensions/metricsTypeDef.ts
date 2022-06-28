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
