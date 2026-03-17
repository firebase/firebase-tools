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
    beforeEach(() => {
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
    });

    it("should use overrideProjectId if provided", async () => {
      const result = await extractMetadata(testRoot, "override-project");
      expect(result.projectId).to.equal("override-project");
    });

    it("should fallback to metadata.json if no override is provided", async () => {
      const result = await extractMetadata(testRoot);
      expect(result.projectId).to.equal("original-project");
    });
  });

  describe("migrate", () => {
    let readFileStub: sinon.SinonStub;
    let writeFileStub: sinon.SinonStub;
    let mkdirStub: sinon.SinonStub;
    let accessStub: sinon.SinonStub;

    let listBackendsStub: sinon.SinonStub;
    let commandStub: sinon.SinonStub;
    let trackStub: sinon.SinonStub;
    let confirmStub: sinon.SinonStub;
    let unlinkStub: sinon.SinonStub;
    let spawnStub: sinon.SinonStub;

    beforeEach(() => {
      sandbox.stub(fs, "stat").resolves({ isDirectory: () => true } as any);
      const cp = require("child_process");
      sandbox.stub(cp, "spawnSync").returns({ status: 0 });
      sandbox.stub(process, "platform").value("darwin");

      sandbox.stub(global, "fetch").resolves({
        ok: true,
        json: async () => [],
      } as Response);

      readFileStub = sandbox.stub(fs, "readFile").callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json")) {
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        }
        if (pStr.endsWith("readme_template.md")) {
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        }
        if (pStr.endsWith("system_instructions_template.md")) {
          return "Project: ${appName}";
        }
        if (pStr.endsWith("cleanup.md")) {
          return "Step 1: Build";
        }
        if (pStr.endsWith(".firebaserc")) {
          return JSON.stringify({ projects: { default: "test-project" } });
        }
        if (pStr.endsWith("blueprint.md")) {
          return "# **App Name**: Test App";
        }
        if (pStr.endsWith("package.json")) {
          return "{}";
        }
        if (pStr.endsWith("mcp_config.json")) {
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        }
        if (pStr.endsWith("README.md")) {
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        }
        return "";
      });

      writeFileStub = sandbox.stub(fs, "writeFile").resolves();
      mkdirStub = sandbox.stub(fs, "mkdir").resolves();
      unlinkStub = sandbox.stub(fs, "unlink").resolves();
      sandbox.stub(fs, "readdir").resolves([]);
      accessStub = sandbox.stub(fs, "access").rejects({ code: "ENOENT" });

      listBackendsStub = sandbox
        .stub(apphosting, "listBackends")
        .resolves({ backends: [], unreachable: [] });

      commandStub = sandbox.stub(utils, "commandExistsSync").returns(false);
      trackStub = sandbox.stub(track, "trackGA4").resolves();
      confirmStub = sandbox.stub(prompt, "confirm").resolves(true);

      const childProcess = require("child_process");
      spawnStub = sandbox.stub(childProcess, "spawn").returns({
        unref: () => {
          // No-op for testing
        },
      } as unknown as import("child_process").ChildProcess);
    });

    it("should fail if the directory does not exist", async () => {
      (fs.stat as sinon.SinonStub).restore();
      sandbox.stub(fs, "stat").rejects({ code: "ENOENT" });
      await expect(migrate(testRoot)).to.be.rejectedWith(
        "The directory /test/root does not exist.",
      );
    });

    it("should perform migration on Windows successfully", async () => {
      sandbox.stub(process, "platform").value("win32");

      accessStub.callsFake(async (p: any) => {
        if (p.toString().includes("agy.exe")) return;
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      });

      confirmStub.resolves(true);

      await migrate(testRoot);

      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "OTHER", result: "success" }),
      ).to.be.true;
      expect(spawnStub.calledOnce).to.be.true;
      expect(spawnStub.firstCall.args[2].shell).to.be.true;
    });

    it("should perform a full migration successfully and track start/success", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "Export Date: ${exportDate}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("cleanup.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md"))
          return "# **App Name**: Test App\nSome blueprint content";
        if (pStr.endsWith("package.json"))
          return JSON.stringify({ dependencies: { next: "12345" } });
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        if (pStr.endsWith("README.md"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      listBackendsStub.resolves({
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

      commandStub.withArgs("agy").returns(true);

      await migrate(testRoot);

      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "rules"), { recursive: true })).to
        .be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "workflows"), { recursive: true }))
        .to.be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "skills"), { recursive: true })).to
        .be.true;

      expect(
        writeFileStub.calledWith(
          path.join(testRoot, ".agents", "rules", "migration-context.md"),
          sinon.match(/Test App/),
        ),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(
          path.join(testRoot, ".agents", "workflows", "cleanup.md"),
          sinon.match(/Step 1: Build/),
        ),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(path.join(testRoot, ".firebaserc"), sinon.match(/test-project/)),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "firebase.json"),
          sinon.match(/"backendId": "studio"/).and(sinon.match(/\.agents/)),
        ),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/Run npm run dev at http:\/\/localhost:9002/),
        ),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(
          path.join(testRoot, ".vscode", "launch.json"),
          sinon.match(/"port": 9002/),
        ),
      ).to.be.true;

      const cp = require("child_process");
      expect(
        (cp.spawnSync as sinon.SinonStub).calledWith(
          "npx",
          [
            "-y",
            "skills",
            "add",
            "firebase/agent-skills",
            "-a",
            "gemini-cli",
            "--skill",
            "*",
            "-y",
          ],
          sinon.match.any,
        ),
      ).to.be.true;
    });

    it("should append existing README.md content if it exists", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("cleanup.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json")) return "{}";
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        if (pStr.endsWith("README.md")) return "Existing README content";
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/Existing README content/),
        ),
      ).to.be.true;
      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/## Previous README.md contents:/),
        ),
      ).to.be.true;
    });

    it("should perform a full migration for Angular successfully", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("cleanup.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json"))
          return JSON.stringify({ dependencies: { "@angular/core": "17.0.0" } });
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        if (pStr.endsWith("README.md"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      commandStub.withArgs("npx").returns(true);
      confirmStub
        .withArgs(sinon.match({ message: sinon.match(/Firebase MCP server/) }))
        .resolves(true);

      await migrate(testRoot);

      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "rules"), { recursive: true })).to
        .be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "workflows"), { recursive: true }))
        .to.be.true;
      expect(mkdirStub.calledWith(path.join(testRoot, ".agents", "skills"), { recursive: true })).to
        .be.true;

      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/Run npm run start at http:\/\/localhost:4200/),
        ),
      ).to.be.true;

      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "ANGULAR", result: "started" }),
      ).to.be.true;
      expect(
        trackStub.calledWith("firebase_studio_migrate", { app_type: "ANGULAR", result: "success" }),
      ).to.be.true;

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/--dir/))).to.be.true;
      expect(
        writeFileStub.calledWith(mcpConfigPath, sinon.match(new RegExp(path.resolve(testRoot)))),
      ).to.be.true;
    });

    it("should skip MCP server configuration if 'firebase' already exists", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("cleanup.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md"))
          return "# **App Name**: Test App\nSome blueprint content";
        if (pStr.endsWith("mcp_config.json"))
          return JSON.stringify({ mcpServers: { firebase: { command: "npx", args: [] } } });
        if (pStr.endsWith("README.md"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match.any)).to.be.false;
    });

    it("should skip the open prompt if agy is missing", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("cleanup.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json"))
          return JSON.stringify({ dependencies: { "@angular/core": "17.0.0" } });
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        if (pStr.endsWith("README.md"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/Run npm run start at http:\/\/localhost:4200/),
        ),
      ).to.be.true;

      const launchJsonCall = writeFileStub.args.find((a) => a[0].endsWith("launch.json"));
      expect(launchJsonCall).to.not.be.undefined;
      expect(launchJsonCall![1]).to.contain("Angular: debug server-side");
      expect(launchJsonCall![1]).to.contain('"port": 4200');

      expect(confirmStub.called).to.be.false;
    });

    it("should upgrade Genkit version to 1.29 if present in package.json", async () => {
      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("startup_workflow.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json"))
          return JSON.stringify({
            dependencies: { genkit: "1.0.0", "@genkit-ai/google-genai": "1.0.0", next: "14.0.0" },
            devDependencies: { "genkit-cli": "1.0.0" },
          });
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      const packageJsonCall = writeFileStub.args.find((a) => a[0].endsWith("package.json"));
      expect(packageJsonCall).to.not.be.undefined;
      const packageJson = JSON.parse(packageJsonCall![1]);
      expect(packageJson.dependencies.genkit).to.equal("1.29");
      expect(packageJson.dependencies["@genkit-ai/google-genai"]).to.equal("1.29");
      expect(packageJson.devDependencies["genkit-cli"]).to.equal("1.29");
      expect(packageJson.dependencies.next).to.equal("14.0.0");
    });

    it("should perform a full migration for Flutter successfully", async () => {
      accessStub.withArgs(sinon.match(/pubspec.yaml/)).resolves();

      await migrate(testRoot);

      expect(
        writeFileStub.calledWith(
          path.join(testRoot, "README.md"),
          sinon.match(/Run flutter run -d chrome --web-port=8080 at http:\/\/localhost:8080/),
        ),
      ).to.be.true;

      const tasksJsonCall = writeFileStub.args.find((a) => a[0].endsWith("tasks.json"));
      expect(tasksJsonCall).to.not.be.undefined;
      expect(tasksJsonCall![1]).to.contain("flutter-pub-get");
      expect(tasksJsonCall![1]).to.contain("flutter pub get");
      expect(tasksJsonCall![1]).to.contain('"kind": "build"');

      const launchJsonCall = writeFileStub.args.find((a) => a[0].endsWith("launch.json"));
      expect(launchJsonCall).to.not.be.undefined;
      expect(launchJsonCall![1]).to.contain('"type": "dart"');
      expect(launchJsonCall![1]).to.contain('"preLaunchTask": "flutter-pub-get"');
    });

    it("should not create launch.json for OTHER app type", async () => {
      await migrate(testRoot);

      const launchJsonCall = writeFileStub.args.find((a) => a[0].endsWith("launch.json"));
      expect(launchJsonCall).to.be.undefined;
    });

    it("should detect antigravity command if agy is missing", async () => {
      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(true);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
    });

    it("should detect antigravity command on Windows if in PATH or common location", async () => {
      sandbox.stub(process, "platform").value("win32");
      sandbox.stub(process, "env").value({ LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" });

      commandStub.withArgs("agy").returns(false);
      commandStub.withArgs("antigravity").returns(true);

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
    });

    it("should detect antigravity command on Windows in common install location", async () => {
      sandbox.stub(process, "platform").value("win32");
      const localAppData = "C:\\Users\\Test\\AppData\\Local";
      sandbox.stub(process, "env").value({ LOCALAPPDATA: localAppData });

      accessStub
        .withArgs(path.join(localAppData, "Programs", "Antigravity", "bin", "agy.exe"))
        .resolves();

      await migrate(testRoot);

      expect(confirmStub.called).to.be.true;
    });

    it("should delete .idx/mcp.json if it exists", async () => {
      await migrate(testRoot);
      expect(unlinkStub.calledWith(path.join(testRoot, ".idx", "mcp.json"))).to.be.true;
    });

    it("should configure Dart MCP server for Flutter apps if dart is available", async () => {
      accessStub.withArgs(sinon.match("pubspec.yaml")).resolves();
      commandStub.withArgs("dart").returns(true);

      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("startup_workflow.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json")) return "{}";
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"dart":/))).to.be.true;
    });

    it("should NOT configure Dart MCP server for Flutter apps if dart is NOT available, and log warning", async () => {
      accessStub.withArgs(sinon.match("pubspec.yaml")).resolves();
      commandStub.withArgs("dart").returns(false);

      const logWarningStub = sandbox.stub(utils, "logWarning");

      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("startup_workflow.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json")) return "{}";
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"dart"/))).to.be.false;
      expect(
        logWarningStub.calledWith(
          "Couldn't find Dart/Flutter on PATH. Install Flutter by following the instruction at https://docs.flutter.dev/install.",
        ),
      ).to.be.true;
    });

    it("should NOT configure Dart MCP server if app is not Flutter", async () => {
      accessStub.withArgs(sinon.match("pubspec.yaml")).rejects({ code: "ENOENT" });
      commandStub.withArgs("dart").returns(true);

      readFileStub.callsFake(async (p: any) => {
        const pStr = p.toString();
        if (pStr.endsWith("metadata.json"))
          return JSON.stringify({ projectId: "test-project", appName: "Test App" });
        if (pStr.endsWith("readme_template.md"))
          return "# ${appName}\nRun ${startCommand} at ${localUrl}";
        if (pStr.endsWith("system_instructions_template.md")) return "Project: ${appName}";
        if (pStr.endsWith("startup_workflow.md")) return "Step 1: Build";
        if (pStr.endsWith(".firebaserc"))
          return JSON.stringify({ projects: { default: "test-project" } });
        if (pStr.endsWith("blueprint.md")) return "# **App Name**: Test App";
        if (pStr.endsWith("package.json")) return "{}";
        if (pStr.endsWith("mcp_config.json"))
          throw Object.assign(new Error("File not found"), { code: "ENOENT" });
        throw new Error(`Unexpected readFile: ${pStr}`);
      });

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");

      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"dart"/))).to.be.false;
    });

    it("should prompt user for Firebase MCP server and configure if they confirm", async () => {
      commandStub.withArgs("npx").returns(true);
      confirmStub
        .withArgs(sinon.match({ message: sinon.match(/Firebase MCP server/) }))
        .resolves(true);

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"firebase":/))).to.be.true;
    });

    it("should prompt user for Firebase MCP server and NOT configure if they decline", async () => {
      commandStub.withArgs("npx").returns(true);
      confirmStub
        .withArgs(sinon.match({ message: sinon.match(/Firebase MCP server/) }))
        .resolves(false);

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"firebase":/))).to.be.false;
    });

    it("should skip Firebase MCP server if npx is not available", async () => {
      commandStub.withArgs("npx").returns(false);

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"firebase":/))).to.be.false;
    });

    it("should prompt user for Dart MCP server and configure if they confirm", async () => {
      accessStub.withArgs(sinon.match("pubspec.yaml")).resolves();
      commandStub.withArgs("dart").returns(true);
      confirmStub.withArgs(sinon.match({ message: sinon.match(/Dart MCP server/) })).resolves(true);

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"dart":/))).to.be.true;
    });

    it("should prompt user for Dart MCP server and NOT configure if they decline", async () => {
      accessStub.withArgs(sinon.match("pubspec.yaml")).resolves();
      commandStub.withArgs("dart").returns(true);
      confirmStub
        .withArgs(sinon.match({ message: sinon.match(/Dart MCP server/) }))
        .resolves(false);

      await migrate(testRoot);

      const mcpConfigDir = path.join(require("os").homedir(), ".gemini", "antigravity");
      const mcpConfigPath = path.join(mcpConfigDir, "mcp_config.json");
      expect(writeFileStub.calledWith(mcpConfigPath, sinon.match(/"dart":/))).to.be.false;
    });
  });

  describe("uploadSecrets", () => {
    const uploadSecretsTestRoot = "/test/root";

    it("should call apphostingSecretsSetAction if .env exists and has a non-blank GEMINI_API_KEY", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("GEMINI_API_KEY=test-key");

      await uploadSecrets(uploadSecretsTestRoot, "test-project");

      expect(
        secretsStub.calledWith(
          "GEMINI_API_KEY",
          "test-project",
          undefined,
          undefined,
          path.join(uploadSecretsTestRoot, ".env"),
          true,
        ),
      ).to.be.true;
    });

    it("should not call apphostingSecretsSetAction if GEMINI_API_KEY is blank in .env", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("GEMINI_API_KEY= ");

      await uploadSecrets(uploadSecretsTestRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should not call apphostingSecretsSetAction if GEMINI_API_KEY is missing in .env", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").resolves();
      sandbox.stub(fs, "readFile").resolves("OTHER_KEY=value");

      await uploadSecrets(uploadSecretsTestRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should not call apphostingSecretsSetAction if .env does not exist", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      sandbox.stub(fs, "access").rejects({ code: "ENOENT" });

      await uploadSecrets(uploadSecretsTestRoot, "test-project");

      expect(secretsStub.called).to.be.false;
    });

    it("should do nothing if projectId is undefined", async () => {
      const secretsStub = sandbox.stub(secrets, "apphostingSecretsSetAction").resolves();
      await uploadSecrets(uploadSecretsTestRoot, undefined);
      expect(secretsStub.called).to.be.false;
    });
  });
});
