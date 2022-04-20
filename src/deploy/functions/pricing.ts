import * as backend from "./backend";

// This file takes data from
// https://cloud.google.com/functions/pricing and
// https://cloud.google.com/run/pricing
//
// It includes enough information to start eventually thinking about a pricing estimator
// because it was pretty trivial to start transcribing this information, but GCFv2
// network egress isn't included because it's _very_ complicated (there's tables for
// the source and destination region).

type tier = 1 | 2;

const V1_REGION_TO_TIER: Record<string, tier> = {
  "us-central1": 1,
  "us-east1": 1,
  "us-east4": 1,
  "europe-west1": 1,
  "europe-west2": 1,
  "asia-east2": 1,
  "asia-northeast1": 1,
  "asia-northeast2": 1,
  "us-west2": 2,
  "us-west3": 2,
  "us-west4": 2,
  "northamerica-northeast1": 2,
  "southamerica-east1": 2,
  "europe-west3": 2,
  "europe-west6": 2,
  "europe-central2": 2,
  "australia-southeast1": 2,
  "asia-south1": 2,
  "asia-southeast2": 2,
  "asia-northeast3": 2,
};

const V2_REGION_TO_TIER: Record<string, tier> = {
  "asia-east1": 1,
  "asia-northeast1": 1,
  "asia-northeast2": 1,
  "europe-north1": 1,
  "europe-west1": 1,
  "europe-west4": 1,
  "us-central1": 1,
  "us-east1": 1,
  "us-east4": 1,
  "us-west1": 1,
  "asia-east2": 2,
  "asia-northeast3": 2,
  "asia-southeast1": 2,
  "asia-southeast2": 2,
  "asia-south1": 2,
  "australia-southeast1": 2,
  "europe-central2": 2,
  "europe-west2": 2,
  "europe-west3": 2,
  "europe-west6": 2,
  "northamerica-northeast1": 2,
  "southamerica-east1": 2,
  "us-west2": 2,
  "us-west3": 2,
  "us-west4": 2,
};

export const V1_RATES = {
  invocations: 0.000_000_4,
  memoryGb: {
    1: 0.000_002_5,
    2: 0.000_003_5,
  } as Record<tier, number>,
  cpuGhz: {
    1: 0.000_01,
    2: 0.000_014,
  } as Record<tier, number>,
  idleCpuGhz: {
    1: 0.000_001,
    2: 0.000_001_45,
  },
  egress: 0.12,
};

// NOTE: Cloud Run supports committed use discounts (https://cloud.google.com/run/pricing)
// Any UX that displays this pricing should also mention the CUD.
export const V2_RATES = {
  invocations: 0.000_000_4,
  memoryGb: {
    1: 0.000_002_5,
    2: 0.000_003_5,
  },
  vCpu: {
    1: 0.000_024,
    2: 0.000_033_6,
  },
  idleVCpu: {
    1: 0.000_002_5,
    2: 0.000_003_5,
  },
  // This is much more complicated than V1. There's a full table at
  // https://cloud.google.com/vpc/network-pricing#internet_egress
};

// Free tier pricing is always based on Tier 1 prices
export const V1_FREE_TIER = {
  invocations: 2_000_000,
  memoryGb: 400_000,
  cpuGhz: 200_000,
  egress: 5,
};

export const V2_FREE_TIER = {
  invocations: 2_000_000,
  memoryGb: 360_000,
  vCpu: 180_000,
  // Pricing is within north-america
  egress: 1,
};

// In v1, CPU is automatically fixed to the memory size determines the CPU size.
// Table at https://cloud.google.com/functions/pricing#compute_time
const VCPU_TO_GHZ = 2.4;
const MB_TO_GHZ = {
  128: 0.2,
  256: 0.4,
  512: 0.8,
  1024: 1.4,
  2048: 1 * VCPU_TO_GHZ,
  4096: 2 * VCPU_TO_GHZ,
  8192: 2 * VCPU_TO_GHZ,
  16384: 4 * VCPU_TO_GHZ,
  32768: 8 * VCPU_TO_GHZ,
};

/** Whether we have information in our price sheet to calculate the minInstance cost. */
export function canCalculateMinInstanceCost(endpoint: backend.Endpoint): boolean {
  if (!endpoint.minInstances) {
    return true;
  }

  if (endpoint.platform === "gcfv1") {
    if (!MB_TO_GHZ[endpoint.availableMemoryMb || 256]) {
      return false;
    }

    if (!V1_REGION_TO_TIER[endpoint.region]) {
      return false;
    }

    return true;
  }

  if (!V2_REGION_TO_TIER[endpoint.region]) {
    return false;
  }

  return true;
}

// A hypothetical month has 30d. ALWAYS PRINT THIS ASSUMPTION when printing
// a cost estimate.
const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;

/** The cost of a series of endpoints at 100% idle in a 30d month. */
export function monthlyMinInstanceCost(endpoints: backend.Endpoint[]): number {
  // Assertion: canCalculateMinInstanceCost
  type Usage = {
    ram: number;
    cpu: number;
  };
  const usage: Record<backend.FunctionsPlatform, Record<tier, Usage>> = {
    gcfv1: { 1: { ram: 0, cpu: 0 }, 2: { ram: 0, cpu: 0 } },
    gcfv2: { 1: { ram: 0, cpu: 0 }, 2: { ram: 0, cpu: 0 } },
  };

  for (const endpoint of endpoints) {
    if (!endpoint.minInstances) {
      continue;
    }

    const ramMb = endpoint.availableMemoryMb || 256;
    const ramGb = ramMb / 1024;
    if (endpoint.platform === "gcfv1") {
      const cpu = MB_TO_GHZ[ramMb];
      const tier = V1_REGION_TO_TIER[endpoint.region];
      usage["gcfv1"][tier].ram =
        usage["gcfv1"][tier].ram + ramGb * SECONDS_PER_MONTH * endpoint.minInstances;
      usage["gcfv1"][tier].cpu =
        usage["gcfv1"][tier].cpu + cpu * SECONDS_PER_MONTH * endpoint.minInstances;
    } else {
      // V2 is currently fixed at 1vCPU.
      const cpu = 1;
      const tier = V2_REGION_TO_TIER[endpoint.region];
      usage["gcfv2"][tier].ram =
        usage["gcfv2"][tier].ram + ramGb * SECONDS_PER_MONTH * endpoint.minInstances;
      usage["gcfv2"][tier].cpu =
        usage["gcfv2"][tier].cpu + cpu * SECONDS_PER_MONTH * endpoint.minInstances;
    }
  }

  // The free tier doesn't work like "your first $5 are free". Instead it's a per-resource quota
  // that is given free _at the equivalent price of a tier-1 region_.
  let v1MemoryBill =
    usage["gcfv1"][1].ram * V1_RATES.memoryGb[1] + usage["gcfv1"][2].ram * V1_RATES.memoryGb[2];
  v1MemoryBill -= V1_FREE_TIER.memoryGb * V1_RATES.memoryGb[1];
  v1MemoryBill = Math.max(v1MemoryBill, 0);

  let v1CpuBill =
    usage["gcfv1"][1].cpu * V1_RATES.idleCpuGhz[1] + usage["gcfv1"][2].cpu * V1_RATES.idleCpuGhz[2];
  v1CpuBill -= V1_FREE_TIER.cpuGhz * V1_RATES.cpuGhz[1];
  v1CpuBill = Math.max(v1CpuBill, 0);

  let v2MemoryBill =
    usage["gcfv2"][1].ram * V2_RATES.memoryGb[1] + usage["gcfv2"][2].ram * V2_RATES.memoryGb[2];
  v2MemoryBill -= V2_FREE_TIER.memoryGb * V2_RATES.memoryGb[1];
  v2MemoryBill = Math.max(v2MemoryBill, 0);

  let v2CpuBill =
    usage["gcfv2"][1].cpu * V2_RATES.idleVCpu[1] + usage["gcfv2"][2].cpu * V2_RATES.idleVCpu[2];
  v2CpuBill -= V2_FREE_TIER.vCpu * V2_RATES.vCpu[1];
  v2CpuBill = Math.max(v2CpuBill, 0);

  return v1MemoryBill + v1CpuBill + v2MemoryBill + v2CpuBill;
}
