import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";

import * as prompt from "../../../prompt";
import { Config } from "../../../config";
import {
  generatePromptSection,
  generateFeaturePromptSection,
  updateFirebaseSection,
  replaceFirebaseFile,
  getFeatureContent,
} from "./promptUpdater";

describe("promptUpdater", () => {
  let sandbox: sinon.SinonSandbox;
  let mockConfig: Config;
  let readFileSyncStub: sinon.SinonStub;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    mockConfig = {
      projectDir: "/test/project",
      readProjectFile: sandbox.stub(),
      writeProjectFile: sandbox.stub(),
    } as any;

    readFileSyncStub = sandbox.stub(fs, "readFileSync");
    readFileSyncStub.withArgs(sinon.match(/FIREBASE\.md$/)).returns(`# Firebase CLI Context

Base Firebase content`);
    readFileSyncStub.withArgs(sinon.match(/FIREBASE_FUNCTIONS\.md$/)).returns(`# Firebase Functions

Functions specific content`);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("generatePromptSection", () => {
    it("should generate content with base features only", () => {
      const result = generatePromptSection([]);

      expect(result.content).to.include("<firebase_prompts hash=");
      expect(result.content).to.include("# Firebase CLI Context");
      expect(result.content).to.include("Base Firebase content");
      expect(result.content).to.not.include("Functions specific content");
      expect(result.hash).to.have.lengthOf(8);
    });

    it("should include functions content when enabled", () => {
      const result = generatePromptSection(["functions"]);

      expect(result.content).to.include("<firebase_prompts hash=");
      expect(result.content).to.include("# Firebase CLI Context");
      expect(result.content).to.include("Base Firebase content");
      expect(result.content).to.include("# Firebase Functions");
      expect(result.content).to.include("Functions specific content");
    });

    it("should generate consistent hash for same content", () => {
      const result1 = generatePromptSection(["functions"]);
      const result2 = generatePromptSection(["functions"]);

      expect(result1.hash).to.equal(result2.hash);
    });

    it("should generate different hash for different content", () => {
      const result1 = generatePromptSection([]);
      const result2 = generatePromptSection(["functions"]);

      expect(result1.hash).to.not.equal(result2.hash);
    });

    it("should include raw prompt content without modification", () => {
      const result = generatePromptSection([]);

      expect(result.content).to.include("# Firebase CLI Context");
      expect(result.content).to.include("Base Firebase content");
    });

    it("should generate wrapper with custom content but hash from actual prompts", () => {
      const customContent = "Custom import statements";
      const result = generatePromptSection(["functions"], { customContent });

      expect(result.content).to.include(customContent);
      expect(result.content).to.include("<firebase_prompts hash=");
      expect(result.content).to.not.include("Base Firebase content");
      expect(result.content).to.not.include("Functions specific content");

      const normalResult = generatePromptSection(["functions"]);
      expect(result.hash).to.equal(normalResult.hash);
    });

    it("should generate same hash regardless of custom content", () => {
      const result1 = generatePromptSection(["functions"], { customContent: "Content 1" });
      const result2 = generatePromptSection(["functions"], { customContent: "Content 2" });

      expect(result1.hash).to.equal(result2.hash);
    });
  });

  describe("updateFirebaseSection", () => {
    let sandbox: sinon.SinonSandbox;
    let confirmStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
      confirmStub = sandbox.stub(prompt, "confirm").resolves(false);
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should create new file when none exists", async () => {
      (mockConfig.readProjectFile as sinon.SinonStub).throws(new Error("File not found"));

      const result = await updateFirebaseSection(mockConfig, "test.md", []);

      expect(result.updated).to.be.true;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).calledOnce).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent).to.include("<firebase_prompts hash=");
      expect(writtenContent).to.include("Base Firebase content");
    });

    it("should add header when creating new file with header option", async () => {
      (mockConfig.readProjectFile as sinon.SinonStub).throws(new Error("File not found"));

      const result = await updateFirebaseSection(mockConfig, "test.md", [], {
        header: "# Custom Header",
      });

      expect(result.updated).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent.startsWith("# Custom Header\n\n<firebase_prompts")).to.be.true;
    });

    it("should not update when content hash matches", async () => {
      const { content } = generatePromptSection([]);
      (mockConfig.readProjectFile as sinon.SinonStub).returns(content);

      const result = await updateFirebaseSection(mockConfig, "test.md", []);

      expect(result.updated).to.be.false;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).called).to.be.false;
    });

    it("should update when content hash differs", async () => {
      const existingContent = `<firebase_prompts hash="oldhash123">
Old content
</firebase_prompts>`;
      (mockConfig.readProjectFile as sinon.SinonStub).returns(existingContent);

      const result = await updateFirebaseSection(mockConfig, "test.md", ["functions"]);

      expect(result.updated).to.be.true;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).calledOnce).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent).to.include("Functions specific content");
      expect(writtenContent).to.not.include("Old content");
    });

    it("should append to existing file without firebase section", async () => {
      const existingContent = "# User's existing content\n\nSome text";
      (mockConfig.readProjectFile as sinon.SinonStub).returns(existingContent);

      const result = await updateFirebaseSection(mockConfig, "test.md", []);

      expect(result.updated).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent.startsWith("# User's existing content")).to.be.true;
      expect(writtenContent).to.include("<firebase_prompts hash=");
    });

    it("should preserve user content when updating", async () => {
      const existingContent = `# User header
Some user content

<firebase_prompts hash="oldhash">
Old Firebase content
</firebase_prompts>

More user content`;
      (mockConfig.readProjectFile as sinon.SinonStub).returns(existingContent);

      const result = await updateFirebaseSection(mockConfig, "test.md", []);

      expect(result.updated).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent).to.include("# User header");
      expect(writtenContent).to.include("Some user content");
      expect(writtenContent).to.include("More user content");
      expect(writtenContent).to.include("Base Firebase content");
      expect(writtenContent).to.not.include("Old Firebase content");
    });

    it("should skip update when interactive and user declines", async () => {
      const existingContent = `<firebase_prompts hash="oldhash">Old</firebase_prompts>`;
      (mockConfig.readProjectFile as sinon.SinonStub).returns(existingContent);

      // Mock the confirm prompt to return false

      const result = await updateFirebaseSection(mockConfig, "test.md", [], {
        interactive: true,
      });

      expect(result.updated).to.be.false;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).called).to.be.false;
      expect(confirmStub).to.have.been.calledOnce;
    });
  });

  describe("replaceFirebaseFile", () => {
    it("should create new file when none exists", async () => {
      (mockConfig.readProjectFile as sinon.SinonStub).throws(new Error("File not found"));

      const result = await replaceFirebaseFile(mockConfig, "test.md", "New content");

      expect(result.updated).to.be.true;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).calledWith("test.md", "New content"))
        .to.be.true;
    });

    it("should not update when content is identical", async () => {
      (mockConfig.readProjectFile as sinon.SinonStub).returns("Existing content");

      const result = await replaceFirebaseFile(mockConfig, "test.md", "Existing content");

      expect(result.updated).to.be.false;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).called).to.be.false;
    });

    it("should update when content differs", async () => {
      (mockConfig.readProjectFile as sinon.SinonStub).returns("Old content");

      const result = await replaceFirebaseFile(mockConfig, "test.md", "New content");

      expect(result.updated).to.be.true;
      expect((mockConfig.writeProjectFile as sinon.SinonStub).calledWith("test.md", "New content"))
        .to.be.true;
    });
  });

  describe("generateFeaturePromptSection", () => {
    it("should generate wrapped content for base feature", () => {
      const content = generateFeaturePromptSection("base");

      expect(content).to.include("<firebase_base_prompts hash=");
      expect(content).to.include("<!-- Firebase Base Context - Auto-generated, do not edit -->");
      expect(content).to.include("# Firebase CLI Context");
      expect(content).to.include("Base Firebase content");
    });

    it("should generate wrapped content for functions feature", () => {
      const content = generateFeaturePromptSection("functions");

      expect(content).to.include("<firebase_functions_prompts hash=");
      expect(content).to.include(
        "<!-- Firebase Functions Context - Auto-generated, do not edit -->",
      );
      expect(content).to.include("# Firebase Functions");
      expect(content).to.include("Functions specific content");
    });

    it("should return empty string for unknown feature", () => {
      const content = generateFeaturePromptSection("unknown");

      expect(content).to.equal("");
    });
  });

  describe("getFeatureContent", () => {
    it("should return raw content for base feature", () => {
      const content = getFeatureContent("base");

      expect(content).to.equal("# Firebase CLI Context\n\nBase Firebase content");
    });

    it("should return raw content for functions feature", () => {
      const content = getFeatureContent("functions");

      expect(content).to.equal("# Firebase Functions\n\nFunctions specific content");
    });

    it("should return empty string for unknown feature", () => {
      const content = getFeatureContent("unknown");

      expect(content).to.equal("");
    });
  });

  describe("hash calculation", () => {
    it("should generate 8-character hash", () => {
      const { hash } = generatePromptSection([]);
      expect(hash).to.have.lengthOf(8);
      expect(hash).to.match(/^[a-f0-9]{8}$/);
    });

    it("should be deterministic", () => {
      const hash1 = generatePromptSection([]).hash;
      const hash2 = generatePromptSection([]).hash;
      expect(hash1).to.equal(hash2);
    });
  });

  describe("regex matching", () => {
    it("should match firebase_prompts section with hash", async () => {
      const content = `Before
<firebase_prompts hash="abc123">
Content
</firebase_prompts>
After`;
      (mockConfig.readProjectFile as sinon.SinonStub).returns(content);

      await updateFirebaseSection(mockConfig, "test.md", ["functions"]);

      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent).to.include("Before");
      expect(writtenContent).to.include("After");
      expect(writtenContent).to.match(/<firebase_prompts hash="[^"]+">[\s\S]*<\/firebase_prompts>/);
    });

    it("should replace section with missing hash attribute", async () => {
      const content = `User content before\n<firebase_prompts>\nOld content without hash\n</firebase_prompts>\nUser content after`;
      (mockConfig.readProjectFile as sinon.SinonStub).returns(content);

      const result = await updateFirebaseSection(mockConfig, "test.md", []);

      expect(result.updated).to.be.true;
      const writtenContent = (mockConfig.writeProjectFile as sinon.SinonStub).firstCall.args[1];
      expect(writtenContent).to.include("User content before");
      expect(writtenContent).to.include("User content after");
      expect(writtenContent).to.include("<firebase_prompts hash=");
      expect(writtenContent).to.include("Base Firebase content");
      expect(writtenContent).to.not.include("Old content without hash");
    });
  });
});
