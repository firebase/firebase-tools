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
  let lockStub: sinon.SinonStub;
  let unlockStub: sinon.SinonStub;

  beforeEach(() => {
    (lockCommand as unknown as { befores: unknown[] }).befores = [];
    (unlockCommand as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    lockStub = sinon.stub(ailogic, "lockTemplate").resolves();
    unlockStub = sinon.stub(ailogic, "unlockTemplate").resolves();
  });

  afterEach(() => sinon.restore());

  it("locks a template", async () => {
    await lockCommand.runner()("welcome", { project: PROJECT_ID });
    expect(lockStub).to.have.been.calledWith(PROJECT_ID, ailogic.GLOBAL_LOCATION, "welcome");
  });

  it("unlocks a template", async () => {
    await unlockCommand.runner()("welcome", { project: PROJECT_ID });
    expect(unlockStub).to.have.been.calledWith(PROJECT_ID, ailogic.GLOBAL_LOCATION, "welcome");
  });

  it("maps a 404 to a friendly 'does not exist' error on lock", async () => {
    lockStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(lockCommand.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
  });

  it("maps a 404 to a friendly 'does not exist' error on unlock", async () => {
    unlockStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(unlockCommand.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
  });
});
