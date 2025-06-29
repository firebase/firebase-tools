import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import { PromptLoader } from "./loader";

describe("PromptLoader", () => {
  let sandbox: sinon.SinonSandbox;
  let promptLoader: PromptLoader;
  const rootDir = "/test-root";

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    promptLoader = new PromptLoader(rootDir);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("loadConfig", () => {
    it("should load impromptu.json if it exists", async () => {
      const config = {
        agents: ["gemini", "claude"],
        defaultScorers: ["GoldenFileScorer"],
        prompts: {},
      };
      
      sandbox.stub(fs, "pathExists").resolves(true);
      sandbox.stub(fs, "readFile").resolves(JSON.stringify(config) as any);
      
      const result = await promptLoader.loadConfig();
      
      expect(result).to.deep.equal(config);
    });

    it("should return default config if impromptu.json doesn't exist", async () => {
      sandbox.stub(fs, "pathExists").resolves(false);
      
      const result = await promptLoader.loadConfig();
      
      expect(result.agents).to.deep.equal(["gemini", "claude"]);
      expect(result.defaultScorers).to.deep.equal(["GoldenFileScorer", "BuildTestScorer"]);
    });
  });

  describe("loadPrompt", () => {
    it("should load a prompt with all required files", async () => {
      const pathExistsStub = sandbox.stub(fs, "pathExists");
      pathExistsStub.resolves(true);
      
      const readFileStub = sandbox.stub(fs, "readFile");
      readFileStub.resolves("Default content" as any);
      readFileStub.withArgs(path.join(rootDir, "prompts/test-prompt/system.md"))
        .resolves("System prompt content" as any);
      readFileStub.withArgs(path.join(rootDir, "prompts/test-prompt/user.md"))
        .resolves("User prompt content" as any);
      
      const prompt = await promptLoader.loadPrompt("test-prompt");
      
      expect(prompt.id).to.equal("test-prompt");
      expect(prompt.systemPrompt).to.equal("System prompt content");
      expect(prompt.userPrompt).to.equal("User prompt content");
      expect(prompt.cases).to.have.length(1);
      expect(prompt.cases[0].id).to.equal("default");
    });

    it("should throw error if required files are missing", async () => {
      sandbox.stub(fs, "pathExists").resolves(false);
      
      try {
        await promptLoader.loadPrompt("test-prompt");
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("Required file not found");
      }
    });
  });

  describe("loadAllPrompts", () => {
    it("should discover and load all prompts", async () => {
      sandbox.stub(fs, "pathExists").resolves(true);
      
      sandbox.stub(fs, "readdir").resolves([
        { name: "prompt1", isDirectory: () => true },
        { name: "prompt2", isDirectory: () => true },
        { name: "readme.md", isDirectory: () => false },
      ] as any);
      
      // Mock loadPrompt to return simple prompts
      sandbox.stub(promptLoader as any, "loadPrompt")
        .onFirstCall().resolves({ id: "prompt1", cases: [] })
        .onSecondCall().resolves({ id: "prompt2", cases: [] });
      
      const prompts = await promptLoader.loadAllPrompts();
      
      expect(prompts).to.have.length(2);
      expect(prompts[0].id).to.equal("prompt1");
      expect(prompts[1].id).to.equal("prompt2");
    });

    it("should throw error if prompts directory doesn't exist", async () => {
      sandbox.stub(fs, "pathExists").resolves(false);
      
      try {
        await promptLoader.loadAllPrompts();
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("Prompts directory not found");
      }
    });
  });
});