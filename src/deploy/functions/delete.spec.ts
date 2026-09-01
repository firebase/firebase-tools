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
});
