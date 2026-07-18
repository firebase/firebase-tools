import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-templates-delete";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:templates:delete", () => {
  let getStub: sinon.SinonStub;
  let deleteStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    getStub = sinon.stub(ailogic, "getTemplate").resolves({ name: "welcome", templateString: "x" });
    deleteStub = sinon.stub(ailogic, "deleteTemplate").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => sinon.restore());

  it("maps a 404 to a friendly 'does not exist' error", async () => {
    getStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(command.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
    expect(deleteStub).to.not.have.been.called;
  });

  it("refuses to delete a locked template, even with --force", async () => {
    getStub.resolves({ name: "welcome", templateString: "x", locked: true });
    await expect(
      command.runner()("welcome", { project: PROJECT_ID, force: true }),
    ).to.be.rejectedWith(FirebaseError, /locked/);
    expect(deleteStub).to.not.have.been.called;
  });

  it("deletes after confirmation", async () => {
    await command.runner()("welcome", { project: PROJECT_ID, interactive: true });
    expect(confirmStub).to.have.been.calledOnce;
    expect(deleteStub).to.have.been.calledWith(PROJECT_ID, ailogic.GLOBAL_LOCATION, "welcome");
  });

  it("aborts when confirmation is declined", async () => {
    confirmStub.resolves(false);
    await expect(
      command.runner()("welcome", { project: PROJECT_ID, interactive: true }),
    ).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(deleteStub).to.not.have.been.called;
  });
});
