import { expect } from "chai";
import { Endpoint } from "../../../../deploy/functions/backend";
import * as firebaseAlerts from "../../../../deploy/functions/services/firebaseAlerts";
import * as getProjectNumber from "../../../../getProjectNumber";
import * as sinon from "sinon";

describe("obtainFirebaseAlertsBindings", () => {
  let projectNumberStub: sinon.SinonStub;

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

  beforeEach(() => {
    projectNumberStub = sinon.stub(getProjectNumber, "getProjectNumber").resolves("123456789");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should add the binding", async () => {
    const policy = { ...iamPolicy };

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings("project", policy);

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

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings("project", policy);

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

    const bindings = await firebaseAlerts.obtainFirebaseAlertsBindings("project", policy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: firebaseAlerts.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
      members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
    });
  });
});

describe("ensureFirebaseAlertsTriggerRegion", () => {
  const endpoint: Endpoint = {
    id: "endpoint",
    region: "us-central1",
    project: "my-project",
    eventTrigger: {
      retry: false,
      eventType: "firebase.firebasealerts.alerts.v1.published",
      eventFilters: [],
    },
    entryPoint: "",
    platform: "gcfv2",
    runtime: "nodejs16",
  };
  it("should set the trigger location to global", () => {
    const ep = { ...endpoint };

    firebaseAlerts.ensureFirebaseAlertsTriggerRegion(ep);

    expect(endpoint.eventTrigger.region).to.eq("global");
  });

  it("should not error if the trigger location is global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "global";

    firebaseAlerts.ensureFirebaseAlertsTriggerRegion(endpoint);

    expect(endpoint.eventTrigger.region).to.eq("global");
  });

  it("should error if the trigger location is not global", () => {
    const ep = { ...endpoint };
    ep.eventTrigger.region = "us-west1";

    expect(() => firebaseAlerts.ensureFirebaseAlertsTriggerRegion(endpoint)).to.throw(
      "A firebase alerts function must have a 'global' trigger location"
    );
  });
});
