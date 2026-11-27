import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as sinon from "sinon";

import * as prompt from "../../prompt";
import * as ailogic from "../../gcp/ailogic";
import { FirebaseError } from "../../error";
import { prepare } from "./prepare";
import { release, AiLogicDeployContext } from "./release";
import { DeployOptions } from "..";

const PROJECT_ID = "test-project";

function remoteTemplate(id: string, overrides: Partial<ailogic.Template> = {}): ailogic.Template {
  return {
    name: `projects/${PROJECT_ID}/locations/global/templates/${id}`,
    templateString: `${id} content`,
    ...overrides,
  };
}

describe("deploy ailogic", () => {
  let dir: string;
  let listTemplatesStub: sinon.SinonStub;
  let updateTemplateStub: sinon.SinonStub;
  let deleteTemplateStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;

  // A minimal stand-in for the pieces of Options that prepare/release touch.
  function makeOptions(overrides: Record<string, unknown> = {}): DeployOptions {
    return {
      project: PROJECT_ID,
      force: false,
      nonInteractive: false,
      config: {
        src: { ailogic: { templates: "prompts" } },
        path: (p: string) => path.join(dir, p),
      },
      ...overrides,
    } as unknown as DeployOptions;
  }

  function writePrompt(rel: string, content: string): void {
    const abs = path.join(dir, "prompts", rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "ailogic-deploy-"));
    fs.mkdirSync(path.join(dir, "prompts"));
    sinon.stub(ailogic, "ensureAILogicApiEnabled").resolves();
    listTemplatesStub = sinon.stub(ailogic, "listTemplates").resolves([]);
    updateTemplateStub = sinon.stub(ailogic, "updateTemplate").resolves(remoteTemplate("x"));
    deleteTemplateStub = sinon.stub(ailogic, "deleteTemplate").resolves();
    confirmStub = sinon.stub(prompt, "confirm").resolves(true);
  });

  afterEach(() => {
    sinon.restore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function run(options = makeOptions()): Promise<AiLogicDeployContext> {
    const context: AiLogicDeployContext = { projectId: PROJECT_ID };
    await prepare(context, options);
    await release(context, options);
    return context;
  }

  it("creates, updates with etags, and skips unchanged templates", async () => {
    writePrompt("fresh.prompt", "fresh body");
    writePrompt("changed.prompt", "new body");
    writePrompt("same.prompt", "same content");
    listTemplatesStub.resolves([
      remoteTemplate("changed", { etag: "etag-c" }),
      remoteTemplate("same", { templateString: "same content" }),
    ]);

    await run();

    expect(updateTemplateStub).to.have.been.calledTwice;
    expect(updateTemplateStub).to.have.been.calledWith(PROJECT_ID, "fresh", {
      templateString: "fresh body",
      displayName: "fresh",
    });
    expect(updateTemplateStub).to.have.been.calledWith(
      PROJECT_ID,
      "changed",
      { templateString: "new body", etag: "etag-c" },
      ["templateString"],
    );
    expect(deleteTemplateStub).to.not.have.been.called;
  });

  it("deploys nested files under dotted ids", async () => {
    writePrompt("agents/support.prompt", "support body");

    await run();

    expect(updateTemplateStub).to.have.been.calledWith(PROJECT_ID, "agents.support", {
      templateString: "support body",
      displayName: "agents.support",
    });
  });

  it("deletes remote templates whose files were removed, after confirmation", async () => {
    writePrompt("keep.prompt", "keep body");
    listTemplatesStub.resolves([
      remoteTemplate("keep", { templateString: "keep body" }),
      remoteTemplate("stale", { etag: "etag-s" }),
    ]);

    await run();

    expect(confirmStub).to.have.been.calledOnce;
    expect(deleteTemplateStub).to.have.been.calledOnceWith(PROJECT_ID, "stale", "etag-s");
  });

  it("aborts before any write when the prune confirmation is declined", async () => {
    writePrompt("keep.prompt", "keep body");
    listTemplatesStub.resolves([remoteTemplate("stale")]);
    confirmStub.resolves(false);

    await expect(run()).to.be.rejectedWith(FirebaseError, /aborted/i);
    expect(updateTemplateStub).to.not.have.been.called;
    expect(deleteTemplateStub).to.not.have.been.called;
  });

  it("refuses to treat an empty directory as delete-everything", async () => {
    listTemplatesStub.resolves([remoteTemplate("survivor")]);

    await run();

    expect(confirmStub).to.not.have.been.called;
    expect(deleteTemplateStub).to.not.have.been.called;
  });

  it("blocks the whole deploy when a locked template would be changed", async () => {
    writePrompt("guarded.prompt", "new body");
    listTemplatesStub.resolves([remoteTemplate("guarded", { locked: true })]);

    await expect(run()).to.be.rejectedWith(FirebaseError, /locked/);
    expect(updateTemplateStub).to.not.have.been.called;
  });

  it("fails validation listing every bad file before any API call", async () => {
    writePrompt("empty.prompt", "");
    writePrompt("agents/x.prompt", "body");
    writePrompt("agents.x.prompt", "duplicate id");

    await expect(run()).to.be.rejectedWith(
      FirebaseError,
      /(?=[\s\S]*empty\.prompt)(?=[\s\S]*Duplicate template id)/,
    );
    expect(listTemplatesStub).to.not.have.been.called;
  });

  it("errors when the declared templates directory does not exist", async () => {
    fs.rmSync(path.join(dir, "prompts"), { recursive: true });
    await expect(run()).to.be.rejectedWith(FirebaseError, /does not exist/);
  });

  it("rejects unknown --only ailogic:<filter> values", async () => {
    await expect(run(makeOptions({ only: "ailogic:rules" }))).to.be.rejectedWith(
      FirebaseError,
      /Unknown AI Logic deploy filter/,
    );
  });

  it("runs for --only ailogic:templates and bare --only ailogic", async () => {
    writePrompt("welcome.prompt", "body");
    await run(makeOptions({ only: "ailogic:templates" }));
    await run(makeOptions({ only: "hosting,ailogic" }));
    expect(updateTemplateStub).to.have.been.calledTwice;
  });

  it("maps a mid-deploy etag conflict (409) to a re-run message", async () => {
    writePrompt("changed.prompt", "new body");
    listTemplatesStub.resolves([remoteTemplate("changed", { etag: "etag-c" })]);
    updateTemplateStub.rejects(new FirebaseError("aborted", { status: 409 }));

    await expect(run()).to.be.rejectedWith(FirebaseError, /modified while deploying/);
  });

  it("tolerates a template already deleted concurrently during prune (404)", async () => {
    writePrompt("keep.prompt", "keep body");
    listTemplatesStub.resolves([
      remoteTemplate("keep", { templateString: "keep body" }),
      remoteTemplate("gone"),
      remoteTemplate("stale"),
    ]);
    deleteTemplateStub
      .withArgs(PROJECT_ID, "gone")
      .rejects(new FirebaseError("not found", { status: 404 }));

    await run(makeOptions({ force: true }));

    expect(deleteTemplateStub).to.have.been.calledTwice;
  });
});
