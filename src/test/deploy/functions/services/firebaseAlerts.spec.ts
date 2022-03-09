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
    eventFilters: [],
  },
  entryPoint: "endpoint",
  platform: "gcfv2",
  runtime: "nodejs16",
};

describe("obtainFirebaseAlertsBindings", () => {
  const iamPolicy = {
    etag: "etag",
    version: 3,
    bindings: [
      {
        role: "some/role",
        members: ["someuser"],
      },
    ],
  };

  it("should add the binding", async () => {
    const policy = { ...iamPolicy };

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings(projectNumber, policy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
      members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
    });
  });

  it("should add the service agent as a member", async () => {
    const policy = { ...iamPolicy };
    policy.bindings = [
      {
        role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: ["someuser"],
      },
    ];

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings(projectNumber, policy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
      members: [
        "someuser",
        "serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com",
      ],
    });
  });

  it("should do nothing if we have the binding", async () => {
    const policy = { ...iamPolicy };
    policy.bindings = [
      {
        role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
      },
    ];

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings(projectNumber, policy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
      members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
    });
  });
});

describe("ensureFirebaseAlertsTriggerRegion", () => {
  it("should set the trigger location to global", async () => {
    const ep = { ...endpoint };

    await firebaseAlerts.ensureFirebaseAlertsTriggerRegion(ep);

    expect(endpoint.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", async () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "global";

    await firebaseAlerts.ensureFirebaseAlertsTriggerRegion(endpoint);

    expect(endpoint.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => firebaseAlerts.ensureFirebaseAlertsTriggerRegion(endpoint)).to.throw(
      "A firebase alerts trigger must specify 'global' trigger location"
    );
  });
});
