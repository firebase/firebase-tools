import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

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
      // Arrays are typeof "object" but are not mappings.
      expect(validatePromptFile("---\n- a\n- b\n---\nbody")).to.match(/YAML mapping/);
    });
  });

  describe("readPromptDirectory", () => {
    let dir: string;

    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "ailogic-prompts-"));
    });

    afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

    // Writes real files/directories; null content marks a directory entry.
    function makeDir(files: Record<string, string | null>): void {
      for (const [rel, content] of Object.entries(files)) {
        const abs = path.join(dir, rel);
        if (content === null) {
          fs.mkdirSync(abs, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content);
        }
      }
    }

    it("collects templates and reports every error in one pass", () => {
      makeDir({
        "welcome.prompt": "hello",
        "empty.prompt": "",
        "bad id.prompt": "body",
        "folder.prompt": null,
        "notes.txt": "ignored",
      });

      const result = readPromptDirectory(dir);

      expect([...result.templates.keys()]).to.deep.equal(["welcome"]);
      expect(result.errors.map((e) => e.file).sort()).to.deep.equal([
        "bad id.prompt",
        "empty.prompt",
        "folder.prompt",
      ]);
    });

    it("rejects a file named exactly '.prompt' (empty template id)", () => {
      makeDir({ ".prompt": "body" });
      const result = readPromptDirectory(dir);
      expect(result.templates.size).to.equal(0);
      expect(result.errors[0].error).to.match(/valid template id/);
    });

    it("matches the extension case-insensitively, preserving the id's case", () => {
      makeDir({ "Upper.PROMPT": "body" });
      const result = readPromptDirectory(dir);
      expect([...result.templates.keys()]).to.deep.equal(["Upper"]);
      expect(result.errors).to.deep.equal([]);
    });

    it("reads subfolders recursively, flattening paths into dotted ids", () => {
      makeDir({
        "welcome.prompt": "hi",
        "agents/support.prompt": "support body",
        "agents/deep/triage.prompt": "triage body",
      });

      const result = readPromptDirectory(dir);

      expect([...result.templates.keys()].sort()).to.deep.equal([
        "agents.deep.triage",
        "agents.support",
        "welcome",
      ]);
      expect(result.errors).to.deep.equal([]);
    });

    it("reports a nested file colliding with a dotted flat file, naming both", () => {
      makeDir({
        "agents/support.prompt": "nested",
        "agents.support.prompt": "flat",
      });

      const result = readPromptDirectory(dir);

      expect(result.templates.size).to.equal(1);
      expect(result.errors).to.have.length(1);
      expect(result.errors[0].error).to.match(
        /Duplicate template id 'agents\.support' \(also from /,
      );
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
        unchanged: [],
        deletes: [],
        lockedViolations: [],
      });
    });

    it("skips templates whose content matches the remote", () => {
      // remote() uses the id as the templateString, so this local content matches.
      const matching = new Map([["welcome", "welcome"]]);
      const plan = planTemplateDeploy(matching, [remote("welcome")], false);
      expect(plan.unchanged).to.deep.equal(["welcome"]);
      expect(plan.updates).to.deep.equal([]);
    });

    it("does not flag a locked template as a violation when its content is unchanged", () => {
      const matching = new Map([["welcome", "welcome"]]);
      const plan = planTemplateDeploy(matching, [remote("welcome", true)], false);
      expect(plan.unchanged).to.deep.equal(["welcome"]);
      expect(plan.lockedViolations).to.deep.equal([]);
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
