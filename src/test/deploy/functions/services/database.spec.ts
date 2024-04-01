import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as database from "../../../../deploy/functions/services/database";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.database.ref.v1.written",
    eventFilters: {},
    eventFilterPathPatterns: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureDatabaseTriggerRegion", () => {
  it("should set the trigger location to the function region", async () => {
    const ep = { ...endpoint };

    await database.ensureDatabaseTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("us-central1");
  });

  it("should not error if the trigger location is already set correctly", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-central1";

    await database.ensureDatabaseTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("us-central1");
  });

  it("should error if the trigger location is set incorrectly", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => database.ensureDatabaseTriggerRegion(ep)).to.throw(
      "A database trigger location must match the function region.",
    );
  });
});
