import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-templates-get";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:templates:get", () => {
  let getStub: sinon.SinonStub;
  let enabledStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(logger, "info");
    enabledStub = sinon.stub(ailogic, "isAILogicApiEnabled").resolves(true);
    getStub = sinon.stub(ailogic, "getTemplate");
  });

  afterEach(() => sinon.restore());

  it("returns early when AI Logic is not enabled", async () => {
    enabledStub.resolves(false);
    expect(await command.runner()("welcome", { project: PROJECT_ID })).to.be.undefined;
    expect(getStub).to.not.have.been.called;
  });

  it("returns the template", async () => {
    const template = { name: "welcome", templateString: "hello" };
    getStub.resolves(template);
    expect(await command.runner()("welcome", { project: PROJECT_ID })).to.deep.equal(template);
  });

  it("maps a 404 to a friendly 'does not exist' error", async () => {
    getStub.rejects(new FirebaseError("not found", { status: 404 }));
    await expect(command.runner()("missing", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /does not exist/,
    );
  });
});
