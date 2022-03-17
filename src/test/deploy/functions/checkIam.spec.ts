import { expect } from "chai";
import * as sinon from "sinon";
import * as checkIam from "../../../deploy/functions/checkIam";
import * as storage from "../../../gcp/storage";
import * as rm from "../../../gcp/resourceManager";
import * as backend from "../../../deploy/functions/backend";

const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

const BINDING = {
  role: "some/role",
  members: ["someuser"],
};

const SPEC = {
  region: "us-west1",
  project: projectNumber,
  runtime: "nodejs14",
};

const iamPolicy = {
  etag: "etag",
  version: 3,
  bindings: [BINDING],
};

describe("checkIam", () => {
  let storageStub: sinon.SinonStub;
  let getIamStub: sinon.SinonStub;
  let setIamStub: sinon.SinonStub;

  beforeEach(() => {
    storageStub = sinon
      .stub(storage, "getServiceAccount")
      .throws("unexpected call to storage.getServiceAccount");
    getIamStub = sinon
      .stub(rm, "getIamPolicy")
      .throws("unexpected call to resourceManager.getIamStub");
    setIamStub = sinon
      .stub(rm, "setIamPolicy")
      .throws("unexpected call to resourceManager.setIamPolicy");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

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

  describe("obtainBinding", () => {
    it("should add the binding", () => {
      const policy = { ...iamPolicy };
      const serviceAccount = "myServiceAccount";
      const role = "role/myrole";

      const bindings = checkIam.obtainBinding(policy, serviceAccount, role);

      expect(bindings).to.deep.equal({
        role,
        members: [serviceAccount],
      });
    });

    it("should add the service agent as a member", () => {
      const policy = { ...iamPolicy };
      const serviceAccount = "myServiceAccount";
      const role = "role/myrole";
      policy.bindings = [
        {
          role,
          members: ["someuser"],
        },
      ];

      const bindings = checkIam.obtainBinding(policy, serviceAccount, role);

      expect(bindings).to.deep.equal({
        role,
        members: ["someuser", serviceAccount],
      });
    });

    it("should do nothing if we have the binding", () => {
      const policy = { ...iamPolicy };
      const serviceAccount = "myServiceAccount";
      const role = "role/myrole";
      policy.bindings = [
        {
          role,
          members: [serviceAccount],
        },
      ];

      const bindings = checkIam.obtainBinding(policy, serviceAccount, role);

      expect(bindings).to.deep.equal({
        role,
        members: [serviceAccount],
      });
    });
  });

  describe("obtainPubSubServiceAgentBindings", () => {
    it("should add the binding", () => {
      const policy = { ...iamPolicy };

      const bindings = checkIam.obtainPubSubServiceAgentBindings(projectNumber, policy);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
      });
    });

    it("should add the service agent as a member", () => {
      const policy = { ...iamPolicy };
      policy.bindings = [
        {
          role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
          members: ["someuser"],
        },
      ];

      const bindings = checkIam.obtainPubSubServiceAgentBindings(projectNumber, policy);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: [
          "someuser",
          "serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com",
        ],
      });
    });

    it("should do nothing if we have the binding", () => {
      const policy = { ...iamPolicy };
      policy.bindings = [
        {
          role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
          members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
        },
      ];

      const bindings = checkIam.obtainPubSubServiceAgentBindings(projectNumber, policy);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
        members: ["serviceAccount:service-123456789@gcp-sa-pubsub.iam.gserviceaccount.com"],
      });
    });
  });

  describe("obtainDefaultComputeServiceAgentBindings", () => {
    it("should add both bindings", () => {
      const policy = { ...iamPolicy };

      const bindings = checkIam.obtainDefaultComputeServiceAgentBindings(projectNumber, policy);

      expect(bindings.length).to.equal(2);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.RUN_INVOKER_ROLE,
        members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
      });
      expect(bindings[1]).to.deep.equal({
        role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
        members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
      });
    });
  });

  describe("obtainEventarcServiceAgentBindings", () => {
    it("should add the binding", () => {
      const policy = { ...iamPolicy };

      const bindings = checkIam.obtainEventarcServiceAgentBindings(projectNumber, policy);

      expect(bindings.length).to.equal(1);
      expect(bindings[0]).to.deep.equal({
        role: checkIam.EVENTARC_SERVICE_AGENT_ROLE,
        members: [
          `serviceAccount:service-${projectNumber}@gcp-sa-eventarc.iam.gserviceaccount.com`,
        ],
      });
    });
  });

  describe("mergeBindings", () => {
    it("should skip empty or duplicate bindings", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      checkIam.mergeBindings(policy, [[], [BINDING]]);

      expect(policy.bindings).to.deep.equal([BINDING]);
    });

    it("should update current binding", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      };

      checkIam.mergeBindings(policy, [[{ role: "some/role", members: ["newuser"] }]]);

      expect(policy.bindings).to.deep.equal([
        {
          role: "some/role",
          members: ["someuser", "newuser"],
        },
      ]);
    });

    it("should add the binding", () => {
      const policy = {
        etag: "etag",
        version: 3,
        bindings: [],
      };

      checkIam.mergeBindings(policy, [[BINDING]]);

      expect(policy.bindings).to.deep.equal([BINDING]);
    });
  });

  describe("ensureServiceAgentRoles", () => {
    it("should return early if we fail to get the IAM policy", async () => {
      getIamStub.rejects("Failed to get the IAM policy");
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: [
            {
              attribute: "bucket",
              value: "my-bucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };

      await expect(
        checkIam.ensureServiceAgentRoles(projectNumber, backend.of(wantFn), backend.empty())
      ).to.not.be.rejected;
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith(projectNumber);
      expect(storageStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should skip v1, callable, and deployed functions", async () => {
      const v1EventFn: backend.Endpoint = {
        id: "v1eventfn",
        entryPoint: "v1Fn",
        platform: "gcfv1",
        eventTrigger: {
          eventType: "google.storage.object.create",
          eventFilters: [
            {
              attribute: "resource",
              value: "projects/_/buckets/myBucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };
      const v2CallableFn: backend.Endpoint = {
        id: "v2callablefn",
        entryPoint: "v2callablefn",
        platform: "gcfv2",
        httpsTrigger: {},
        ...SPEC,
      };
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: [
            {
              attribute: "bucket",
              value: "my-bucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(
        projectNumber,
        backend.of(wantFn),
        backend.of(v1EventFn, v2CallableFn, wantFn)
      );

      expect(storageStub).to.not.have.been.called;
      expect(getIamStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should skip if we have a deployed event fn of the same kind", async () => {
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: [
            {
              attribute: "bucket",
              value: "my-bucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };
      const haveFn: backend.Endpoint = {
        id: "haveFn",
        entryPoint: "haveFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.metadataUpdated",
          eventFilters: [
            {
              attribute: "bucket",
              value: "my-bucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(projectNumber, backend.of(wantFn), backend.of(haveFn));

      expect(storageStub).to.not.have.been.called;
      expect(getIamStub).to.not.have.been.called;
      expect(setIamStub).to.not.have.been.called;
    });

    it("should add the binding with the service agent", async () => {
      const newIamPolicy = {
        etag: "etag",
        version: 3,
        bindings: [
          BINDING,
          {
            role: "roles/pubsub.publisher",
            members: [`serviceAccount:${STORAGE_RES.email_address}`],
          },
          {
            role: checkIam.SERVICE_ACCOUNT_TOKEN_CREATOR_ROLE,
            members: [
              `serviceAccount:service-${projectNumber}@gcp-sa-pubsub.iam.gserviceaccount.com`,
            ],
          },
          {
            role: checkIam.RUN_INVOKER_ROLE,
            members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
          },
          {
            role: checkIam.EVENTARC_EVENT_RECEIVER_ROLE,
            members: [`serviceAccount:${projectNumber}-compute@developer.gserviceaccount.com`],
          },
          {
            role: checkIam.EVENTARC_SERVICE_AGENT_ROLE,
            members: [
              `serviceAccount:service-${projectNumber}@gcp-sa-eventarc.iam.gserviceaccount.com`,
            ],
          },
        ],
      };
      storageStub.resolves(STORAGE_RES);
      getIamStub.resolves({
        etag: "etag",
        version: 3,
        bindings: [BINDING],
      });
      setIamStub.resolves(newIamPolicy);
      const wantFn: backend.Endpoint = {
        id: "wantFn",
        entryPoint: "wantFn",
        platform: "gcfv2",
        eventTrigger: {
          eventType: "google.cloud.storage.object.v1.finalized",
          eventFilters: [
            {
              attribute: "bucket",
              value: "my-bucket",
            },
          ],
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(projectNumber, backend.of(wantFn), backend.empty());

      expect(storageStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledWith(projectNumber, newIamPolicy, "bindings");
    });
  });
});
