import { expect } from "chai";
import * as sinon from "sinon";

import * as prompt from "../../../prompt";
import * as functionPrompts from "../../../deploy/functions/prompts";
import { FirebaseError} from "../../../error";
import { CloudFunctionTrigger } from "../../../functionsDeployHelper";

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
  });

  it("should prompt if there are any functions with failure policies", () => {
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

    expect(async () => await functionPrompts.promptForFailurePolicies(options, funcs)).not.to.throw();
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
    promptStub.resolves(false);

    await expect(functionPrompts.promptForFailurePolicies(options, funcs)).to.be.rejectedWith(
      FirebaseError,
      /Deployment canceled/
    );
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with failure policies", () => {
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

    expect(async () => await functionPrompts.promptForFailurePolicies(options, funcs)).not.to.throw();
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

    await expect(functionPrompts.promptForFailurePolicies(options, funcs)).to.be.rejectedWith(
      FirebaseError,
      /--force option/
    );
    expect(promptStub).not.to.have.been.called;
  });

  it("should not throw if there are any functions with failure policies, in noninteractive mode, with the force flag set", () => {
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

    expect(async () => await functionPrompts.promptForFailurePolicies(options, funcs)).not.to.throw();
    expect(promptStub).not.to.have.been.called;
  });
});