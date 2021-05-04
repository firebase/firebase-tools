import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as args from "../../../deploy/functions/args";
import * as backend from "../../../deploy/functions/backend";
import * as functionPrompts from "../../../deploy/functions/prompts";
import * as prompt from "../../../prompt";

const SAMPLE_FUNC: Omit<backend.FunctionSpec, "trigger"> = {
  apiVersion: 1,
  id: "c",
  region: "b",
  project: "a",
  entryPoint: "function",
  labels: {},
  environmentVariables: {},
  runtime: "nodejs14",
};

const SAMPLE_EVENT_TRIGGER: backend.EventTrigger = {
  eventType: "google.pubsub.topic.publish",
  eventFilters: {
    resource: "projects/a/topics/b",
  },
  retry: false,
};

const SAMPLE_OPTIONS: args.Options = {
  cwd: "/",
  configPath: "/",
  /* eslint-disable-next-line */
  config: {} as any,
  only: "functions",
  nonInteractive: false,
  force: false,
  filteredTargets: ["functions"],
};

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
  });

  it("should prompt if there are new functions with failure policies", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
          retry: true,
        },
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
      ...SAMPLE_FUNC,
      trigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };

    await expect(functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, [func], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should throw if user declines the prompt", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
          retry: true,
        },
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
      ...SAMPLE_FUNC,
      trigger: {
        ...SAMPLE_EVENT_TRIGGER,
      },
    };
    const newFunc = {
      ...SAMPLE_FUNC,
      trigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    promptStub.resolves(true);

    await expect(functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, [newFunc], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should throw if there are any functions with failure policies and the user doesn't accept the prompt", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
          retry: true,
        },
      },
    ];
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, [])
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with failure policies", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
        },
      },
    ];
    promptStub.resolves();

    await expect(functionPrompts.promptForFailurePolicies(SAMPLE_OPTIONS, funcs, [])).to.eventually
      .be.fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("should throw if there are any functions with failure policies, in noninteractive mode, without the force flag set", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
          retry: true,
        },
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
    const funcs = [
      {
        ...SAMPLE_FUNC,
        trigger: {
          ...SAMPLE_EVENT_TRIGGER,
          retry: true,
        },
      },
    ];
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true, force: true };

    await expect(functionPrompts.promptForFailurePolicies(options, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });
});
