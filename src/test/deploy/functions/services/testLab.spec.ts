import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as testLab from "../../../../deploy/functions/services/testLab";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.testlab.testMatrix.v1.completed",
    eventFilters: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureTestLabTriggerRegion", () => {
  it("should set the trigger location to global", async () => {
    const ep = { ...endpoint };

    await testLab.ensureTestLabTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "global";

    await testLab.ensureTestLabTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => testLab.ensureTestLabTriggerRegion(ep)).to.throw(
      "A Test Lab trigger must specify 'global' trigger location",
    );
  });
});
