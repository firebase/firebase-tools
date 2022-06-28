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

/** Google Cloud Storage multi-region mapping (https://cloud.google.com/storage/docs/locations#location-mr) */
export const MULTI_REGION_MAPPING: Record<string, string> = {
  /** us */
  "us-central1": "us",
  "us-east1": "us",
  "us-east4": "us",
  "us-west1": "us",
  "us-west2": "us",
  "us-west3": "us",
  "us-west4": "us",
  /** eu */
  "europe-central2": "eu",
  "europe-north1": "eu",
  "europe-west1": "eu",
  "europe-west3": "eu",
  "europe-west4": "eu",
  "europe-west5": "eu",
  /** asia */
  "asia-east1": "asia",
  "asia-east2": "asia",
  "asia-northeast1": "asia",
  "asia-northeast2": "asia",
  "asia-northeast3": "asia",
  "asia-south1": "asia",
  "asia-south2": "asia",
  "asia-southeast1": "asia",
  "asia-southeast2": "asia",
};

/** Google Cloud Storage dual-region mapping (https://cloud.google.com/storage/docs/locations#location-dr) */
export const DUAL_REGION_MAPPING: Record<string, string> = {
  /** asia1 */
  "asia-northeast1": "asia1",
  "asia-northeast2": "asia1",
  /** eur4 */
  "europe-north1": "eur4",
  "europe-west4": "eur4",
  /** nam4 */
  "us-central1": "nam4",
  "us-east1": "nam4",
};

/**
 * Helper function to determine if the given region is inside the multi-region or dual-region location.
 * This is helpful for determining if a specific region maps to a Google Cloud Storage location.
 * @param region the specific geographical region name (ex~ us-west1, europe-central2, ...)
 * @param location the multi-region or dual-region location name (ex~ us, asia, nam4, ...)
 * @returns true if the region is in the location, otherwise false
 */
export function regionInLocation(region: string, location: string): boolean {
  // check whether the region matched the location,
  // if the location is a metro that matches the region, or if the location is a geo that matches the region
  region = region.toLowerCase();
  location = location.toLowerCase();
  if (MULTI_REGION_MAPPING[region] === location || DUAL_REGION_MAPPING[region] === location) {
    return true;
  }
  return false;
}
