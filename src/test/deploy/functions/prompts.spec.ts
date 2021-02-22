import { expect } from "chai";
import * as sinon from "sinon";

import * as prompt from "../../../prompt";
import * as functionPrompts from "../../../deploy/functions/prompts";
import { FirebaseError } from "../../../error";
import { CloudFunctionTrigger } from "../../../deploy/functions/deploymentPlanner";
import * as gcp from "../../../gcp";

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;
  let listAllFunctionsStub: sinon.SinonStub;
  let existingFunctions: CloudFunctionTrigger[] = [];

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
    listAllFunctionsStub = sinon.stub(gcp.cloudfunctions, "listAllFunctions").callsFake(() => {
      return Promise.resolve(existingFunctions);
    });
  });

  afterEach(() => {
    promptStub.restore();
    listAllFunctionsStub.restore();
    existingFunctions = [];
  });

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
    const options = {};
    const context = {};
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(context, options, funcs)).not.to.be
      .rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if all functions with failure policies already had failure policies", async () => {
    const func: any = {
      name: "projects/a/locations/b/functions/c",
      entryPoint: "",
      labels: {},
      environmentVariables: {},
      failurePolicy: {},
    };
    existingFunctions = [func];
    const options = {};
    const context = {};

    await expect(functionPrompts.promptForFailurePolicies(context, options, [func])).to.eventually
      .be.fulfilled;
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
    const options = {};
    const context = {};
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(context, options, funcs)
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should propmt if an existing function adds a failure policy", async () => {
    const func: CloudFunctionTrigger = {
      name: "projects/a/locations/b/functions/c",
      entryPoint: "",
      labels: {},
      environmentVariables: {},
    };
    existingFunctions = [func];
    const newFunc = Object.assign({}, func, { failurePolicy: {} });
    const options = {};
    const context = {};
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(context, options, [newFunc])).to
      .eventually.be.fulfilled;
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
      functionPrompts.promptForFailurePolicies(context, options, funcs)
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
    const options = {};
    const context = {};
    promptStub.resolves();

    await expect(functionPrompts.promptForFailurePolicies(context, options, funcs)).to.eventually.be
      .fulfilled;
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
    const options = { nonInteractive: true };

    await expect(
      functionPrompts.promptForFailurePolicies(context, options, funcs)
    ).to.be.rejectedWith(FirebaseError, /--force option/);
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
    const options = { nonInteractive: true, force: true };

    await expect(functionPrompts.promptForFailurePolicies(context, options, funcs)).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });
});
