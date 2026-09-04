import { expect } from "chai";
import * as sinon from "sinon";

import * as backend from "./backend";
import * as fabricator from "./release/fabricator";
import { deleteFunctionsByEndpointFilters } from "./delete";
import { Options } from "../../options";
import * as functionsConfig from "../../functionsConfig";
import * as reporter from "./release/reporter";
import * as getProjectNumber from "../../getProjectNumber";

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
  const fakeBackend: backend.Backend = {
    requiredAPIs: [],
    environmentVariables: {},
    endpoints: {
      "us-central1": { foo: fakeEndpoint },
    },
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
  const fakeBackendWithBoth: backend.Backend = {
    requiredAPIs: [],
    environmentVariables: {},
    endpoints: {
      "us-central1": { foo: fakeEndpoint, bar: fakeEndpoint2 },
    },
  };

  afterEach(() => {
    sinon.restore();
  });

  it("calls the fabricator to implement a deletion plan", async () => {
    sinon.stub(backend, "existingBackend").resolves(fakeBackend);
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsConfig, "getAppEngineLocation").returns("us-central1");
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("1234");
    sinon.stub(fabricator.Fabricator.prototype, "applyPlan").resolves({
      totalTime: 100,
      results: [
        {
          endpoint: fakeEndpoint,
          durationMs: 100,
        },
      ],
    });
    sinon.stub(reporter, "logAndTrackDeployStats").resolves();

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        {
          nonInteractive: true,
          force: true,
        } as Options,
      ),
    ).to.eventually.equal(1);
  });

  it("short-circuits and returns 0 if the provided filter doesn't match", async () => {
    sinon.stub(backend, "existingBackend").resolves(fakeBackend);

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "asdf" }] },
        {
          nonInteractive: true,
          force: true,
        } as Options,
      ),
    ).to.eventually.equal(0);
  });

  it("removes functions from consideration if they don't match a provided --region flag", async () => {
    sinon.stub(backend, "existingBackend").resolves(fakeBackend);

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        {
          nonInteractive: true,
          force: true,
          region: "us-east1",
        } as unknown as Options,
      ),
    ).to.eventually.equal(0);
  });

  it("throws an error if any delete op fails", async () => {
    sinon.stub(backend, "existingBackend").resolves(fakeBackendWithBoth);
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsConfig, "getAppEngineLocation").returns("us-central1");
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("1234");
    sinon.stub(fabricator.Fabricator.prototype, "applyPlan").resolves({
      totalTime: 200,
      results: [
        {
          endpoint: fakeEndpoint,
          durationMs: 100,
        },
        {
          endpoint: fakeEndpoint2,
          durationMs: 100,
          error: new Error("something went wrong"),
        },
      ],
    });
    sinon.stub(reporter, "logAndTrackDeployStats").resolves();

    await expect(
      deleteFunctionsByEndpointFilters(
        { projectId: "my-project", filters: [{ codebase: "foo" }] },
        {
          nonInteractive: true,
          force: true,
        } as Options,
      ),
    ).to.be.rejected;
  });

  it("identifies and passes managed service account for deletion when all functions using it are deleted", async () => {
    const endpointWithSA: backend.Endpoint = {
      ...fakeEndpoint,
      serviceAccount: "firebase-fn-1234567890@my-project.iam.gserviceaccount.com",
    };
    const backendWithSA: backend.Backend = {
      requiredAPIs: [],
      environmentVariables: {},
      endpoints: {
        "us-central1": { foo: endpointWithSA },
      },
    };

    sinon.stub(backend, "existingBackend").resolves(backendWithSA);
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsConfig, "getAppEngineLocation").returns("us-central1");
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("1234");
    const applyPlanStub = sinon.stub(fabricator.Fabricator.prototype, "applyPlan").resolves({
      totalTime: 100,
      results: [{ endpoint: endpointWithSA, durationMs: 100 }],
    });
    sinon.stub(reporter, "logAndTrackDeployStats").resolves();

    await deleteFunctionsByEndpointFilters(
      { projectId: "my-project", filters: [{ codebase: "foo" }] },
      { nonInteractive: true, force: true } as Options,
    );

    expect(applyPlanStub.calledOnce).to.be.true;
    const appliedPlan = applyPlanStub.firstCall.args[0];
    expect(appliedPlan.default.serviceAccountToDelete).to.equal(
      "firebase-fn-1234567890@my-project.iam.gserviceaccount.com",
    );
  });

  it("does not delete managed service account if surviving functions still use it", async () => {
    const sharedSA = "firebase-fn-1234567890@my-project.iam.gserviceaccount.com";
    const endpoint1: backend.Endpoint = {
      ...fakeEndpoint,
      serviceAccount: sharedSA,
    };
    const endpoint2: backend.Endpoint = {
      ...fakeEndpoint2,
      codebase: "bar",
      serviceAccount: sharedSA,
    };
    const backendWithSharedSA: backend.Backend = {
      requiredAPIs: [],
      environmentVariables: {},
      endpoints: {
        "us-central1": { foo: endpoint1, bar: endpoint2 },
      },
    };

    sinon.stub(backend, "existingBackend").resolves(backendWithSharedSA);
    sinon.stub(functionsConfig, "getFirebaseConfig").resolves({ projectId: "my-project" });
    sinon.stub(functionsConfig, "getAppEngineLocation").returns("us-central1");
    sinon.stub(getProjectNumber, "getProjectNumber").resolves("1234");
    const applyPlanStub = sinon.stub(fabricator.Fabricator.prototype, "applyPlan").resolves({
      totalTime: 100,
      results: [{ endpoint: endpoint1, durationMs: 100 }],
    });
    sinon.stub(reporter, "logAndTrackDeployStats").resolves();

    // Delete only codebase "foo", leaving codebase "bar" (which also uses sharedSA)
    await deleteFunctionsByEndpointFilters(
      { projectId: "my-project", filters: [{ codebase: "foo" }] },
      { nonInteractive: true, force: true } as Options,
    );

    expect(applyPlanStub.calledOnce).to.be.true;
    const appliedPlan = applyPlanStub.firstCall.args[0];
    expect(appliedPlan.default.serviceAccountToDelete).to.be.undefined;
  });
});
