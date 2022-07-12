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
  eventFilters: { resource: "projects/a/topics/b" },
  retry: false,
};

const SAMPLE_ENDPOINT: backend.Endpoint = {
  platform: "gcfv1",
  id: "c",
  region: "us-central1",
  project: "a",
  entryPoint: "function",
  labels: {},
  environmentVariables: {},
  runtime: "nodejs16",
  eventTrigger: SAMPLE_EVENT_TRIGGER,
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

describe("promptForFailurePolicies", () => {
  let promptStub: sinon.SinonStub;

  beforeEach(() => {
    promptStub = sinon.stub(prompt, "promptOnce");
  });

  afterEach(() => {
    promptStub.restore();
  });

  it("should prompt if there are new functions with failure policies", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(endpoint),
        backend.empty()
      )
    ).not.to.be.rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if all functions with failure policies already had failure policies", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(endpoint),
        backend.of(endpoint)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should throw if user declines the prompt", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(endpoint),
        backend.empty()
      )
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if an existing function adds a failure policy", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
      },
    };
    const newEndpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(newEndpoint),
        backend.of(endpoint)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should throw if there are any functions with failure policies and the user doesn't accept the prompt", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(endpoint),
        backend.empty()
      )
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with failure policies", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
      },
    };
    promptStub.resolves();

    await expect(
      functionPrompts.promptForFailurePolicies(
        SAMPLE_OPTIONS,
        backend.of(endpoint),
        backend.empty()
      )
    ).to.eventually.be.fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("should throw if there are any functions with failure policies, in noninteractive mode, without the force flag set", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true };

    await expect(
      functionPrompts.promptForFailurePolicies(options, backend.of(endpoint), backend.empty())
    ).to.be.rejectedWith(FirebaseError, /--force option/);
    expect(promptStub).not.to.have.been.called;
  });

  it("should not throw if there are any functions with failure policies, in noninteractive mode, with the force flag set", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      eventTrigger: {
        ...SAMPLE_EVENT_TRIGGER,
        retry: true,
      },
    };
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true, force: true };

    await expect(
      functionPrompts.promptForFailurePolicies(options, backend.of(endpoint), backend.empty())
    ).to.eventually.be.fulfilled;
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
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, backend.of(endpoint), backend.empty())
    ).not.to.be.rejected;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if no fucntion has minInstance", async () => {
    const bkend = backend.of(SAMPLE_ENDPOINT);
    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, bkend, bkend)).to.eventually
      .be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should not prompt if all functions with minInstances already had the same number of minInstances", async () => {
    const bkend = backend.of({
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    });

    await expect(functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, bkend, bkend)).to.eventually
      .be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should not prompt if functions decrease in minInstances", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 2,
    };
    const newEndpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };

    await expect(
      functionPrompts.promptForMinInstances(
        SAMPLE_OPTIONS,
        backend.of(newEndpoint),
        backend.of(endpoint)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.not.have.been.called;
  });

  it("should throw if user declines the prompt", async () => {
    const bkend = backend.of({
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    });
    promptStub.resolves(false);
    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, bkend, backend.empty())
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if an existing function sets minInstances", async () => {
    const newEndpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForMinInstances(
        SAMPLE_OPTIONS,
        backend.of(newEndpoint),
        backend.of(SAMPLE_ENDPOINT)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if an existing function increases minInstances", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };
    const newEndpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 2,
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForMinInstances(
        SAMPLE_OPTIONS,
        backend.of(newEndpoint),
        backend.of(endpoint)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should prompt if a minInstance function increases resource reservations", async () => {
    const endpoint: backend.Endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 2,
      availableMemoryMb: 1024,
    };
    const newEndpoint: backend.Endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 2,
      availableMemoryMb: 2048,
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForMinInstances(
        SAMPLE_OPTIONS,
        backend.of(newEndpoint),
        backend.of(endpoint)
      )
    ).eventually.be.fulfilled;
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should throw if there are any functions with failure policies and the user doesn't accept the prompt", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 2,
    };
    promptStub.resolves(false);

    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, backend.of(endpoint), backend.empty())
    ).to.eventually.be.rejectedWith(FirebaseError, /Deployment canceled/);
    expect(promptStub).to.have.been.calledOnce;
  });

  it("should not prompt if there are no functions with minInstances", async () => {
    promptStub.resolves();

    await expect(
      functionPrompts.promptForMinInstances(
        SAMPLE_OPTIONS,
        backend.of(SAMPLE_ENDPOINT),
        backend.empty()
      )
    ).to.eventually.be.fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("should throw if there are any functions with minInstances, in noninteractive mode, without the force flag set", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true };

    await expect(
      functionPrompts.promptForMinInstances(options, backend.of(endpoint), backend.empty())
    ).to.be.rejectedWith(FirebaseError, /--force option/);
    expect(promptStub).not.to.have.been.called;
  });

  it("should not throw if there are any functions with minInstances, in noninteractive mode, with the force flag set", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      minInstances: 1,
    };
    const options = { ...SAMPLE_OPTIONS, nonInteractive: true, force: true };

    await expect(
      functionPrompts.promptForMinInstances(options, backend.of(endpoint), backend.empty())
    ).to.eventually.be.fulfilled;
    expect(promptStub).not.to.have.been.called;
  });

  it("Should disclaim if a bill cannot be calculated", async () => {
    const endpoint = {
      ...SAMPLE_ENDPOINT,
      region: "fillory",
      minInstances: 1,
    };
    promptStub.resolves(true);

    await expect(
      functionPrompts.promptForMinInstances(SAMPLE_OPTIONS, backend.of(endpoint), backend.empty())
    ).to.eventually.be.fulfilled;
    expect(promptStub).to.have.been.called;
    expect(logStub.firstCall.args[1]).to.match(/Cannot calculate the minimum monthly bill/);
  });
});
