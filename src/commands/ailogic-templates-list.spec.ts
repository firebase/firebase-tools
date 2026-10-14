import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-templates-list";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import { logger } from "../logger";

const PROJECT_ID = "test-project";

describe("ailogic:templates:list", () => {
  let listStub: sinon.SinonStub;
  let enabledStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(logger, "info");
    enabledStub = sinon.stub(ailogic, "isAILogicApiEnabled").resolves(true);
    listStub = sinon.stub(ailogic, "listTemplates").resolves([]);
  });

  afterEach(() => sinon.restore());

  it("returns [] and does not call the API when AI Logic is not enabled", async () => {
    enabledStub.resolves(false);
    expect(await command.runner()({ project: PROJECT_ID })).to.deep.equal([]);
    expect(listStub).to.not.have.been.called;
  });

  it("returns [] when there are no templates", async () => {
    expect(await command.runner()({ project: PROJECT_ID })).to.deep.equal([]);
  });

  it("returns the templates when present", async () => {
    const templates = [
      { name: "projects/p/locations/global/templates/welcome", templateString: "hi", locked: true },
    ];
    listStub.resolves(templates);
    expect(await command.runner()({ project: PROJECT_ID })).to.deep.equal(templates);
  });

  it("strips CRLF line endings from the preview so \\r cannot garble the table", async () => {
    listStub.resolves([
      {
        name: "projects/p/locations/global/templates/crlf",
        templateString: "line one\r\nline two",
      },
    ]);

    await command.runner()({ project: PROJECT_ID });

    const tableOutput = (logger.info as sinon.SinonStub).args.map((a) => a.join(" ")).join("\n");
    expect(tableOutput).to.include("line one line two");
    expect(tableOutput).to.not.match(/\r/);
  });
});
