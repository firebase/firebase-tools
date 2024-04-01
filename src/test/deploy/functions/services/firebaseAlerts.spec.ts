import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as firebaseAlerts from "../../../../deploy/functions/services/firebaseAlerts";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "firebase.firebasealerts.alerts.v1.published",
    eventFilters: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureFirebaseAlertsTriggerRegion", () => {
  it("should set the trigger location to global", async () => {
    const ep = { ...endpoint };

    await firebaseAlerts.ensureFirebaseAlertsTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "global";

    await firebaseAlerts.ensureFirebaseAlertsTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => firebaseAlerts.ensureFirebaseAlertsTriggerRegion(ep)).to.throw(
      "A firebase alerts trigger must specify 'global' trigger location",
    );
  });
});
