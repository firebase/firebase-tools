import { expect } from "chai";
import * as path from "path";
import * as sinon from "sinon";

import { command } from "./ailogic-templates-deploy";
import * as detectProjectRootModule from "../detectProjectRoot";
import * as ailogic from "../gcp/ailogic";
import * as fsutils from "../fsutils";
import * as prompt from "../prompt";
import * as utils from "../utils";
import { logger } from "../logger";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

function remoteTemplate(id: string, locked = false): ailogic.Template {
  return {
    name: `projects/${PROJECT_ID}/locations/global/templates/${id}`,
    templateString: `${id} content`,
    locked,
  };
}

describe("ailogic:templates:deploy", () => {
  let listTemplatesStub: sinon.SinonStub;
  let updateTemplateStub: sinon.SinonStub;
  let deleteTemplateStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let dirExistsStub: sinon.SinonStub;
  let listFilesStub: sinon.SinonStub;
  let fileExistsStub: sinon.SinonStub;
  let readFileStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    sinon.stub(utils, "logSuccess");
    logWarningStub = sinon.stub(utils, "logWarning");
    sinon.stub(logger, "info");
    listTemplatesStub = sinon.stub(ailogic, "listTemplates").resolves([]);
    updateTemplateStub = sinon.stub(ailogic, "updateTemplate").resolves(remoteTemplate("x"));
    deleteTemplateStub = sinon.stub(ailogic, "deleteTemplate").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
    dirExistsStub = sinon.stub(fsutils, "dirExistsSync").returns(true);
    listFilesStub = sinon.stub(fsutils, "listFiles").returns([]);
    fileExistsStub = sinon.stub(fsutils, "fileExistsSync").returns(true);
    readFileStub = sinon.stub(fsutils, "readFile").returns("prompt body");
  });

  afterEach(() => sinon.restore());

  it("fails validation listing every bad file, before any API call", async () => {
    listFilesStub.returns(["good.prompt", "empty.prompt", "bad id.prompt"]);
    readFileStub.callsFake((p: string) => (p.endsWith("empty.prompt") ? "" : "body"));

    await expect(command.runner()({ project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /empty\.prompt[\s\S]*bad id\.prompt/,
    );
    expect(listTemplatesStub).to.not.have.been.called;
    expect(updateTemplateStub).to.not.have.been.called;
  });

  it("resolves the prompts directory against the project root, not the cwd", async () => {
    sinon.stub(detectProjectRootModule, "detectProjectRoot").returns("/my/project");
    await command.runner()({ project: PROJECT_ID, dir: "custom" });
    expect(dirExistsStub).to.have.been.calledWith(path.resolve("/my/project", "custom"));
  });

  it("errors when an explicit --dir does not exist, but no-ops on the default dir", async () => {
    dirExistsStub.returns(false);
    await expect(command.runner()({ project: PROJECT_ID, dir: "missing" })).to.be.rejectedWith(
      FirebaseError,
      /Directory does not exist/,
    );

    expect(await command.runner()({ project: PROJECT_ID })).to.deep.equal({
      deployed: [],
      pruned: [],
    });
  });

  it("creates new templates and updates existing ones", async () => {
    listFilesStub.returns(["welcome.prompt", "fresh.prompt"]);
    listTemplatesStub.resolves([remoteTemplate("welcome")]);

    expect(await command.runner()({ project: PROJECT_ID })).to.deep.equal({
      deployed: ["fresh", "welcome"],
      pruned: [],
    });
    expect(updateTemplateStub).to.have.been.calledTwice;
    expect(updateTemplateStub).to.have.been.calledWith(PROJECT_ID, "fresh", {
      templateString: "prompt body",
      displayName: "fresh",
    });
  });

  it("blocks the whole deploy when a locked template would be updated or pruned", async () => {
    listFilesStub.returns(["welcome.prompt"]);
    listTemplatesStub.resolves([remoteTemplate("welcome", true), remoteTemplate("stale", true)]);

    await expect(command.runner()({ project: PROJECT_ID, prune: true })).to.be.rejectedWith(
      FirebaseError,
      /locked[\s\S]*welcome[\s\S]*stale/,
    );
    expect(updateTemplateStub).to.not.have.been.called;
    expect(deleteTemplateStub).to.not.have.been.called;
  });

  it("prunes after confirmation and reports the result", async () => {
    listFilesStub.returns(["welcome.prompt"]);
    listTemplatesStub.resolves([remoteTemplate("welcome"), remoteTemplate("stale")]);

    expect(
      await command.runner()({ project: PROJECT_ID, prune: true, interactive: true }),
    ).to.deep.equal({ deployed: ["welcome"], pruned: ["stale"] });
    expect(confirmStub).to.have.been.calledOnce;
    expect(deleteTemplateStub).to.have.been.calledOnceWith(PROJECT_ID, "stale");
  });

  it("aborts the prune when confirmation is declined", async () => {
    listFilesStub.returns(["welcome.prompt"]);
    listTemplatesStub.resolves([remoteTemplate("stale")]);
    confirmStub.resolves(false);

    await expect(
      command.runner()({ project: PROJECT_ID, prune: true, interactive: true }),
    ).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(deleteTemplateStub).to.not.have.been.called;
  });

  it("passes force and nonInteractive through to confirm for the prune gate", async () => {
    listFilesStub.returns(["welcome.prompt"]);
    listTemplatesStub.resolves([remoteTemplate("stale")]);

    await command.runner()({ project: PROJECT_ID, prune: true, force: true });

    expect(confirmStub).to.have.been.calledWithMatch({ force: true });
    expect(deleteTemplateStub).to.have.been.calledOnceWith(PROJECT_ID, "stale");
  });

  it("skips prune with a warning when there are no local prompt files", async () => {
    listFilesStub.returns([]);
    expect(await command.runner()({ project: PROJECT_ID, prune: true })).to.deep.equal({
      deployed: [],
      pruned: [],
    });
    expect(logWarningStub).to.have.been.calledWithMatch(/--prune was ignored/);
    expect(listTemplatesStub).to.not.have.been.called;
  });

  it("reports a directory named like a prompt file instead of crashing", async () => {
    listFilesStub.returns(["welcome.prompt", "folder.prompt"]);
    fileExistsStub.callsFake((p: string) => !p.endsWith("folder.prompt"));

    await expect(command.runner()({ project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /folder\.prompt: Not a file/,
    );
  });
});
