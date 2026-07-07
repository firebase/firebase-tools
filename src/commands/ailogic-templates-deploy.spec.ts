import { expect } from "chai";
import * as sinon from "sinon";
import { command } from "./ailogic-templates-deploy";
import * as ailogic from "../gcp/ailogic";
import { logger } from "../logger";
import { FirebaseError } from "../error";
import * as fs from "fs";
import * as prompt from "../prompt";

describe("ailogic:templates:deploy", () => {
  const sandbox = sinon.createSandbox();
  let listTemplatesStub: sinon.SinonStub;
  let updateTemplateStub: sinon.SinonStub;
  let deleteTemplateStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let existsSyncStub: sinon.SinonStub;
  let statSyncStub: sinon.SinonStub;
  let readdirSyncStub: sinon.SinonStub;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach(() => {
    listTemplatesStub = sandbox.stub(ailogic, "listTemplates");
    updateTemplateStub = sandbox.stub(ailogic, "updateTemplate");
    deleteTemplateStub = sandbox.stub(ailogic, "deleteTemplate");
    sandbox.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    confirmStub = sandbox.stub(prompt, "confirm");
    existsSyncStub = sandbox.stub(fs, "existsSync");
    statSyncStub = sandbox.stub(fs, "statSync");
    readdirSyncStub = sandbox.stub(fs, "readdirSync");
    readFileSyncStub = sandbox.stub(fs, "readFileSync");
    sandbox.stub(logger, "info");
  });

  afterEach(() => {
    sandbox.restore();
  });

  it("should fail if validation of a prompt file fails", async () => {
    const options = { project: "test-project", dir: "prompts" };
    existsSyncStub.returns(true);
    statSyncStub.returns({ isDirectory: () => true });
    readdirSyncStub.returns(["t1.prompt", "t2.prompt"]);
    readFileSyncStub.onFirstCall().returns(""); // empty file -> invalid
    readFileSyncStub.onSecondCall().returns("---\nmodel: test\n---\nbody"); // valid

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      "The following prompt files failed validation:\n  t1.prompt: File is empty.",
    );

    expect(updateTemplateStub).to.not.be.called;
  });

  it("should fail if local file targets a locked remote template", async () => {
    const options = { project: "test-project", dir: "prompts" };
    existsSyncStub.returns(true);
    statSyncStub.returns({ isDirectory: () => true });
    readdirSyncStub.returns(["welcome.prompt"]);
    readFileSyncStub.returns("welcome body");

    // Remote template exists and is locked
    listTemplatesStub.resolves([
      {
        name: "projects/test-project/locations/global/templates/welcome",
        templateString: "old content",
        locked: true,
      },
    ]);

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      "The following templates are locked and cannot be updated or deleted:\n\n  welcome\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.",
    );

    expect(updateTemplateStub).to.not.be.called;
  });

  it("should deploy templates successfully", async () => {
    const options = { project: "test-project", dir: "prompts" };
    existsSyncStub.returns(true);
    statSyncStub.returns({ isDirectory: () => true });
    readdirSyncStub.returns(["welcome.prompt"]);
    readFileSyncStub.returns("welcome body");

    listTemplatesStub.resolves([]);
    updateTemplateStub.resolves({});

    await command.runner()(options);

    expect(updateTemplateStub).to.have.been.calledOnceWith("test-project", "global", "welcome", {
      templateString: "welcome body",
      displayName: "welcome",
    });
  });

  it("should prune templates successfully after confirmation", async () => {
    const options = { project: "test-project", dir: "prompts", prune: true };
    existsSyncStub.returns(true);
    statSyncStub.returns({ isDirectory: () => true });
    readdirSyncStub.returns(["welcome.prompt"]);
    readFileSyncStub.returns("welcome body");

    // remote has welcome and stale-template
    listTemplatesStub.resolves([
      {
        name: "projects/test-project/locations/global/templates/welcome",
        templateString: "old content",
        locked: false,
      },
      {
        name: "projects/test-project/locations/global/templates/stale-template",
        templateString: "stale content",
        locked: false,
      },
    ]);

    updateTemplateStub.resolves({});
    deleteTemplateStub.resolves({});
    confirmStub.resolves(true); // User confirms pruning

    await command.runner()(options);

    expect(updateTemplateStub).to.have.been.calledOnceWith("test-project", "global", "welcome", {
      templateString: "welcome body",
      displayName: "welcome",
    });
    expect(deleteTemplateStub).to.have.been.calledOnceWith(
      "test-project",
      "global",
      "stale-template",
    );
  });

  it("should fail prune if stale remote template is locked", async () => {
    const options = { project: "test-project", dir: "prompts", prune: true };
    existsSyncStub.returns(true);
    statSyncStub.returns({ isDirectory: () => true });
    readdirSyncStub.returns(["welcome.prompt"]);
    readFileSyncStub.returns("welcome body");

    // stale template is locked
    listTemplatesStub.resolves([
      {
        name: "projects/test-project/locations/global/templates/welcome",
        templateString: "old content",
        locked: false,
      },
      {
        name: "projects/test-project/locations/global/templates/stale-template",
        templateString: "stale content",
        locked: true,
      },
    ]);

    await expect(command.runner()(options)).to.be.rejectedWith(
      FirebaseError,
      "The following templates are locked and cannot be updated or deleted:\n\n  stale-template\n\nUnlock them by running:\n\n  firebase ailogic:templates:unlock <templateId>\n\nThen deploy again. No templates were deployed.",
    );

    expect(updateTemplateStub).to.not.be.called;
    expect(deleteTemplateStub).to.not.be.called;
  });
});
