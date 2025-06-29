import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import * as path from "path";
import { WorkspaceManager } from "./workspace";

describe("WorkspaceManager", () => {
  let sandbox: sinon.SinonSandbox;
  let workspaceManager: WorkspaceManager;
  const baseDir = "/tmp/impromptu-test";

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    workspaceManager = new WorkspaceManager(baseDir);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("setupWorkspace", () => {
    it("should create a workspace directory", async () => {
      const ensureDirStub = sandbox.stub(fs, "ensureDir").resolves();
      
      const workspaceDir = await workspaceManager.setupWorkspace("test-prompt", "test-case");
      
      expect(workspaceDir).to.include(baseDir);
      expect(workspaceDir).to.include("test-prompt-test-case");
      expect(ensureDirStub).to.have.been.calledOnce;
    });

    it("should handle errors gracefully", async () => {
      sandbox.stub(fs, "ensureDir").rejects(new Error("Permission denied"));
      
      try {
        await workspaceManager.setupWorkspace("test-prompt", "test-case");
        expect.fail("Should have thrown error");
      } catch (error: any) {
        expect(error.message).to.include("Failed to create workspace");
      }
    });
  });

  describe("copySeedFiles", () => {
    it("should copy seed files to workspace", async () => {
      const ensureDirStub = sandbox.stub(fs, "ensureDir").resolves();
      const writeFileStub = sandbox.stub(fs, "writeFile").resolves();
      
      const seedFiles = {
        "src/main.ts": "console.log('hello');",
        "package.json": '{"name": "test"}',
      };
      
      await workspaceManager.copySeedFiles("/workspace", seedFiles);
      
      expect(ensureDirStub).to.have.been.calledTwice;
      expect(writeFileStub).to.have.been.calledTwice;
      expect(writeFileStub).to.have.been.calledWith(
        path.join("/workspace", "src/main.ts"),
        "console.log('hello');",
        "utf-8"
      );
    });
  });

  describe("createSnapshot", () => {
    it("should create a snapshot of workspace files", async () => {
      const readdirStub = sandbox.stub(fs, "readdir");
      readdirStub.onFirstCall().resolves([
        { name: "file1.txt", isDirectory: () => false, isFile: () => true },
        { name: "subdir", isDirectory: () => true, isFile: () => false },
      ] as any);
      readdirStub.onSecondCall().resolves([
        { name: "file2.txt", isDirectory: () => false, isFile: () => true },
      ] as any);
      
      sandbox.stub(fs, "readFile")
        .onFirstCall().resolves(Buffer.from("content1"))
        .onSecondCall().resolves(Buffer.from("content2"));
      
      const snapshot = await workspaceManager.createSnapshot("/workspace");
      
      expect(snapshot.files).to.have.property("file1.txt");
      expect(snapshot.files).to.have.property("subdir/file2.txt");
      expect(snapshot.tree).to.be.a("string");
    });
  });

  describe("compareSnapshots", () => {
    it("should detect file changes", () => {
      const before = {
        files: {
          "file1.txt": "hash1",
          "file2.txt": "hash2",
        },
        tree: "tree1",
      };
      
      const after = {
        files: {
          "file1.txt": "hash1",
          "file2.txt": "hash2-modified",
          "file3.txt": "hash3",
        },
        tree: "tree2",
      };
      
      const diff = workspaceManager.compareSnapshots(before, after);
      
      expect(diff.added).to.deep.equal(["file3.txt"]);
      expect(diff.modified).to.deep.equal(["file2.txt"]);
      expect(diff.deleted).to.be.empty;
      expect(diff.identical).to.be.false;
    });
  });

  describe("cleanupWorkspace", () => {
    it("should remove workspace directory", async () => {
      const removeStub = sandbox.stub(fs, "remove").resolves();
      
      await workspaceManager.cleanupWorkspace("/workspace/test");
      
      expect(removeStub).to.have.been.calledOnceWith("/workspace/test");
    });

    it("should handle cleanup errors gracefully", async () => {
      sandbox.stub(fs, "remove").rejects(new Error("Directory not found"));
      
      // Should not throw
      await workspaceManager.cleanupWorkspace("/workspace/test");
    });
  });
});