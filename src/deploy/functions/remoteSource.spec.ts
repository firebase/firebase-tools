import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs";
import * as path from "path";
import * as mockfs from "mock-fs";
import * as archiver from "archiver";
import { Writable } from "stream";

import { getRemoteSource, requireFunctionsYaml } from "./remoteSource";
import { FirebaseError } from "../../error";
import * as downloadUtils from "../../downloadUtils";

describe("remoteSource", () => {
  describe("requireFunctionsYaml", () => {
    afterEach(() => {
      mockfs.restore();
    });

    it("should not throw if functions.yaml exists", () => {
      mockfs({
        "/app/functions.yaml": "runtime: nodejs16",
      });

      expect(() => requireFunctionsYaml("/app")).to.not.throw();
    });

    it("should throw FirebaseError if functions.yaml is missing", () => {
      mockfs({
        "/app/index.js": "console.log('hello')",
      });

      expect(() => requireFunctionsYaml("/app")).to.throw(
        FirebaseError,
        /The remote repository is missing a required deployment manifest/,
      );
    });
  });

  describe("getRemoteSource", () => {
    let downloadToTmpStub: sinon.SinonStub;

    beforeEach(() => {
      downloadToTmpStub = sinon.stub(downloadUtils, "downloadToTmp");
    });

    afterEach(() => {
      sinon.restore();
      mockfs.restore();
    });

    async function createZipBuffer(
      files: { [path: string]: string },
      topLevelDir?: string,
    ): Promise<Buffer> {
      const archive = archiver("zip", { zlib: { level: 9 } });
      const chunks: Buffer[] = [];
      const output = new Writable({
        write(chunk, encoding, callback) {
          chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
          callback();
        },
      });

      return new Promise((resolve, reject) => {
        output.on("finish", () => resolve(Buffer.concat(chunks as unknown as Uint8Array[])));
        archive.on("error", (err) => reject(err));
        archive.pipe(output);

        for (const [filePath, content] of Object.entries(files)) {
          const entryPath = topLevelDir ? path.join(topLevelDir, filePath) : filePath;
          archive.append(content, { name: entryPath });
        }
        archive.finalize();
      });
    }

    it("should use GitHub Archive API for GitHub URLs", async () => {
      const zipBuffer = await createZipBuffer(
        { "functions.yaml": "runtime: nodejs16" },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource("https://github.com/org/repo", "main", "/dest");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(sourceDir).to.match(/repo-main$/);
      expect(sourceDir).to.contain("/dest");
      expect(fs.statSync(path.join(sourceDir, "functions.yaml")).isFile()).to.be.true;
    });

    it("should support org/repo shorthand", async () => {
      const zipBuffer = await createZipBuffer(
        { "functions.yaml": "runtime: nodejs16" },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource("org/repo", "main", "/dest");

      expect(downloadToTmpStub.calledOnce).to.be.true;
      expect(downloadToTmpStub.firstCall.args[0]).to.equal(
        "https://github.com/org/repo/archive/main.zip",
      );
      expect(sourceDir).to.match(/repo-main$/);
    });

    it("should strip top-level directory from GitHub archive", async () => {
      const zipBuffer = await createZipBuffer(
        { "functions.yaml": "runtime: nodejs16" },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource("https://github.com/org/repo", "main", "/dest");

      expect(sourceDir).to.match(/repo-main$/);
      expect(fs.statSync(path.join(sourceDir, "functions.yaml")).isFile()).to.be.true;
    });

    it("should NOT strip top-level directory if multiple files exist at root", async () => {
      const zipBuffer = await createZipBuffer({
        "file1.txt": "content",
        "functions.yaml": "runtime: nodejs16",
        "repo-main/index.js": "console.log('hello')",
      });
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource("https://github.com/org/repo", "main", "/dest");

      expect(sourceDir).to.not.match(/repo-main$/);
      expect(sourceDir).to.equal("/dest");
      expect(fs.statSync(path.join(sourceDir, "file1.txt")).isFile()).to.be.true;
      expect(fs.statSync(path.join(sourceDir, "functions.yaml")).isFile()).to.be.true;
    });

    it("should throw error if GitHub Archive download fails", async () => {
      mockfs({ "/dest": {} });
      downloadToTmpStub.rejects(new Error("404 Not Found"));

      await expect(
        getRemoteSource("https://github.com/org/repo", "main", "/dest"),
      ).to.be.rejectedWith(FirebaseError, /Failed to download GitHub archive/);
    });

    it("should throw error for non-GitHub URLs", async () => {
      mockfs({ "/dest": {} });
      await expect(
        getRemoteSource("https://gitlab.com/org/repo", "main", "/dest"),
      ).to.be.rejectedWith(FirebaseError, /Only GitHub repositories are supported/);
    });

    it("should validate subdirectory exists after clone", async () => {
      const zipBuffer = await createZipBuffer(
        { "functions.yaml": "runtime: nodejs16" },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      await expect(
        getRemoteSource("https://github.com/org/repo", "main", "/dest", "nonexistent"),
      ).to.be.rejectedWith(FirebaseError, /Directory 'nonexistent' not found/);
    });

    it("should return source even if functions.yaml is missing", async () => {
      const zipBuffer = await createZipBuffer({ "index.js": "console.log('hello')" }, "repo-main");
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource("https://github.com/org/repo", "main", "/dest");

      expect(sourceDir).to.match(/repo-main$/);
      expect(fs.statSync(path.join(sourceDir, "index.js")).isFile()).to.be.true;
      expect(() => fs.statSync(path.join(sourceDir, "functions.yaml"))).to.throw();
    });

    it("should prevent path traversal in subdirectory", async () => {
      const zipBuffer = await createZipBuffer(
        { "functions.yaml": "runtime: nodejs16" },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      await expect(
        getRemoteSource("https://github.com/org/repo", "main", "/dest", "../outside"),
      ).to.be.rejectedWith(FirebaseError, /must not escape/);
    });

    it("should return subdirectory if specified", async () => {
      const zipBuffer = await createZipBuffer(
        {
          "functions.yaml": "runtime: nodejs16",
          "app/index.js": "console.log('hello')",
          "app/functions.yaml": "runtime: nodejs16",
        },
        "repo-main",
      );
      mockfs({
        "/tmp/source.zip": zipBuffer,
        "/dest": {},
      });
      downloadToTmpStub.resolves("/tmp/source.zip");

      const sourceDir = await getRemoteSource(
        "https://github.com/org/repo",
        "main",
        "/dest",
        "app",
      );

      expect(sourceDir).to.match(/repo-main\/app$/);
      expect(fs.statSync(path.join(sourceDir, "index.js")).isFile()).to.be.true;
      expect(fs.statSync(path.join(sourceDir, "functions.yaml")).isFile()).to.be.true;
    });
  });
});
