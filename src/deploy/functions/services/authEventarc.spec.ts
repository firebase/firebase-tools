import { expect } from "chai";
import { Endpoint } from "../backend";
import * as authEventarc from "./authEventarc";

const projectNumber = "123456789";

const endpoint: Endpoint = {
  id: "endpoint",
  region: "us-central1",
  project: projectNumber,
  eventTrigger: {
    retry: false,
    eventType: "google.firebase.auth.user.v2.created",
    eventFilters: {},
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("ensureAuthEventarcTriggerRegion", () => {
  it("should set the trigger location to global", async () => {
    const ep = { ...endpoint, eventTrigger: { ...endpoint.eventTrigger } };

    await authEventarc.ensureAuthEventarcTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", async () => {
    const ep = { ...endpoint, eventTrigger: { ...endpoint.eventTrigger } };
    ep.eventTrigger.region = "global";

    await authEventarc.ensureAuthEventarcTriggerRegion(ep);

    expect(ep.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint, eventTrigger: { ...endpoint.eventTrigger } };
    ep.eventTrigger.region = "us-west1";

    expect(() => authEventarc.ensureAuthEventarcTriggerRegion(ep)).to.throw(
      "A Firebase Auth Eventarc trigger must specify 'global' trigger location",
    );
  });
});
