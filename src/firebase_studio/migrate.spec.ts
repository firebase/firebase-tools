import { expect } from "chai";
import * as fs from "fs/promises";
import * as path from "path";
import * as sinon from "sinon";
import { migrate, extractMetadata, uploadSecrets } from "./migrate";
import * as apphosting from "../gcp/apphosting";
import * as prompt from "../prompt";
import * as secrets from "../apphosting/secrets";

describe("migrate", () => {
  let sandbox: sinon.SinonSandbox;
  const testRoot = "/test/root";

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("extractMetadata", () => {
    it("should use overrideProjectId if provided", async () => {
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "original-project" });
        }
        if (pStr.endsWith("blueprint.md")) {
          return "# **App Name**: Test App";
        }
        return "";
      });

      const result = await extractMetadata(testRoot, "override-project");
      expect(result.projectId).to.equal("override-project");
    });

    it("should fallback to metadata.json if no override is provided", async () => {
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "original-project" });
        }
        if (pStr.endsWith("blueprint.md")) {
          return "# **App Name**: Test App";
        }
        return "";
      });

      const result = await extractMetadata(testRoot);
      expect(result.projectId).to.equal("original-project");
    });
  });

  describe("migrate", () => {
    it("should perform a full migration successfully", async () => {
      // Stub global fetch
      const fetchStub = sandbox.stub(global, "fetch");

      // Mock GitHub API for skills listing
      fetchStub
        .withArgs("https://api.github.com/repos/firebase/agent-skills/contents/skills")
        .resolves({
          ok: true,
          json: async () => [
            {
              name: "test-skill",
              type: "dir",
              url: "https://api.github.com/repos/firebase/agent-skills/contents/skills/test-skill",
            },
          ],
        } as any);

      // Mock GitHub API for specific skill content
      fetchStub
        .withArgs("https://api.github.com/repos/firebase/agent-skills/contents/skills/test-skill")
        .resolves({
          ok: true,
          json: async () => [],
        } as any);

      // Mock GitHub API for Genkit skill content
      fetchStub
        .withArgs(
          "https://api.github.com/repos/genkit-ai/skills/contents/skills/developing-genkit-js?ref=main",
        )
        .resolves({
          ok: true,
          json: async () => [],
        } as any);

      // Mock filesystem
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}\nExport Date: ${exportDate}\n${blueprintContent}";
        }
        if (pStr.endsWith("system_instructions_template.md")) {
          return "Project: ${appName}";
        }
        if (pStr.endsWith("startup_workflow.md")) {
          return "Step 1: Build";
        }
        if (pStr.endsWith(".firebaserc")) {
          return JSON.stringify({ projects: { default: "test-project" } });
        }
        if (pStr.endsWith("blueprint.md")) {
          return "# **App Name**: Test App\nSome blueprint content";
        }
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });

      // Mock App Hosting backends
      sandbox.stub(apphosting, "listBackends").resolves({
        backends: [
          {
            name: "projects/test-project/locations/us-central1/backends/studio",
            uri: "example.com",
            servingLocality: "GLOBAL_ACCESS",
            labels: {},
            createTime: "",
            updateTime: "",
          },
        ] as any[],
        unreachable: [],
      });

      // Mock prompt
      sandbox.stub(prompt, "confirm").resolves(false);

      // Mock execSync
      const childProcess = require("child_process");
      sandbox.stub(childProcess, "execSync").returns(Buffer.from("1.0.0"));

      await migrate(testRoot);

      // Verify key files were written
      const writeStub = fs.writeFile as sinon.SinonStub;

      expect(writeStub.calledWith(path.join(testRoot, ".firebaserc"), sinon.match(/test-project/)))
        .to.be.true;
      expect(
        writeStub.calledWith(
          path.join(testRoot, "firebase.json"),
          sinon.match(/"backendId": "studio"/),
        ),
      ).to.be.true;
      expect(writeStub.calledWith(path.join(testRoot, "README.md"), sinon.match(/Test App/))).to.be
        .true;
    });
  });

  describe("uploadSecrets", () => {
    let sandbox: sinon.SinonSandbox;
    const testRoot = "/test/root";

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it("should call apphostingSecretsSetAction if .env exists and has a non-blank GEMINI_API_KEY", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("GEMINI_API_KEY=test-key");

      await uploadSecrets(testRoot, "test-project");

      expect(
        secretsStub.calledWith(
          "GEMINI_API_KEY",
          "test-project",
          undefined,
          undefined,
          path.join(testRoot, ".env"),
          true,
        ),
      ).to.be.true;
    });

    it("should not call apphostingSecretsSetAction if GEMINI_API_KEY is blank in .env", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("GEMINI_API_KEY= ");

      await uploadSecrets(testRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should not call apphostingSecretsSetAction if GEMINI_API_KEY is missing in .env", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("OTHER_KEY=value");

      await uploadSecrets(testRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should not call apphostingSecretsSetAction if .env does not exist", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });

      await uploadSecrets(testRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should do nothing if projectId is undefined", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      await uploadSecrets(testRoot, undefined);
      expect(secretsStub.called).to.be.false;
    });
  });
});
