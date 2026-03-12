import { expect } from "chai";
import * as fs from "fs/promises";
import * as path from "path";
import * as sinon from "sinon";
import { migrate, extractMetadata, uploadSecrets } from "./migrate";
import * as apphosting from "../gcp/apphosting";
import * as prompt from "../prompt";
import * as track from "../track";
import * as secrets from "../apphosting/secrets";
import * as utils from "../utils";

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
    it("should perform migration on Windows successfully", async () => {
      // Stub process.platform
      sandbox.stub(process, "platform").value("win32");
      // Stub global fetch
      const fetchStub = sandbox.stub(global, "fetch");
      fetchStub.resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}";
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
          return "# **App Name**: Test App";
        }
        return "";
      });

      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(fs, "access").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.includes("agy.exe")) {
          return;
        }
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync
      const commandStub = sandbox.stub(utils, "commandExistsSync");
      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(false);

      // Mock trackGA4
      const trackStub = sandbox.stub(track, "trackGA4").resolves();

      // Mock spawn
      const childProcess = require("child_process");
      const spawnStub = sandbox.stub(childProcess, "spawn").returns({
        unref: () => {
          // No-op for testing
        },
      } as unknown as import("child_process").ChildProcess);

      // Mock prompt
      sandbox.stub(prompt, "confirm").resolves(true);

      await migrate(testRoot);

      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "OTHER", result: "success" }),
      ).to.be.true;
      expect(spawnStub.calledOnce).to.be.true;
      expect(spawnStub.firstCall.args[2].shell).to.be.true;
    });

    it("should perform a full migration successfully and track start/success", async () => {
      // Ensure platform is not win32
      sandbox.stub(process, "platform").value("darwin");

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
        } as Response);

      // Mock GitHub API for specific skill content
      fetchStub
        .withArgs("https://api.github.com/repos/firebase/agent-skills/contents/skills/test-skill")
        .resolves({
          ok: true,
          json: async () => [],
        } as Response);

      // Mock GitHub API for Genkit skill content
      fetchStub
        .withArgs(
          "https://api.github.com/repos/genkit-ai/skills/contents/skills/developing-genkit-js?ref=main",
        )
        .resolves({
          ok: true,
          json: async () => [],
        } as Response);

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
        if (pStr.endsWith("mcp_config.json")) {
          const err = new Error("File not found");
          (err as any).code = "ENOENT";
          throw err;
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
        ] as apphosting.Backend[],
        unreachable: [],
      });

      // Mock prompt
      sandbox.stub(prompt, "confirm").resolves(false);

      // Mock commandExistsSync
      sandbox.stub(utils, "commandExistsSync").withArgs("agy").returns(true);
      // Mock trackGA4
      const trackStub = sandbox.stub(track, "trackGA4").resolves();

      // Mock execSync
      const childProcess = require("child_process");
      sandbox.stub(childProcess, "execSync").returns(Buffer.from("1.0.0"));

      await migrate(testRoot);

      // Verify key files were written
      const writeStub = fs.writeFile as sinon.SinonStub;
      const mkdirStub = fs.mkdir as sinon.SinonStub;

      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "rules"), { recursive: true })).to
        .be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "workflows"), { recursive: true }))
        .to.be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "skills"), { recursive: true })).to
        .be.true;

      expect(
        writeStub.calledWith(
          path.join(testRoot, ".agents", "rules", "migration-context.md"),
          sinon.match(/Test App/),
        ),
      ).to.be.true;
      expect(
        writeStub.calledWith(
          path.join(testRoot, ".agents", "workflows", "startup.md"),
          sinon.match(/Step 1: Build/),
        ),
      ).to.be.true;

      expect(writeStub.calledWith(path.join(testRoot, ".firebaserc"), sinon.match(/test-project/)))
        .to.be.true;
      expect(
        writeStub.calledWith(
          path.join(testRoot, "firebase.json"),
          sinon.match(/"backendId": "studio"/).and(sinon.match(/\.agents/)),
        ),
      ).to.be.true;
      expect(writeStub.calledWith(path.join(testRoot, "README.md"), sinon.match(/Test App/))).to.be
        .true;

      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "OTHER", result: "started" }),
      ).to.be.true;
      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "OTHER", result: "success" }),
      ).to.be.true;

      // Verify MCP config was written
      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

      expect(writeStub.calledWith(mcpConfigPath, sinon.match(/--dir/))).to.be.true;
      expect(writeStub.calledWith(mcpConfigPath, sinon.match(new RegExp(path.resolve(testRoot)))))
        .to.be.true;
    });

    it("should skip MCP server configuration if 'firebase' already exists", async () => {
      // Ensure platform is not win32
      sandbox.stub(process, "platform").value("darwin");

      // Stub global fetch
      sandbox.stub(global, "fetch").resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}";
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
          return "# **App Name**: Test App";
        }
        if (pStr.endsWith("mcp_config.json")) {
          return JSON.stringify({ mcpServers: { firebase: { command: "npx", args: [] } } });
        }
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      const writeStub = sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync
      sandbox.stub(utils, "commandExistsSync").returns(false);

      await migrate(testRoot);

      // Verify MCP config was NOT written (because it already existed)
      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeStub.calledWith(mcpConfigPath, sinon.match.any)).to.be.false;
    });

    it("should skip the open prompt if agy is missing", async () => {
      // Stub global fetch
      const fetchStub = sandbox.stub(global, "fetch");
      fetchStub.resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}";
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
          return "# **App Name**: Test App";
        }
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync to fail
      sandbox.stub(utils, "commandExistsSync").returns(false);

      // Mock prompt - should NOT be called
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(true);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.false;
    });

    it("should detect antigravity command if agy is missing", async () => {
      // Stub global fetch
      sandbox.stub(global, "fetch").resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}";
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
          return "# **App Name**: Test App";
        }
        return "";
      });

      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync: agy missing, antigravity present
      const commandStub = sandbox.stub(utils, "commandExistsSync");
      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(true);

      // Mock prompt - should be called
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(false);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
    });

    it("should detect antigravity command on Windows if in PATH or common location", async () => {
      sandbox.stub(process, "platform").value("win32");
      sandbox.stub(process, "env").value({ LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" });

      // Stub global fetch
      sandbox.stub(global, "fetch").resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").resolves("");
      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync: agy missing, antigravity present in path
      const commandStub = sandbox.stub(utils, "commandExistsSync");
      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(true);

      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });

      // Mock prompt
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(false);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
    });

    it("should detect antigravity command on Windows in common install location", async () => {
      sandbox.stub(process, "platform").value("win32");
      const localAppData = "C:\\Users\\Test\\AppData\\Local";
      sandbox.stub(process, "env").value({ LOCALAPPDATA: localAppData });

      // Stub global fetch
      sandbox.stub(global, "fetch").resolves({
        ok: true,
        json: async () => [],
      } as Response);

      // Mock filesystem
      sandbox.stub(fs, "readFile").resolves("");
      sandbox.stub(fs, "writeFile").resolves();
      sandbox.stub(fs, "mkdir").resolves();
      sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      sandbox.stub(apphosting, "listBackends").resolves({ backends: [], unreachable: [] });

      // Mock commandExistsSync: both missing from PATH
      const commandStub = sandbox.stub(utils, "commandExistsSync");
      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(false);

      // Mock fs.access to succeed for the Windows install path
      const accessStub = sandbox.stub(fs, "access");
      const expectedPath = path.join(localAppData, "Programs", "Antigravity", "bin", "agy.exe");
      accessStub.withArgs(expectedPath).resolves();
      accessStub.rejects({ code: "ENOENT" });

      // Mock prompt
      const confirmStub = sandbox.stub(prompt, "confirm").resolves(false);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
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
