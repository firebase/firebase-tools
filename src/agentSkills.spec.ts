import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as utils from "./utils";
import * as prompt from "./prompt";
import { promptForAgentSkills, installAgentSkills } from "./agentSkills";

describe("agentSkills", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("promptForAgentSkills", () => {
    it("should return true if user confirms", async () => {
      sandbox.stub(prompt, "confirm").resolves(true);
      const result = await promptForAgentSkills();
      expect(result).to.be.true;
    });

    it("should return false if user declines", async () => {
      sandbox.stub(prompt, "confirm").resolves(false);
      const result = await promptForAgentSkills();
      expect(result).to.be.false;
    });
  });

  describe("installAgentSkills", () => {
    let testRoot: string;

    beforeEach(() => {
      testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-skills-test-"));
    });

    afterEach(() => {
      fs.rmSync(testRoot, { recursive: true, force: true });
    });

    it("should install skills locally and create .agents directory", async () => {
      await installAgentSkills({ cwd: testRoot });

      const agentsDir = path.join(testRoot, ".agents");
      const skillsDir = path.join(agentsDir, "skills");
      const lockFile = path.join(testRoot, "skills-lock.json");

      expect(fs.existsSync(agentsDir), "Expected .agents directory to exist").to.be.true;
      expect(fs.existsSync(skillsDir), "Expected .agents/skills directory to exist").to.be.true;
      expect(fs.existsSync(lockFile), "Expected skills-lock.json to exist").to.be.true;

      // Check if at least one skill was installed (e.g., firebase-basics)
      const skills = fs.readdirSync(skillsDir);
      expect(skills.length).to.be.greaterThan(0);
      expect(skills).to.include("firebase-basics");
    }).timeout(60000);

    it("should skip if npx is not available", async () => {
      sandbox.stub(utils, "commandExistsSync").withArgs("npx").returns(false);

      await installAgentSkills({ cwd: testRoot });

      expect(fs.existsSync(path.join(testRoot, ".agents"))).to.be.false;
    });
  });
});
