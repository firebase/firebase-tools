import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./appcheck-debug-delete";
import * as appcheck from "../gcp/appcheck";
import * as projectUtils from "../projectUtils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";
const APP_ID = "1:1234:web:abcd";

describe("appcheck:debug:delete", () => {
  let deleteStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(appcheck, "ensureAppCheckApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    deleteStub = sinon.stub(appcheck, "deleteDebugToken").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => {
    sinon.restore();
  });

  it("deletes after confirmation", async () => {
    await command.runner()(APP_ID, "tok1", { project: PROJECT_ID, interactive: true });
    expect(confirmStub).to.have.been.calledOnce;
    expect(deleteStub).to.have.been.calledWith(PROJECT_ID, APP_ID, "tok1");
  });

  it("aborts when confirmation is declined", async () => {
    confirmStub.resolves(false);
    await expect(
      command.runner()(APP_ID, "tok1", { project: PROJECT_ID, interactive: true }),
    ).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(deleteStub).to.not.have.been.called;
  });

  it("errors in non-interactive mode without --force", async () => {
    await expect(
      command.runner()(APP_ID, "tok1", { project: PROJECT_ID, nonInteractive: true }),
    ).to.be.rejectedWith(FirebaseError, /requires confirmation/);
    expect(deleteStub).to.not.have.been.called;
  });
});
