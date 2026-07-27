import { expect } from "chai";
import * as sinon from "sinon";

import * as fsutils from "../fsutils";
import { Template } from "../gcp/ailogic";
import { planTemplateDeploy, readPromptDirectory, validatePromptFile } from "./templates";

function remote(id: string, locked = false): Template {
  return { name: `projects/p/locations/global/templates/${id}`, templateString: id, locked };
}

describe("ailogic templates", () => {
  describe("validatePromptFile", () => {
    it("rejects an empty file", () => {
      expect(validatePromptFile("")).to.match(/empty/);
      expect(validatePromptFile("  \n ")).to.match(/empty/);
    });

    it("accepts a body with no frontmatter", () => {
      expect(validatePromptFile("Just a prompt body.")).to.be.null;
    });

    it("accepts valid frontmatter plus body", () => {
      expect(validatePromptFile("---\nmodel: gemini\n---\nbody")).to.be.null;
    });

    it("accepts empty frontmatter and CRLF line endings", () => {
      expect(validatePromptFile("---\n---\nbody")).to.be.null;
      expect(validatePromptFile("---\r\nmodel: gemini\r\n---\r\nbody")).to.be.null;
    });

    it("rejects unterminated frontmatter", () => {
      expect(validatePromptFile("---\nmodel: gemini\nbody")).to.match(/not closed/);
      expect(validatePromptFile("---")).to.match(/not closed/);
    });

    it("does not mistake '---' inside a quoted YAML value for the delimiter", () => {
      expect(validatePromptFile('---\nkey: "a --- b"\n---\nbody')).to.be.null;
    });

    it("does not mistake '---' in the body for a delimiter", () => {
      expect(validatePromptFile("---\nmodel: gemini\n---\nintro\n---\nmore body")).to.be.null;
    });

    it("rejects invalid YAML and non-mapping frontmatter", () => {
      expect(validatePromptFile("---\nkey: [unclosed\n---\nbody")).to.match(/Invalid YAML/);
      expect(validatePromptFile("---\njust a string\n---\nbody")).to.match(/YAML mapping/);
    });
  });

  describe("readPromptDirectory", () => {
    afterEach(() => sinon.restore());

    function stubDir(files: Record<string, string | null>): void {
      // null content marks a directory-like entry (not a regular file).
      sinon.stub(fsutils, "listFiles").returns(Object.keys(files));
      sinon
        .stub(fsutils, "fileExistsSync")
        .callsFake((p: string) => files[p.split("/").pop() ?? ""] !== null);
      sinon.stub(fsutils, "readFile").callsFake((p: string) => {
        const content = files[p.split("/").pop() ?? ""];
        if (content === null || content === undefined) {
          throw new Error("unexpected read");
        }
        return content;
      });
    }

    it("collects templates and reports every error in one pass", () => {
      stubDir({
        "welcome.prompt": "hello",
        "empty.prompt": "",
        "bad id.prompt": "body",
        "folder.prompt": null,
        "notes.txt": "ignored",
      });

      const result = readPromptDirectory("prompts");

      expect([...result.templates.keys()]).to.deep.equal(["welcome"]);
      expect(result.errors.map((e) => e.file).sort()).to.deep.equal([
        "bad id.prompt",
        "empty.prompt",
        "folder.prompt",
      ]);
    });

    it("rejects a file named exactly '.prompt' (empty template id)", () => {
      stubDir({ ".prompt": "body" });
      const result = readPromptDirectory("prompts");
      expect(result.templates.size).to.equal(0);
      expect(result.errors[0].error).to.match(/valid template id/);
    });

    it("matches the extension case-insensitively, preserving the id's case", () => {
      stubDir({ "Upper.PROMPT": "body" });
      const result = readPromptDirectory("prompts");
      expect([...result.templates.keys()]).to.deep.equal(["Upper"]);
      expect(result.errors).to.deep.equal([]);
    });
  });

  describe("planTemplateDeploy", () => {
    const local = new Map([
      ["welcome", "hello"],
      ["fresh", "new"],
    ]);

    it("splits creates and updates", () => {
      const plan = planTemplateDeploy(local, [remote("welcome")], false);
      expect(plan).to.deep.equal({
        creates: ["fresh"],
        updates: ["welcome"],
        deletes: [],
        lockedViolations: [],
      });
    });

    it("flags a locked update target as a violation, not an update", () => {
      const plan = planTemplateDeploy(local, [remote("welcome", true)], false);
      expect(plan.updates).to.deep.equal([]);
      expect(plan.lockedViolations).to.deep.equal(["welcome"]);
    });

    it("prunes unlocked remote-only templates and flags locked ones", () => {
      const plan = planTemplateDeploy(local, [remote("stale"), remote("guarded", true)], true);
      expect(plan.deletes).to.deep.equal(["stale"]);
      expect(plan.lockedViolations).to.deep.equal(["guarded"]);
    });

    it("does not delete anything without prune", () => {
      const plan = planTemplateDeploy(local, [remote("stale")], false);
      expect(plan.deletes).to.deep.equal([]);
      expect(plan.lockedViolations).to.deep.equal([]);
    });
  });
});
