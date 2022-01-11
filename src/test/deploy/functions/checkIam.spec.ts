import { expect } from "chai";
import * as sinon from "sinon";
import * as checkIam from "../../../deploy/functions/checkIam";
import * as storage from "../../../gcp/storage";
import * as rm from "../../../gcp/resourceManager";
import * as backend from "../../../deploy/functions/backend";

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
  project: "my-project",
  runtime: "nodejs14",
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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await expect(checkIam.ensureServiceAgentRoles("project", backend.of(wantFn), backend.empty()))
        .to.not.be.rejected;
      expect(getIamStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledWith("project");
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
          eventFilters: {
            resource: "projects/_/buckets/myBucket",
          },
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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles(
        "project",
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
          eventFilters: {
            bucket: "my-bucket",
          },
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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles("project", backend.of(wantFn), backend.of(haveFn));

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
          eventFilters: {
            bucket: "my-bucket",
          },
          retry: false,
        },
        ...SPEC,
      };

      await checkIam.ensureServiceAgentRoles("project", backend.of(wantFn), backend.empty());

      expect(storageStub).to.have.been.calledOnce;
      expect(getIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledOnce;
      expect(setIamStub).to.have.been.calledWith("project", newIamPolicy, "bindings");
    });
  });
});
