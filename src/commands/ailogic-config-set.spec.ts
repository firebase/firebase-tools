import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-config-set";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:config:set", () => {
  let updateStub: sinon.SinonStub;
  let getConfigStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let ensureStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    ensureStub = sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    getConfigStub = sinon.stub(ailogic, "getConfig").resolves({ name: "config" });
    updateStub = sinon.stub(ailogic, "updateConfig").resolves({ name: "config" });
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => sinon.restore());

  it("throws on an unknown path listing the writable paths", async () => {
    await expect(
      command.runner()("security.authonly", "true", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /Unknown configuration path/);
  });

  it("rejects a non-boolean value for a security path", async () => {
    await expect(
      command.runner()("security.auth-only", "yes", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /must be 'true' or 'false'/);
  });

  it("validates input before triggering the API-enablement flow (fail-fast)", async () => {
    await expect(
      command.runner()("monitoring.sample-rate-percentage", "500", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /integer in the range 1-100/);
    expect(ensureStub).to.not.have.been.called;
  });

  it("prompts when tightening auth-only from false to true, then updates", async () => {
    getConfigStub.resolves({ name: "config", trafficFilter: { firebaseAuthRequired: false } });
    await command.runner()("security.auth-only", "true", {
      project: PROJECT_ID,
      interactive: true,
    });
    expect(confirmStub).to.have.been.calledOnce;
    expect(updateStub).to.have.been.calledWith(
      PROJECT_ID,
      { trafficFilter: { firebaseAuthRequired: true } },
      ["trafficFilter.firebaseAuthRequired"],
    );
  });

  it("does not prompt when auth-only is already true", async () => {
    getConfigStub.resolves({ name: "config", trafficFilter: { firebaseAuthRequired: true } });
    await command.runner()("security.auth-only", "true", {
      project: PROJECT_ID,
      interactive: true,
    });
    expect(confirmStub).to.not.have.been.called;
    expect(updateStub).to.have.been.calledOnce;
  });

  it("does not prompt when relaxing auth-only to false", async () => {
    await command.runner()("security.auth-only", "false", { project: PROJECT_ID });
    expect(confirmStub).to.not.have.been.called;
    expect(updateStub).to.have.been.calledWith(
      PROJECT_ID,
      { trafficFilter: { firebaseAuthRequired: false } },
      ["trafficFilter.firebaseAuthRequired"],
    );
  });

  it("propagates confirm() aborting in non-interactive mode without --force", async () => {
    // confirm() throws in non-interactive mode when no --force is given; the command
    // must surface that and not proceed to write.
    getConfigStub.resolves({ name: "config", trafficFilter: { firebaseAuthRequired: false } });
    confirmStub.rejects(new FirebaseError("cannot be answered in non-interactive mode"));
    await expect(
      command.runner()("security.auth-only", "true", { project: PROJECT_ID, nonInteractive: true }),
    ).to.be.rejectedWith(FirebaseError, /non-interactive/);
    expect(updateStub).to.not.have.been.called;
  });

  it("prompts when tightening template-only from false to true, then updates", async () => {
    getConfigStub.resolves({ name: "config", trafficFilter: { templateOnly: false } });
    await command.runner()("security.template-only", "true", {
      project: PROJECT_ID,
      interactive: true,
    });
    expect(confirmStub).to.have.been.calledOnce;
    expect(updateStub).to.have.been.calledWith(
      PROJECT_ID,
      { trafficFilter: { templateOnly: true } },
      ["trafficFilter.templateOnly"],
    );
  });

  it("accepts a case-insensitive boolean value", async () => {
    await command.runner()("monitoring.state", "TRUE", { project: PROJECT_ID });
    expect(updateStub).to.have.been.calledWith(PROJECT_ID, { telemetryConfig: { mode: "ALL" } }, [
      "telemetryConfig.mode",
    ]);
  });

  it("maps monitoring.state true to telemetryConfig.mode ALL", async () => {
    await command.runner()("monitoring.state", "true", { project: PROJECT_ID });
    expect(updateStub).to.have.been.calledWith(PROJECT_ID, { telemetryConfig: { mode: "ALL" } }, [
      "telemetryConfig.mode",
    ]);
  });

  it("maps monitoring.state false to telemetryConfig.mode NONE without prompting", async () => {
    await command.runner()("monitoring.state", "false", { project: PROJECT_ID });
    expect(confirmStub).to.not.have.been.called;
    expect(updateStub).to.have.been.calledWith(PROJECT_ID, { telemetryConfig: { mode: "NONE" } }, [
      "telemetryConfig.mode",
    ]);
  });

  it("maps a sample-rate percentage to a (0,1] sampling fraction", async () => {
    await command.runner()("monitoring.sample-rate-percentage", "50", { project: PROJECT_ID });
    expect(updateStub).to.have.been.calledWith(
      PROJECT_ID,
      { telemetryConfig: { samplingRate: 0.5 } },
      ["telemetryConfig.samplingRate"],
    );
  });

  it("rejects an out-of-range or non-integer sample rate", async () => {
    // "1e2", "0x32", and " 50 " all coerce to valid integers via Number(), so the
    // strict decimal check must reject them too.
    for (const bad of ["0", "101", "1.5", "abc", "1e2", "0x32", " 50 ", "50%"]) {
      await expect(
        command.runner()("monitoring.sample-rate-percentage", bad, { project: PROJECT_ID }),
      ).to.be.rejectedWith(FirebaseError, /integer in the range 1-100/);
    }
    expect(updateStub).to.not.have.been.called;
  });

  it("normalizes a zero-padded sample rate in the echoed value", async () => {
    expect(
      await command.runner()("monitoring.sample-rate-percentage", "007", { project: PROJECT_ID }),
    ).to.deep.equal({ path: "monitoring.sample-rate-percentage", value: "7" });
    expect(updateStub).to.have.been.calledWith(
      PROJECT_ID,
      { telemetryConfig: { samplingRate: 0.07 } },
      ["telemetryConfig.samplingRate"],
    );
  });

  it("returns the normalized value for --json output", async () => {
    expect(
      await command.runner()("monitoring.state", "TRUE", { project: PROJECT_ID }),
    ).to.deep.equal({ path: "monitoring.state", value: "true" });
  });
});
