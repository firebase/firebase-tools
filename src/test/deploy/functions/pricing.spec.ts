import { expect } from "chai";

import * as backend from "../../../deploy/functions/backend";
import * as pricing from "../../../deploy/functions/pricing";

// N.B. I'm not sure why, but if I don't add back backend.HttpsTriggered
// then I can't add the trigger to the Omit<>, which means it can't be
// passed to test methods.
const ENDPOINT_FRAGMENT: Omit<backend.Endpoint, "platform" | "region"> & backend.HttpsTriggered = {
  id: "function",
  project: "project",
  entryPoint: "foobar",
  runtime: "nodejs16",
  httpsTrigger: {},
};

const INVALID_REGION = { region: "fillory" };
describe("Functions Pricing", () => {
  describe("canCalculateMinInstanceCost", () => {
    it("Can calculate the $0 cost of a function without min instances", () => {
      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
        }),
      ).to.be.true;

      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          ...INVALID_REGION,
        }),
      ).to.be.true;
    });

    it("Can calculate the cost of a well formed v1 function", () => {
      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 10,
        }),
      ).to.be.true;
    });

    it("Can calculate the cost of a well formed v2 function", () => {
      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          region: "us-central1",
          minInstances: 10,
        }),
      ).to.be.true;
    });

    it("Cannot calculate the cost of an unknown instance size", () => {
      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 10,
          availableMemoryMb: 0xdeadbeef as backend.MemoryOptions,
        }),
      ).to.be.false;
    });

    it("Cannot calculate the cost for an unknown region", () => {
      expect(
        pricing.canCalculateMinInstanceCost({
          ...ENDPOINT_FRAGMENT,
          ...INVALID_REGION,
          platform: "gcfv1",
          minInstances: 10,
        }),
      ).to.be.false;
    });
  });

  describe("monthlyMinInstanceCost", () => {
    const SECONDS_PER_MONTH = 60 * 60 * 24 * 30;

    const v1CostAfterDiscounts = (ramCost: number, cpuCost: number): number => {
      ramCost = Math.max(ramCost - pricing.V1_FREE_TIER.memoryGb * pricing.V1_RATES.memoryGb[1], 0);
      cpuCost = Math.max(cpuCost - pricing.V1_FREE_TIER.cpuGhz * pricing.V1_RATES.cpuGhz[1], 0);
      return ramCost + cpuCost;
    };

    const v2CostAfterDiscounts = (ramCost: number, cpuCost: number): number => {
      ramCost = Math.max(ramCost - pricing.V2_FREE_TIER.memoryGb * pricing.V2_RATES.memoryGb[1], 0);
      cpuCost = Math.max(cpuCost - pricing.V2_FREE_TIER.vCpu * pricing.V2_RATES.vCpu[1], 0);
      return ramCost + cpuCost;
    };

    it("can calculate a v1 tier1 bill", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 1,
          availableMemoryMb: 256,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[1] * 0.25 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[1] * 0.4 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("doesn't estimate bills for unreserved instances", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 1,
          availableMemoryMb: 256,
        },
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 0,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[1] * 0.25 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[1] * 0.4 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a bill for a two reserved instances", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 2,
          availableMemoryMb: 256,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[1] * 0.25 * 2 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[1] * 0.4 * 2 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("Can calculate a v1 tier1 bill for a two reserved instance between two functions", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 1,
          availableMemoryMb: 256,
        },
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 1,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[1] * 0.25 * 2 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[1] * 0.4 * 2 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a v1 tier2 bill", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "europe-west3",
          minInstances: 1,
          availableMemoryMb: 256,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[2] * 0.25 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[2] * 0.4 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a v1 bill for large instances", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "europe-west3",
          minInstances: 1,
          availableMemoryMb: 8192,
        },
      ]);

      const ramCost = pricing.V1_RATES.memoryGb[2] * 8 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V1_RATES.idleCpuGhz[2] * 4.8 * SECONDS_PER_MONTH;
      const expected = v1CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a v2 tier1 bill", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          region: "us-central1",
          minInstances: 1,
          availableMemoryMb: 256,
          cpu: 1,
        },
      ]);

      const ramCost = pricing.V2_RATES.memoryGb[1] * 0.25 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V2_RATES.idleVCpu[1] * SECONDS_PER_MONTH;
      const expected = v2CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a v2 tier2 bill", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          region: "europe-west3",
          minInstances: 1,
          availableMemoryMb: 256,
          cpu: 1,
        },
      ]);

      const ramCost = pricing.V2_RATES.memoryGb[2] * 0.25 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V2_RATES.idleVCpu[2] * SECONDS_PER_MONTH;
      const expected = v2CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("can calculate a v2 bill for large instances", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          region: "europe-west3",
          minInstances: 1,
          availableMemoryMb: 4096,
          cpu: 2,
        },
      ]);

      const ramCost = pricing.V2_RATES.memoryGb[2] * 4 * SECONDS_PER_MONTH;
      const cpuCost = pricing.V2_RATES.idleVCpu[2] * 2 * SECONDS_PER_MONTH;
      const expected = v2CostAfterDiscounts(ramCost, cpuCost);

      expect(cost).to.equal(expected);
    });

    it("calculates v1 and v2 discounts separately", () => {
      const cost = pricing.monthlyMinInstanceCost([
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv1",
          region: "us-central1",
          minInstances: 1,
        },
        {
          ...ENDPOINT_FRAGMENT,
          platform: "gcfv2",
          region: "us-central1",
          minInstances: 1,
          cpu: 1,
        },
      ]);

      const v1RamCost = pricing.V1_RATES.memoryGb[1] * 0.25 * SECONDS_PER_MONTH;
      const v1CpuCost = pricing.V1_RATES.idleCpuGhz[1] * 0.4 * SECONDS_PER_MONTH;
      const v2RamCost = pricing.V2_RATES.memoryGb[1] * 0.25 * SECONDS_PER_MONTH;
      const v2CpuCost = pricing.V2_RATES.idleVCpu[1] * SECONDS_PER_MONTH;
      const expected =
        v1CostAfterDiscounts(v1RamCost, v1CpuCost) + v2CostAfterDiscounts(v2RamCost, v2CpuCost);

      expect(cost).to.equal(expected);
    });
  });
});
