import { expect } from "chai";
import * as sinon from "sinon";
import { obtainStorageBindings } from "./storage";
import * as storage from "../../../gcp/storage";

const projectNumber = "123456789";

const STORAGE_RES = {
  email_address: "service-123@gs-project-accounts.iam.gserviceaccount.com",
  kind: "storage#serviceAccount",
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

  it("should return the correct storage binding", async () => {
    storageStub.resolves(STORAGE_RES);

    const bindings = await obtainStorageBindings(projectNumber);

    expect(bindings.length).to.equal(1);
    expect(bindings[0]).to.deep.equal({
      role: "roles/pubsub.publisher",
      members: [`serviceAccount:${STORAGE_RES.email_address}`],
    });
  });
});
