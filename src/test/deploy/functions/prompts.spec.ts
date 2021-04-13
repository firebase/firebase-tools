import { expect } from "chai";
import * as sinon from "sinon";

import * as prompt from "../../../prompt";
import * as functionPrompts from "../../../deploy/functions/prompts";
import { FirebaseError } from "../../../error";
import { CloudFunctionTrigger } from "../../../deploy/functions/deploymentPlanner";
import * as gcp from "../../../gcp";
import * as gcf from "../../../gcp/cloudfunctions";

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;
  let existingFunctions: gcf.CloudFunction[];

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
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
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).not.to.be.rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if all functions with failure policies already had failure policies", async () => {
    // Note: local definitions of function triggers use a top-level "failurePolicy" but
    // the API returns eventTrigger.failurePolicy.
    const func: any = {
      name: "projects/a/locations/b/functions/c",
      entryPoint: "",
      labels: {},
      environmentVariables: {},
      failurePolicy: {},
      eventTrigger: {
        failurePolicy: {},
      },
    };
    existingFunctions = [func];
    const options = {};

    await expect(functionPrompts.promptForFailurePolicies(options, [func], existingFunctions)).to
      .eventually.be.fulfilled;
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
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(options, funcs, [])
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
    const options = {};
    const context = {};
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(options, [newFunc], existingFunctions)).to
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
      functionPrompts.promptForFailurePolicies(options, funcs, existingFunctions)
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
    promptStub.resolves();

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).to.eventually.be
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
    const options = { nonInteractive: true, force: true };

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });
});
