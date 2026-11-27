import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "./backend";
import * as iam from "../../gcp/iam";
import { FirebaseError } from "../../error";
import {
  findManagedServiceAccount,
  managedServiceAccountDescription,
} from "./managedServiceAccount";

describe("managedServiceAccount", () => {
  const ENDPOINT: backend.Endpoint = {
    platform: "gcfv2",
    id: "fn",
    region: "us-central1",
    project: "project",
    entryPoint: "fn",
    runtime: "nodejs22",
    httpsTrigger: {},
  };
  const OWN = "firebase-fn-111@project.iam.gserviceaccount.com";
  const OTHER = "firebase-fn-222@project.iam.gserviceaccount.com";

  let getServiceAccountStub: sinon.SinonStub;

  beforeEach(() => {
    getServiceAccountStub = sinon.stub(iam, "getServiceAccount");
    getServiceAccountStub
      .withArgs("project", OWN)
      .resolves({ description: managedServiceAccountDescription("mine") } as iam.ServiceAccount);
    getServiceAccountStub
      .withArgs("project", OTHER)
      .resolves({ description: managedServiceAccountDescription("theirs") } as iam.ServiceAccount);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("returns undefined without looking anything up when no function uses a managed account", async () => {
    const have = backend.of({
      ...ENDPOINT,
      serviceAccount: "custom@project.iam.gserviceaccount.com",
    });

    expect(await findManagedServiceAccount("project", "mine", have)).to.be.undefined;
    expect(getServiceAccountStub).to.not.have.been.called;
  });

  it("returns the account whose description names the codebase", async () => {
    const have = backend.of(
      { ...ENDPOINT, id: "a", serviceAccount: OTHER },
      { ...ENDPOINT, id: "b", serviceAccount: OWN },
    );

    expect(await findManagedServiceAccount("project", "mine", have)).to.deep.equal({
      email: OWN,
      owner: "codebase",
    });
  });

  it("ignores an account that another codebase manages", async () => {
    const have = backend.of({ ...ENDPOINT, serviceAccount: OTHER });

    expect(await findManagedServiceAccount("project", "mine", have)).to.be.undefined;
  });

  it("ignores an account that no longer exists", async () => {
    getServiceAccountStub
      .withArgs("project", OWN)
      .rejects(new FirebaseError("Not found", { status: 404 }));
    const have = backend.of({ ...ENDPOINT, serviceAccount: OWN });

    expect(await findManagedServiceAccount("project", "mine", have)).to.be.undefined;
  });

  it("returns an unknown owner when the account can't be read", async () => {
    getServiceAccountStub
      .withArgs("project", OWN)
      .rejects(new FirebaseError("Permission denied", { status: 403 }));
    const have = backend.of({ ...ENDPOINT, serviceAccount: OWN });

    expect(await findManagedServiceAccount("project", "mine", have)).to.deep.equal({
      email: OWN,
      owner: "unknown",
    });
  });
});
