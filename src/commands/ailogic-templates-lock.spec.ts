import { expect } from "chai";
import * as sinon from "sinon";

import { command as lockCommand } from "./ailogic-templates-lock";
import { command as unlockCommand } from "./ailogic-templates-unlock";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:templates:lock / unlock", () => {
  let setLockedStub: sinon.SinonStub;

  beforeEach(() => {
    (lockCommand as unknown as { befores: unknown[] }).befores = [];
    (unlockCommand as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    setLockedStub = sinon.stub(ailogic, "setTemplateLocked").resolves();
  });

  afterEach(() => sinon.restore());

  it("locks a template and reports the new state", async () => {
    expect(await lockCommand.runner()("welcome", { project: PROJECT_ID })).to.deep.equal({
      templateId: "welcome",
      locked: true,
    });
    expect(setLockedStub).to.have.been.calledWith(PROJECT_ID, "welcome", true);
  });

  it("unlocks a template and reports the new state", async () => {
    expect(await unlockCommand.runner()("welcome", { project: PROJECT_ID })).to.deep.equal({
      templateId: "welcome",
      locked: false,
    });
    expect(setLockedStub).to.have.been.calledWith(PROJECT_ID, "welcome", false);
  });

  it("maps a 404 to a friendly 'does not exist' error on lock", async () => {
    setLockedStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(lockCommand.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
  });

  it("maps a 404 to a friendly 'does not exist' error on unlock", async () => {
    setLockedStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(unlockCommand.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
  });
});
