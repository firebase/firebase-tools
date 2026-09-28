import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "./backend";
import * as fabricator from "./release/fabricator";
import * as planner from "./release/planner";
import { deleteFunctionsByEndpointFilters } from "./delete";
import { Options } from "../../options";
import * as functionsConfig from "../../functionsConfig";
import * as reporter from "./release/reporter";
import * as getProjectNumber from "../../getProjectNumber";
import * as prompt from "../../prompt";

describe("function delete helper", () => {
  const fakeEndpoint: backend.Endpoint = {
    id: "foo",
    region: "us-central1",
    project: "my-project",
    httpsTrigger: {},
    platform: "gcfv2",
    entryPoint: "function",
    codebase: "foo",
  };
  const fakeEndpoint2: backend.Endpoint = {
    id: "bar",
    region: "us-central1",
    project: "my-project",
    httpsTrigger: {},
    platform: "gcfv2",
    entryPoint: "function",
    codebase: "foo",
  };

  let applyPlanStub: sinon.SinonStub;

  beforeEach(() => {
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsConfig, "getAppEngineLocation").returns("us-central1");
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("1234");
    sinon.stub(reporter, "logAndTrackDeployStats").resolves();
    applyPlanStub = sinon
      .stub(fabricator.Fabricator.prototype, "applyPlan")
      .resolves({ totalTime: 100, results: [] });
  });

  afterEach(() => {
    sinon.restore();
  });

  it("calls the fabricator to implement a deletion plan", async () => {
    sinon.stub(backend, "existingBackend").resolves(backend.of(fakeEndpoint));

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        { nonInteractive: true, force: true } as Options,
      ),
    ).to.eventually.equal(1);
  });

  it("defaults endpoints without codebase to DEFAULT_CODEBASE", async () => {
    const defaultEndpoint: backend.Endpoint = {
      ...fakeEndpoint,
      codebase: undefined,
    };
    sinon.stub(backend, "existingBackend").resolves(backend.of(defaultEndpoint));

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "default" }] },
        { nonInteractive: true, force: true } as Options,
      ),
    ).to.eventually.equal(1);
  });

  it("short-circuits and returns 0 if the provided filter doesn't match", async () => {
    sinon.stub(backend, "existingBackend").resolves(backend.of(fakeEndpoint));

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "asdf" }] },
        { nonInteractive: true, force: true } as Options,
      ),
    ).to.eventually.equal(0);
  });

  it("removes functions from consideration if they don't match a provided --region flag", async () => {
    sinon.stub(backend, "existingBackend").resolves(backend.of(fakeEndpoint));

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        { nonInteractive: true, force: true, region: "us-east1" } as unknown as Options,
      ),
    ).to.eventually.equal(0);
  });

  it("throws an error if any delete op fails", async () => {
    sinon.stub(backend, "existingBackend").resolves(backend.of(fakeEndpoint, fakeEndpoint2));
    applyPlanStub.resolves({
      totalTime: 200,
      results: [
        { endpoint: fakeEndpoint, durationMs: 100 },
        { endpoint: fakeEndpoint2, durationMs: 100, error: new Error("something went wrong") },
      ],
    });

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        { nonInteractive: true, force: true } as Options,
      ),
    ).to.be.rejected;
  });

  it("aborts deletion when confirmation prompt is rejected", async () => {
    sinon.stub(backend, "existingBackend").resolves(backend.of(fakeEndpoint));
    sinon.stub(prompt, "confirm").resolves(false);

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        { nonInteractive: false, force: false } as Options,
      ),
    ).to.be.rejectedWith("Command aborted.");

    expect(applyPlanStub).to.not.have.been.called;
  });

  describe("declarative security cleanup", () => {
    const managedSA = "firebase-fn-123@my-project.iam.gserviceaccount.com";
    const managedEndpoint1: backend.Endpoint = {
      ...fakeEndpoint,
      codebase: "my-codebase",
      serviceAccount: managedSA,
    };
    const managedEndpoint2: backend.Endpoint = {
      ...fakeEndpoint2,
      id: "func2",
      codebase: "my-codebase",
      serviceAccount: managedSA,
    };
    const managedEndpointEast: backend.Endpoint = {
      ...fakeEndpoint,
      id: "func3",
      region: "us-east1",
      codebase: "my-codebase",
      serviceAccount: managedSA,
    };

    it("schedules managed service account deletion when all functions in a codebase are deleted", async () => {
      sinon
        .stub(backend, "existingBackend")
        .resolves(backend.of(managedEndpoint1, managedEndpoint2));

      await deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "my-codebase" }] },
        { nonInteractive: true, force: true } as Options,
      );

      const plan = applyPlanStub.firstCall.args[0] as planner.DeploymentPlan;
      expect(plan["my-codebase"]?.serviceAccountToDelete).to.equal(managedSA);
    });

    it("does not schedule managed service account deletion on partial codebase deletion", async () => {
      sinon
        .stub(backend, "existingBackend")
        .resolves(backend.of(managedEndpoint1, managedEndpoint2));

      await deleteFunctionsByEndpointFilters(
        {
          projectId: "my-project",
          filters: [{ codebase: "my-codebase", idChunks: ["foo"] }],
        },
        { nonInteractive: true, force: true } as Options,
      );

      const plan = applyPlanStub.firstCall.args[0] as planner.DeploymentPlan;
      expect(plan["my-codebase"]?.serviceAccountToDelete).to.be.undefined;
    });

    it("does not schedule managed service account deletion when deletion is restricted by --region and other regions still have functions", async () => {
      sinon
        .stub(backend, "existingBackend")
        .resolves(backend.of(managedEndpoint1, managedEndpointEast));

      await deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "my-codebase" }] },
        { nonInteractive: true, force: true, region: "us-central1" } as unknown as Options,
      );

      const plan = applyPlanStub.firstCall.args[0] as planner.DeploymentPlan;
      expect(plan["my-codebase"]?.serviceAccountToDelete).to.be.undefined;
    });

    it("handles multiple codebases independently when scheduling service account deletions", async () => {
      const sa1 = "firebase-fn-111@my-project.iam.gserviceaccount.com";
      const sa2 = "firebase-fn-222@my-project.iam.gserviceaccount.com";
      const cb1Endpoint: backend.Endpoint = {
        ...fakeEndpoint,
        codebase: "cb1",
        serviceAccount: sa1,
      };
      const cb2Endpoint1: backend.Endpoint = {
        ...fakeEndpoint2,
        id: "fn2",
        codebase: "cb2",
        serviceAccount: sa2,
      };
      const cb2Endpoint2: backend.Endpoint = {
        ...fakeEndpoint2,
        id: "fn3",
        codebase: "cb2",
        serviceAccount: sa2,
      };

      sinon
        .stub(backend, "existingBackend")
        .resolves(backend.of(cb1Endpoint, cb2Endpoint1, cb2Endpoint2));

      // Delete all of cb1 and only fn2 from cb2
      await deleteFunctionsByEndpointFilters(
        {
          projectId: "my-project",
          filters: [{ codebase: "cb1" }, { codebase: "cb2", idChunks: ["fn2"] }],
        },
        { nonInteractive: true, force: true } as Options,
      );

      const plan = applyPlanStub.firstCall.args[0] as planner.DeploymentPlan;
      expect(plan["cb1"]?.serviceAccountToDelete).to.equal(sa1);
      expect(plan["cb2"]?.serviceAccountToDelete).to.be.undefined;
    });

    it("includes managed service accounts in confirmation prompt message", async () => {
      sinon.stub(backend, "existingBackend").resolves(backend.of(managedEndpoint1));
      const confirmStub = sinon.stub(prompt, "confirm").resolves(true);

      await deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "my-codebase" }] },
        {} as Options,
      );

      expect(confirmStub).to.have.been.calledOnce;
      const promptArg = confirmStub.firstCall.args[0] as { message: string };
      expect(promptArg.message).to.include(
        "The following managed service accounts will also be deleted:",
      );
      expect(promptArg.message).to.include(managedSA);
    });
  });
});
