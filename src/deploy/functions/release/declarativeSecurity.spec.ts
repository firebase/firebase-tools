import { expect } from "chai";
import * as sinon from "sinon";
import * as backend from "../backend";
import * as prompt from "../../../prompt";
import * as iam from "../../../gcp/iam";
import * as resourcemanager from "../../../gcp/resourceManager";
import { createSecurityPlan } from "./declarativeSecurity";
import { FirebaseError } from "../../../error";

describe("createSecurityPlan", () => {
  let confirmStub: sinon.SinonStub;
  let getServiceAccountRolesStub: sinon.SinonStub;

  beforeEach(() => {
    confirmStub = sinon.stub(prompt, "confirm");
    sinon.stub(iam, "testIamPermissions").resolves({ passed: true } as any);
    getServiceAccountRolesStub = sinon.stub(resourcemanager, "getServiceAccountRoles").resolves([]);
    sinon.stub(iam, "generateManagedServiceAccountName").resolves("firebase-fn-1234567890");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should return undefined if no requiredRoles and no existing declarative security", async () => {
    const want = backend.empty();
    const have = backend.empty();

    const plan = await createSecurityPlan("my-codebase", want, have, "my-project");
    expect(plan).to.be.undefined;
  });

  it("should throw if combining explicit custom SA and declarative security", async () => {
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
      serviceAccount: "my-custom-sa@google.com",
    } as any);
    want.requiredRoles = ["roles/bigquery.dataEditor"];
    const have = backend.empty();

    await expect(createSecurityPlan("my-codebase", want, have, "my-project")).to.be.rejectedWith(
      FirebaseError,
      "Cannot use explicit custom service accounts on functions while using declarative security",
    );
  });

  it("should present new codebase prompt and plan SA creation if no existing managed SA", async () => {
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
    } as any);
    want.requiredRoles = ["roles/bigquery.dataEditor"];
    const have = backend.empty();

    confirmStub.resolves(true);

    const plan = await createSecurityPlan("my-codebase", want, have, "my-project");

    expect(confirmStub).to.have.been.calledOnce;
    expect(confirmStub.firstCall.args[0].message).to.include(
      "This codebase uses declarative security",
    );
    expect(confirmStub.firstCall.args[0].message).to.include("BigQuery Data Editor");

    expect(plan).to.deep.equal({
      codebase: "my-codebase",
      serviceAccount: "firebase-fn-1234567890@my-project.iam.gserviceaccount.com",
      saAction: "create",
      rolesToGrant: ["roles/bigquery.dataEditor"],
      rolesToRevoke: [],
    });
  });

  it("should cancel deploy if user rejects prompt", async () => {
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
    } as any);
    want.requiredRoles = ["roles/bigquery.dataEditor"];
    const have = backend.empty();

    confirmStub.resolves(false);

    await expect(createSecurityPlan("my-codebase", want, have, "my-project")).to.be.rejectedWith(
      FirebaseError,
      "Deployment canceled by user.",
    );
  });

  it("should present role modification prompt with diff if existing SA changes roles", async () => {
    const managedSA = "firebase-fn-1234567890@my-project.iam.gserviceaccount.com";
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
    } as any);
    want.requiredRoles = ["roles/bigquery.dataEditor", "roles/newRole"];

    const have = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
      codebase: "my-codebase",
      serviceAccount: managedSA,
      labels: { "firebase-declarative-roles-etag": "oldsalt-oldEtag" },
    } as any);

    getServiceAccountRolesStub.resolves(["roles/bigquery.dataEditor", "roles/oldRole"]);
    confirmStub.resolves(true);

    const plan = await createSecurityPlan("my-codebase", want, have, "my-project");

    expect(confirmStub).to.have.been.calledOnce;
    const message = confirmStub.firstCall.args[0].message;
    expect(message).to.include("granted the following new role(s):");
    expect(message).to.include("roles/newRole");
    expect(message).to.include("lose access to the following role(s):");
    expect(message).to.include("roles/oldRole");

    expect(plan).to.deep.equal({
      codebase: "my-codebase",
      serviceAccount: managedSA,
      saAction: "none",
      rolesToGrant: ["roles/newRole"],
      rolesToRevoke: ["roles/oldRole"],
    });
  });

  it("should skip prompting and execution entirely if etags match", async () => {
    const managedSA = "firebase-fn-1234567890@my-project.iam.gserviceaccount.com";
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
    } as any);
    want.requiredRoles = ["roles/bigquery.dataEditor"];

    const have = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
      codebase: "my-codebase",
      serviceAccount: managedSA,
      labels: {
        "firebase-declarative-roles-etag":
          "oldsalt-935dfa6e7090bb6ba52f75d5a7adfeec333919e1ed63f69fc5ec",
      },
    } as any);

    try {
      await createSecurityPlan("my-codebase", want, have, "my-project");
    } catch (e: any) {
      // Ignore expected abort
    }
    confirmStub.resetHistory();

    const correctEtag =
      want.endpoints["us-central1"]["func1"].labels?.["firebase-declarative-roles-etag"] || "";

    have.endpoints["us-central1"]["func1"].labels = {
      "firebase-declarative-roles-etag": correctEtag,
    };

    const plan = await createSecurityPlan("my-codebase", want, have, "my-project");

    expect(confirmStub).to.not.have.been.called;
    expect(plan).to.deep.equal({
      codebase: "my-codebase",
      serviceAccount: managedSA,
      saAction: "none",
      rolesToGrant: [],
      rolesToRevoke: [],
    });
  });

  it("should present opt-out prompt if haveBackend used declarative security but wantBackend does not", async () => {
    const managedSA = "firebase-fn-1234567890@my-project.iam.gserviceaccount.com";
    const want = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
    } as any);

    const have = backend.of({
      id: "func1",
      region: "us-central1",
      project: "my-project",
      entryPoint: "func1",
      platform: "gcfv2",
      codebase: "my-codebase",
      serviceAccount: managedSA,
      labels: { "firebase-declarative-roles-etag": "someEtag" },
    } as any);

    confirmStub.resolves(true);

    const plan = await createSecurityPlan("my-codebase", want, have, "my-project");

    expect(confirmStub).to.have.been.calledOnce;
    expect(confirmStub.firstCall.args[0].message).to.include("opt out of declarative security");

    expect(plan).to.deep.equal({
      codebase: "my-codebase",
      serviceAccount: managedSA,
      saAction: "delete",
      rolesToGrant: [],
      rolesToRevoke: [],
    });
  });
});
