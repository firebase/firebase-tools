import { expect, use } from "chai";
import * as sinon from "sinon";
import * as chaiAsPromised from "chai-as-promised";

use(chaiAsPromised);

import { release } from "./index";
import * as fabricator from "./fabricator";
import * as reporter from "./reporter";
import * as lifecycle from "./lifecycle";
import * as prompts from "../prompts";
import * as backend from "../backend";
import { FirebaseError } from "../../../error";
import * as artifacts from "../../../functions/artifacts";
import * as utils from "../../../utils";

describe("release/index", () => {
  let sandbox: sinon.SinonSandbox;
  let fabricatorStub: sinon.SinonStub;
  let executeLifecycleHooksStub: sinon.SinonStub;

  let logLabeledWarningStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    // Stub external prompts & fabricator method
    sandbox.stub(prompts as any, "promptForFunctionDeletion").resolves(true);
    sandbox.stub(prompts as any, "promptForUnsafeMigration").resolves([]);

    fabricatorStub = sandbox.stub(fabricator.Fabricator.prototype, "applyPlan");

    // Stub reporter methods to avoid logging and side effects
    sandbox.stub(reporter, "logAndTrackDeployStats").resolves();
    sandbox.stub(reporter, "printErrors");

    // Stub lifecycle execution
    executeLifecycleHooksStub = sandbox.stub(lifecycle, "executeLifecycleHooks").resolves(true);

    // Stub artifacts helper methods to prevent GCP requests in tests
    sandbox
      .stub(artifacts, "checkCleanupPolicy")
      .resolves({ locationsToSetup: [], locationsWithErrors: [] });
    sandbox
      .stub(artifacts, "setCleanupPolicies")
      .resolves({ locationsWithPolicy: [], locationsWithErrors: [] });

    logLabeledWarningStub = sandbox.stub(utils, "logLabeledWarning");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should run lifecycle hooks if deployment is successful (no errors)", async () => {
    const context = {
      projectId: "test-project",
      config: {},
      sources: {},
      firebaseConfig: { locationId: "us-central1" },
    } as any;

    const options = {
      projectId: "test-project",
      projectNumber: "123456",
    } as any;

    const payload = {
      functions: {
        codebase1: {
          wantBackend: backend.of({
            id: "fn1",
            region: "us-central1",
            project: "test-project",
            platform: "gcfv2",
            entryPoint: "fn1",
            httpsTrigger: {},
          }),
          haveBackend: backend.empty(),
        },
      },
    } as any;

    // Simulate successful deployment
    fabricatorStub.resolves({
      totalTime: 120,
      results: [
        {
          endpoint: payload.functions.codebase1.wantBackend.endpoints["us-central1"]["fn1"],
          durationMs: 120,
        },
      ],
    });

    await release(context, options, payload);

    // Assert that lifecycle hooks were executed
    expect(executeLifecycleHooksStub).to.have.been.calledOnce;
  });

  it("should NOT run lifecycle hooks if deployment fails with errors", async () => {
    const context = {
      projectId: "test-project",
      config: {},
      sources: {},
      firebaseConfig: { locationId: "us-central1" },
    } as any;

    const options = {
      projectId: "test-project",
      projectNumber: "123456",
    } as any;

    const payload = {
      functions: {
        codebase1: {
          wantBackend: backend.of({
            id: "fn1",
            region: "us-central1",
            project: "test-project",
            platform: "gcfv2",
            entryPoint: "fn1",
            httpsTrigger: {},
          }),
          haveBackend: backend.empty(),
        },
      },
    } as any;

    // Simulate failed deployment (one of the results contains an error)
    fabricatorStub.resolves({
      totalTime: 120,
      results: [
        {
          endpoint: payload.functions.codebase1.wantBackend.endpoints["us-central1"]["fn1"],
          durationMs: 120,
          error: new Error("Failed to deploy function fn1 due to some API error"),
        },
      ],
    });

    await expect(release(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "There was an error deploying functions",
    );

    // Assert that lifecycle hooks were NOT executed because the error was thrown early
    expect(executeLifecycleHooksStub).to.not.have.been.called;
    expect(logLabeledWarningStub).to.not.have.been.called;
  });

  it("should NOT run lifecycle hooks and SHOULD log warning if deployment fails and hooks are configured", async () => {
    const context = {
      projectId: "test-project",
      config: {},
      sources: {},
      firebaseConfig: { locationId: "us-central1" },
    } as any;

    const options = {
      projectId: "test-project",
      projectNumber: "123456",
    } as any;

    const wantBackend = backend.of({
      id: "fn1",
      region: "us-central1",
      project: "test-project",
      platform: "gcfv2",
      entryPoint: "fn1",
      httpsTrigger: {},
    });
    wantBackend.lifecycleHooks = {
      afterFirstDeploy: {
        task: {
          function: "someTask",
        },
      },
    };

    const payload = {
      functions: {
        codebase1: {
          wantBackend,
          haveBackend: backend.empty(),
        },
      },
    } as any;

    // Simulate failed deployment
    fabricatorStub.resolves({
      totalTime: 120,
      results: [
        {
          endpoint: payload.functions.codebase1.wantBackend.endpoints["us-central1"]["fn1"],
          durationMs: 120,
          error: new Error("Failed to deploy function fn1 due to some API error"),
        },
      ],
    });

    await expect(release(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "There was an error deploying functions",
    );

    // Assert that lifecycle hooks were NOT executed
    expect(executeLifecycleHooksStub).to.not.have.been.called;
    // Assert that skipped hooks warning was logged
    expect(logLabeledWarningStub).to.have.been.calledWith(
      "functions",
      'Lifecycle hook "afterFirstDeploy" for codebase "codebase1" was configured but not executed because one or more function deployments failed.',
    );
  });

  it("should NOT run lifecycle hooks when only SOME deployments fail", async () => {
    const context = {
      projectId: "test-project",
      config: {},
      sources: {},
      firebaseConfig: { locationId: "us-central1" },
    } as any;

    const options = {
      projectId: "test-project",
      projectNumber: "123456",
    } as any;

    const wantBackend = backend.of(
      {
        id: "fn1",
        region: "us-central1",
        project: "test-project",
        platform: "gcfv2",
        entryPoint: "fn1",
        httpsTrigger: {},
      },
      {
        id: "fn2",
        region: "us-central1",
        project: "test-project",
        platform: "gcfv2",
        entryPoint: "fn2",
        httpsTrigger: {},
      },
    );

    const payload = {
      functions: {
        codebase1: {
          wantBackend,
          haveBackend: backend.empty(),
        },
      },
    } as any;

    // Simulate partial failure (1 succeeded, 1 failed out of 2)
    fabricatorStub.resolves({
      totalTime: 120,
      results: [
        {
          endpoint: payload.functions.codebase1.wantBackend.endpoints["us-central1"]["fn1"],
          durationMs: 120,
        },
        {
          endpoint: payload.functions.codebase1.wantBackend.endpoints["us-central1"]["fn2"],
          durationMs: 120,
          error: new Error("Failed to deploy function fn2"),
        },
      ],
    });

    await expect(release(context, options, payload)).to.be.rejectedWith(
      FirebaseError,
      "There was an error deploying functions",
    );

    // Assert that lifecycle hooks were NOT executed
    expect(executeLifecycleHooksStub).to.not.have.been.called;
  });
});
