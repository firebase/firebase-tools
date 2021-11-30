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
