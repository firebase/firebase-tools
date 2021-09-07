import { expect } from "chai";
import * as sinon from "sinon";

import { FirebaseError } from "../../../error";
import * as backend from "../../../deploy/functions/backend";
import * as functionPrompts from "../../../deploy/functions/prompts";
import * as prompt from "../../../prompt";
import * as utils from "../../../utils";
import { Options } from "../../../options";
import { RC } from "../../../rc";

const SAMPLE_EVENT_TRIGGER: backend.EventTrigger = {
  eventType: "google.pubsub.topic.publish",
  eventFilters: {
    resource: "projects/a/topics/b",
  },
  retry: false,
};

const SAMPLE_FUNC: backend.FunctionSpec = {
  platform: "gcfv1",
  id: "c",
  region: "us-central1",
  project: "a",
  entryPoint: "function",
  labels: {},
  environmentVariables: {},
  runtime: "nodejs16",
  trigger: SAMPLE_EVENT_TRIGGER,
};

const SAMPLE_OPTIONS: Options = {
  cwd: "/",
  configPath: "/",
  /* eslint-disable-next-line */
  config: {} as any,
  only: "functions",
  except: "",
  nonInteractive: false,
  json: false,
  interactive: false,
  debug: false,
  force: false,
  filteredTargets: ["functions"],
  rc: new RC(),
};

describe("compareFunctions", () => {
  const fnMembers = {
    project: "project",
    runtime: "nodejs14",
    trigger: {},
  };

  it("should compare different platforms", () => {
    const left: backend.FunctionSpec = {
      id: "v1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "v1",
      ...fnMembers,
    };
    const right: backend.FunctionSpec = {
      id: "v2",
      region: "us-west1",
      platform: "gcfv2",
      entryPoint: "v2",
      ...fnMembers,
    };

    expect(functionPrompts.compareFunctions(left, right)).to.eq(1);
    expect(functionPrompts.compareFunctions(right, left)).to.eq(-1);
  });

  it("should compare different regions, same platform", () => {
    const left: backend.FunctionSpec = {
      id: "v1",
      region: "us-west1",
      platform: "gcfv1",
      entryPoint: "v1",
      ...fnMembers,
    };
    const right: backend.FunctionSpec = {
      id: "newV1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "newV1",
      ...fnMembers,
    };

    expect(functionPrompts.compareFunctions(left, right)).to.eq(1);
    expect(functionPrompts.compareFunctions(right, left)).to.eq(-1);
  });

  it("should compare different ids, same platform & region", () => {
    const left: backend.FunctionSpec = {
      id: "v1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "v1",
      ...fnMembers,
    };
    const right: backend.FunctionSpec = {
      id: "newV1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "newV1",
      ...fnMembers,
    };

    expect(functionPrompts.compareFunctions(left, right)).to.eq(1);
    expect(functionPrompts.compareFunctions(right, left)).to.eq(-1);
  });

  it("should compare same ids", () => {
    const left: backend.FunctionSpec = {
      id: "v1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "v1",
      ...fnMembers,
    };
    const right: backend.FunctionSpec = {
      id: "v1",
      region: "us-central1",
      platform: "gcfv1",
      entryPoint: "v1",
      ...fnMembers,
    };

    expect(functionPrompts.compareFunctions(left, right)).to.eq(0);
  });
});

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

  it("should prompt if an existing function adds a failure policy", async () => {
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

describe("promptForMinInstances", () => {
  let promptStub: sinon.SinonStub;
  let logStub: sinon.SinonStub;

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
    logStub = sinon.stub(utils, "logLabeledWarning");
  });

  afterEach(() => {
    promptStub.restore();
    logStub.restore();
  });

  it("should prompt if there are new functions with minInstances", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        minInstances: 1,
      },
    ];
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])).not.to.be
      .rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if no fucntion has minInstance", async () => {
    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [SAMPLE_FUNC], [SAMPLE_FUNC])
    ).to.eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should not prompt if all functions with minInstances already had the same number of minInstances", async () => {
    const func = {
      ...SAMPLE_FUNC,
      minInstances: 1,
    };

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [func], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should not prompt if functions decrease in minInstances", async () => {
    const func = {
      ...SAMPLE_FUNC,
      minInstances: 2,
    };
    const newFunc = {
      ...SAMPLE_FUNC,
      minInstances: 1,
    };

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [newFunc], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should throw if user declines the prompt", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        minInstances: 1,
      },
    ];
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if an existing function sets minInstances", async () => {
    const func = {
      ...SAMPLE_FUNC,
    };
    const newFunc = {
      ...SAMPLE_FUNC,
      minInstances: 1,
    };
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [newFunc], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if an existing function increases minInstances", async () => {
    const func = {
      ...SAMPLE_FUNC,
      minInstances: 1,
    };
    const newFunc = {
      ...SAMPLE_FUNC,
      minInstances: 2,
    };
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [newFunc], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if a minInstance function increases resource reservations", async () => {
    const func: backend.FunctionSpec = {
      ...SAMPLE_FUNC,
      minInstances: 2,
      availableMemoryMb: 1024,
    };
    const newFunc: backend.FunctionSpec = {
      ...SAMPLE_FUNC,
      minInstances: 2,
      availableMemoryMb: 2048,
    };
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, [newFunc], [func])).to
      .eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should throw if there are any functions with failure policies and the user doesn't accept the prompt", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        minInstances: 2,
      },
    ];
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with minInstances", async () => {
    const funcs = [SAMPLE_FUNC];
    promptStub.resolves();

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("should throw if there are any functions with minInstances, in noninteractive mode, without the force flag set", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        minInstances: 1,
      },
    ];
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true };

    await expect(functionPrompts.promptForMinInstances(options, funcs, [])).to.be.rejectedWith(
      FirebaseError,
      /--force option/
    );
    expect(promptStub).not.to.have.been.called;
  });

  it("should not throw if there are any functions with minInstances, in noninteractive mode, with the force flag set", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        minInstances: 1,
      },
    ];
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true, force: true };

    await expect(functionPrompts.promptForMinInstances(options, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("Should disclaim if a bill cannot be calculated", async () => {
    const funcs = [
      {
        ...SAMPLE_FUNC,
        region: "fillory",
        minInstances: 1,
      },
    ];
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).to.have.been.called;
    expect(logStub.firstCall.args[1]).to.match(/Cannot calculate the minimum monthly bill/);
  });

  it("Should advise customers of possible discounts", async () => {
    const funcs: backend.FunctionSpec[] = [
      {
        ...SAMPLE_FUNC,
        region: "fillory",
        platform: "gcfv2",
        minInstances: 2,
      },
    ];
    promptStub.resolves(true);

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, funcs, [])).to.eventually.be
      .fulfilled;
    expect(promptStub).to.have.been.called;
    expect(logStub.firstCall.args[1]).to.match(new RegExp("https://cloud.google.com/run/cud"));
  });
});
