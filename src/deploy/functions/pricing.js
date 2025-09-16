"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.monthlyMinInstanceCost = exports.canCalculateMinInstanceCost = exports.V2_FREE_TIER = exports.V1_FREE_TIER = exports.V2_RATES = exports.V1_RATES = void 0;
const backend = __importStar(require("./backend"));
const V1_REGION_TO_TIER = {
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
const V2_REGION_TO_TIER = {
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
exports.V1_RATES = {
    invocations: 4e-7,
    memoryGb: {
        1: 0.0000025,
        2: 0.0000035,
    },
    cpuGhz: {
        1: 0.00001,
        2: 0.000014,
    },
    idleCpuGhz: {
        1: 0.000001,
        2: 0.00000145,
    },
    egress: 0.12,
};
// NOTE: Cloud Run supports committed use discounts (https://cloud.google.com/run/pricing)
// Any UX that displays this pricing should also mention the CUD.
exports.V2_RATES = {
    invocations: 4e-7,
    memoryGb: {
        1: 0.0000025,
        2: 0.0000035,
    },
    vCpu: {
        1: 0.000024,
        2: 0.0000336,
    },
    idleVCpu: {
        1: 0.0000025,
        2: 0.0000035,
    },
    // This is much more complicated than V1. There's a full table at
    // https://cloud.google.com/vpc/network-pricing#internet_egress
};
// Free tier pricing is always based on Tier 1 prices
exports.V1_FREE_TIER = {
    invocations: 2000000,
    memoryGb: 400000,
    cpuGhz: 200000,
    egress: 5,
};
exports.V2_FREE_TIER = {
    invocations: 2000000,
    memoryGb: 360000,
    vCpu: 180000,
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
function canCalculateMinInstanceCost(endpoint) {
    if (endpoint.minInstances === undefined || endpoint.minInstances === null) {
        return true;
    }
    if (endpoint.platform === "gcfv1") {
        if (!MB_TO_GHZ[endpoint.availableMemoryMb || backend.DEFAULT_MEMORY]) {
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
exports.canCalculateMinInstanceCost = canCalculateMinInstanceCost;
// A hypothetical month has 30d. ALWAYS PRINT THIS ASSUMPTION when printing
// a cost estimate.
const SECONDS_PER_MONTH = 30 * 24 * 60 * 60;
/** The cost of a series of endpoints at 100% idle in a 30d month. */
// BUG BUG BUG!
// This method incorrectly gives a disjoint free tier for GCF v1 and GCF v2 which
// was broken and never fixed when GCF decided to vendor Run usage as the GCF SKU.
// It should be a single free tier that applies to both. This will soon be wrong
// in a _different_ way when GCF v2 un-vendors the SKU and instead v2 and Run should
// share a free tier.
function monthlyMinInstanceCost(endpoints) {
    const usage = {
        gcfv1: { 1: { ram: 0, cpu: 0 }, 2: { ram: 0, cpu: 0 } },
        gcfv2: { 1: { ram: 0, cpu: 0 }, 2: { ram: 0, cpu: 0 } },
        run: { 1: { ram: 0, cpu: 0 }, 2: { ram: 0, cpu: 0 } },
    };
    for (const endpoint of endpoints) {
        if (endpoint.minInstances === undefined || endpoint.minInstances === null) {
            continue;
        }
        const ramMb = endpoint.availableMemoryMb || backend.DEFAULT_MEMORY;
        const ramGb = ramMb / 1024;
        if (endpoint.platform === "gcfv1") {
            const cpu = MB_TO_GHZ[ramMb];
            const tier = V1_REGION_TO_TIER[endpoint.region];
            usage["gcfv1"][tier].ram =
                usage["gcfv1"][tier].ram + ramGb * SECONDS_PER_MONTH * endpoint.minInstances;
            usage["gcfv1"][tier].cpu =
                usage["gcfv1"][tier].cpu + cpu * SECONDS_PER_MONTH * endpoint.minInstances;
        }
        else {
            // V2 is currently fixed at 1vCPU.
            const tier = V2_REGION_TO_TIER[endpoint.region];
            usage[endpoint.platform][tier].ram =
                usage[endpoint.platform][tier].ram + ramGb * SECONDS_PER_MONTH * endpoint.minInstances;
            usage[endpoint.platform][tier].cpu =
                usage[endpoint.platform][tier].cpu +
                    endpoint.cpu * SECONDS_PER_MONTH * endpoint.minInstances;
        }
    }
    // The free tier doesn't work like "your first $5 are free". Instead it's a per-resource quota
    // that is given free _at the equivalent price of a tier-1 region_.
    let v1MemoryBill = usage["gcfv1"][1].ram * exports.V1_RATES.memoryGb[1] + usage["gcfv1"][2].ram * exports.V1_RATES.memoryGb[2];
    v1MemoryBill -= exports.V1_FREE_TIER.memoryGb * exports.V1_RATES.memoryGb[1];
    v1MemoryBill = Math.max(v1MemoryBill, 0);
    let v1CpuBill = usage["gcfv1"][1].cpu * exports.V1_RATES.idleCpuGhz[1] + usage["gcfv1"][2].cpu * exports.V1_RATES.idleCpuGhz[2];
    v1CpuBill -= exports.V1_FREE_TIER.cpuGhz * exports.V1_RATES.cpuGhz[1];
    v1CpuBill = Math.max(v1CpuBill, 0);
    let v2MemoryBill = usage["gcfv2"][1].ram * exports.V2_RATES.memoryGb[1] + usage["gcfv2"][2].ram * exports.V2_RATES.memoryGb[2];
    v2MemoryBill -= exports.V2_FREE_TIER.memoryGb * exports.V2_RATES.memoryGb[1];
    v2MemoryBill = Math.max(v2MemoryBill, 0);
    let v2CpuBill = usage["gcfv2"][1].cpu * exports.V2_RATES.idleVCpu[1] + usage["gcfv2"][2].cpu * exports.V2_RATES.idleVCpu[2];
    v2CpuBill -= exports.V2_FREE_TIER.vCpu * exports.V2_RATES.vCpu[1];
    v2CpuBill = Math.max(v2CpuBill, 0);
    let runMemoryBill = usage["run"][1].ram * exports.V2_RATES.memoryGb[1] + usage["run"][2].ram * exports.V2_RATES.memoryGb[2];
    runMemoryBill -= exports.V2_FREE_TIER.memoryGb * exports.V2_RATES.memoryGb[1];
    runMemoryBill = Math.max(runMemoryBill, 0);
    let runCpuBill = usage["run"][1].cpu * exports.V2_RATES.idleVCpu[1] + usage["run"][2].cpu * exports.V2_RATES.idleVCpu[2];
    runCpuBill -= exports.V2_FREE_TIER.vCpu * exports.V2_RATES.vCpu[1];
    runCpuBill = Math.max(runCpuBill, 0);
    return v1MemoryBill + v1CpuBill + v2MemoryBill + v2CpuBill + runMemoryBill + runCpuBill;
}
exports.monthlyMinInstanceCost = monthlyMinInstanceCost;
//# sourceMappingURL=pricing.js.map