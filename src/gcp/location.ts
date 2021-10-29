// A mapping from geographical region to subdomain, usefull for Container Registry
const SUBDOMAIN_MAPPING: Record<string, string> = {
  "us-west1": "us",
  "us-west2": "us",
  "us-west3": "us",
  "us-west4": "us",
  "us-central1": "us",
  "us-central2": "us",
  "us-east1": "us",
  "us-east4": "us",
  "northamerica-northeast1": "us",
  "southamerica-east1": "us",
  "europe-west1": "eu",
  "europe-west2": "eu",
  "europe-west3": "eu",
  "europe-west4": "eu",
  "europe-west5": "eu",
  "europe-west6": "eu",
  "europe-central2": "eu",
  "europe-north1": "eu",
  "asia-east1": "asia",
  "asia-east2": "asia",
  "asia-northeast1": "asia",
  "asia-northeast2": "asia",
  "asia-northeast3": "asia",
  "asia-south1": "asia",
  "asia-southeast2": "asia",
  "australia-southeast1": "asia",
};

/** Google Cloud Storage multi-region mapping (https://cloud.google.com/storage/docs/locations#location-mr) */
const MULTI_REGION_MAPPING: Record<string, string> = {
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
const DUAL_REGION_MAPPING: Record<string, string> = {
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
 * Obtains the subdomains for all the hostname options in Container Registry
 */
export function getContainerRegistrySubdomains(): string[] {
  return Object.values(SUBDOMAIN_MAPPING);
}

/**
 * Obtains the geographical regions that exist in Container Registry from a function deployment
 */
export function getContainerRegistryRegions(): string[] {
  return Object.keys(SUBDOMAIN_MAPPING);
}

/**
 * Obtain the subdomain that corresponds to the given region in Container Registry
 * @param region a geographical region from gcp (ex~ us-central1)
 * @returns the mapped subdomain for a hostname in Container Registry
 */
export function regionToSubdomain(region: string): string | undefined {
  return SUBDOMAIN_MAPPING[region];
}

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
