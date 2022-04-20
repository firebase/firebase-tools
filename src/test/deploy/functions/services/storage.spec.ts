import { expect } from "chai";
import * as sinon from "sinon";
import { obtainStorageBindings } from "../../../../deploy/functions/services/storage";
import * as storage from "../../../../gcp/storage";

const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
};

const BINDING = {
  role: "some/role",
  members: ["someuser"],
};

describe("obtainStorageBindings", () => {
  let storageStub: sinon.SinonStub;

  beforeEach(() => {
    storageStub = sinon
      .stub(storage, "getServiceAccount")
      .throws("unexpected call to storage.getServiceAccount");
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should return pubsub binding when missing from the policy", async () => {
    storageStub.resolves(STORAGE_RES);
    const existingPolicy = {
      etag: "etag",
      version: 3,
      bindings: [BINDING],
    };

    const bindings = await obtainStorageBindings(projectNumber, existingPolicy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: "roles/pubsub.publisher",
      members: [`serviceAccount:${STORAGE_RES.email_address}`],
    });
  });

  it("should return the updated pubsub binding from the policy", async () => {
    storageStub.resolves(STORAGE_RES);
    const existingPolicy = {
      etag: "etag",
      version: 3,
      bindings: [BINDING, { role: "roles/pubsub.publisher", members: ["someuser"] }],
    };

    const bindings = await obtainStorageBindings(projectNumber, existingPolicy);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: "roles/pubsub.publisher",
      members: ["someuser", `serviceAccount:${STORAGE_RES.email_address}`],
    });
  });

  it("should return the binding from policy if already present", async () => {
    storageStub.resolves(STORAGE_RES);
    const existingPolicy = {
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

    const bindings = await obtainStorageBindings(projectNumber, existingPolicy);
    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: "roles/pubsub.publisher",
      members: [`serviceAccount:${STORAGE_RES.email_address}`],
    });
  });
});
