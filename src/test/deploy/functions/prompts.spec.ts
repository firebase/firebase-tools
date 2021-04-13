import { expect } from "chai";
import * as sinon from "sinon";

import * as prompt from "../../../prompt";
import * as functionPrompts from "../../../deploy/functions/prompts";
import { FirebaseError } from "../../../error";
import { CloudFunctionTrigger } from "../../../deploy/functions/deploymentPlanner";
import * as gcf from "../../../gcp/cloudfunctions";
import * as args from "../../../deploy/functions/args";

// Dropping unused fields intentionally
const SAMPLE_OPTIONS: args.Options = ({
  nonInteractive: false,
  force: false,
} as any) as args.Options;

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;
  let existingFunctions: gcf.CloudFunction[];

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
    existingFunctions = [];
  });

  afterEach(() => {
    promptStub.restore();
  });

  // Note: Context is used for caching values, so it must be reset between each test.
  function newContext(): args.Context {
    return {
      projectId: "a",
      filters: [],
    };
  }

  it("should prompt if there are new functions with failure policies", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
        failurePolicy: {},
      },
    ];
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, [])).not.to.be
      .rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if all functions with failure policies already had failure policies", async () => {
    // Note: local definitions of function triggers use a top-level "failurePolicy" but
    // the API returns eventTrigger.failurePolicy.
    const func = {
      name: "projects/a/locations/b/functions/c",
      entryPoint: "",
      labels: {},
      environmentVariables: {},
      failurePolicy: {},
      eventTrigger: {
        eventType: "eventType",
        resource: "resource",
        failurePolicy: {},
      },
      runtime: "nodejs14" as gcf.Runtime,
    };
    existingFunctions = [func as any];

    await expect(
      functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, [func], existingFunctions)
    ).to.eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should throw if user declines the prompt", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
        failurePolicy: {},
      },
    ];
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, [])
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should propmt if an existing function adds a failure policy", async () => {
    const func = {
      name: "projects/a/locations/b/functions/c",
      entryPoint: "",
      labels: {},
      environmentVariables: {},
      runtime: "nodejs14" as gcf.Runtime,
    };
    existingFunctions = [
      Object.assign({}, func, {
        status: "ACTIVE" as gcf.CloudFunctionStatus,
        buildId: "",
        versionId: 1,
        updateTime: new Date(10),
      }),
    ];
    const newFunc = Object.assign({}, func, { failurePolicy: {} });
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, [newFunc], existingFunctions)
    ).to.eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should throw if there are any functions with failure policies and the user doesn't accept the prompt", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
        failurePolicy: {},
      },
    ];
    const options = {};
    const context = {};
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, existingFunctions)
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with failure policies", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
      },
    ];
    promptStub.resolves();

    await expect(functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, [])).to.eventually
      .be.fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("should throw if there are any functions with failure policies, in noninteractive mode, without the force flag set", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
        failurePolicy: {},
      },
    ];
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true };

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).to.be.rejectedWith(
      FirebaseError,
      /--force option/
    );
    expect(promptStub).not.to.have.been.called;
  });

  it("should not throw if there are any functions with failure policies, in noninteractive mode, with the force flag set", async () => {
    const funcs: CloudFunctionTrigger[] = [
      {
        name: "projects/a/locations/b/functions/c",
        entryPoint: "",
        labels: {},
        environmentVariables: {},
        failurePolicy: {},
      },
    ];
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true, force: true };

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });
});
