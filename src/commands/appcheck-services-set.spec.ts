import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./appcheck-services-set";
import * as appcheck from "../gcp/appcheck";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("appcheck:services:set", () => {
  let setStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(appcheck, "ensureAppCheckApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    setStub = sinon.stub(appcheck, "setServiceEnforcement").resolves({
      serviceId: "firestore.googleapis.com",
      alias: "firestore",
      enforcement: "enforced",
    });
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("sets a relaxed mode without prompting", async () => {
    await command.runner()("firestore", "off", { project: PROJECT_ID });
    expect(confirmStub).to.not.have.been.called;
    expect(setStub).to.have.been.calledWith(PROJECT_ID, "firestore", "off");
  });

  it("prompts before enforcing", async () => {
    await command.runner()("firestore", "enforced", { project: PROJECT_ID, interactive: true });
    expect(confirmStub).to.have.been.calledOnce;
    expect(setStub).to.have.been.calledWith(PROJECT_ID, "firestore", "enforced");
  });

  it("aborts when the enforce confirmation is declined", async () => {
    confirmStub.resolves(false);
    await expect(
      command.runner()("firestore", "enforced", { project: PROJECT_ID, interactive: true }),
    ).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(setStub).to.not.have.been.called;
  });

  it("errors in non-interactive mode without --force when enforcing", async () => {
    await expect(
      command.runner()("firestore", "enforced", { project: PROJECT_ID, nonInteractive: true }),
    ).to.be.rejectedWith(FirebaseError, /requires confirmation/);
    expect(setStub).to.not.have.been.called;
  });

  it("prompts before RELAXING AI Logic, the auto-enforced service", async () => {
    await command.runner()("ailogic", "unenforced", { project: PROJECT_ID, interactive: true });
    expect(confirmStub).to.have.been.calledOnce;
    expect(setStub).to.have.been.calledWith(PROJECT_ID, "ailogic", "unenforced");
  });

  it("does not prompt when relaxing a normal service", async () => {
    await command.runner()("firestore", "unenforced", { project: PROJECT_ID });
    expect(confirmStub).to.not.have.been.called;
  });

  it("throws on an unknown service", async () => {
    await expect(
      command.runner()("firestor", "enforced", { project: PROJECT_ID }),
    ).to.be.rejectedWith(FirebaseError, /Unknown service/);
  });

  it("throws on an unknown mode", async () => {
    await expect(command.runner()("firestore", "on", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /Unknown enforcement mode/,
    );
  });
});
