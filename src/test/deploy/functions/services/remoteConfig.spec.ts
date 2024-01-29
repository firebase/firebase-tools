import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as remoteConfig from "../../../../deploy/functions/services/remoteConfig";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.remoteconfig.remoteConfig.v1.updated",
    eventFilters: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureRemoteConfigTriggerRegion", () => {
  it("should set the trigger location to global", async () => {
    const ep = { ...endpoint };

    await remoteConfig.ensureRemoteConfigTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "global";

    await remoteConfig.ensureRemoteConfigTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => remoteConfig.ensureRemoteConfigTriggerRegion(ep)).to.throw(
      "A remote config trigger must specify 'global' trigger location",
    );
  });
});
