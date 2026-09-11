import { expect } from "chai";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { listFiles } from "./listFiles";
import { FIXTURE_DIR } from "./test/fixtures/ignores";

describe("listFiles", () => {
  // for details, see the file structure and firebase.json in test/fixtures/ignores
  it("should ignore firebase-debug.log, specified ignores, and nothing else", () => {
    const fileNames = listFiles(FIXTURE_DIR, [
      "index.ts",
      "**/.*",
      "firebase.json",
      "ignored.txt",
      "ignored/**/*.txt",
    ]);
    expect(fileNames).to.have.members(["index.html", "ignored/index.html", "present/index.html"]);
  });

  it("should allow us to not specify additional ignores", () => {
    const fileNames = listFiles(FIXTURE_DIR);
    expect(fileNames.sort()).to.have.members([
      ".hiddenfile",
      "index.ts",
      "firebase.json",
      "ignored.txt",
      "ignored/deeper/index.txt",
      "ignored/ignore.txt",
      "ignored/index.html",
      "index.html",
      "present/index.html",
    ]);
  });

  describe("symlink handling", () => {
    let tmpRoot = "";
    let outsideTarget = "";

    before(() => {
      tmpRoot = path.join(os.tmpdir(), "fb-tools-listFiles-" + crypto.randomBytes(6).toString("hex"));
      fs.mkdirSync(tmpRoot, { recursive: true });
      // Two regular files inside the public dir.
      fs.writeFileSync(path.join(tmpRoot, "index.html"), "<!doctype html>");
      fs.mkdirSync(path.join(tmpRoot, "static"));
      fs.writeFileSync(path.join(tmpRoot, "static", "app.js"), "// app");
      // A target outside the public dir to simulate the credential-leak case.
      outsideTarget = path.join(os.tmpdir(), "fb-tools-listFiles-leak-" + crypto.randomBytes(6).toString("hex"));
      fs.writeFileSync(outsideTarget, "SECRET-CONTENT");
    });

    after(() => {
      if (tmpRoot) {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
      if (outsideTarget) {
        fs.rmSync(outsideTarget, { force: true });
      }
    });

    it("excludes a symlink-to-file at the top level (security: prevents leaking files outside source tree)", () => {
      const linkPath = path.join(tmpRoot, "leak");
      try {
        fs.symlinkSync(outsideTarget, linkPath);
        const result = listFiles(tmpRoot);
        expect(result.sort()).to.have.members(["index.html", "static/app.js"]);
        expect(result).to.not.include("leak");
      } finally {
        try {
          fs.unlinkSync(linkPath);
        } catch {
          /* ignore */
        }
      }
    });

    it("excludes a symlink-to-file nested inside the source tree", () => {
      const linkPath = path.join(tmpRoot, "static", "leak");
      try {
        fs.symlinkSync(outsideTarget, linkPath);
        const result = listFiles(tmpRoot);
        expect(result.sort()).to.have.members(["index.html", "static/app.js"]);
        expect(result).to.not.include("static/leak");
      } finally {
        try {
          fs.unlinkSync(linkPath);
        } catch {
          /* ignore */
        }
      }
    });

    it("does not descend into symlinked directories", () => {
      const outsideDir = path.join(
        os.tmpdir(),
        "fb-tools-listFiles-leakdir-" + crypto.randomBytes(6).toString("hex"),
      );
      fs.mkdirSync(outsideDir);
      fs.writeFileSync(path.join(outsideDir, "secret"), "SECRET-CONTENT");
      const linkDirPath = path.join(tmpRoot, "linked-dir");
      try {
        fs.symlinkSync(outsideDir, linkDirPath, "dir");
        const result = listFiles(tmpRoot);
        expect(result.sort()).to.have.members(["index.html", "static/app.js"]);
        // No file from the linked dir should appear, regardless of stat behavior.
        for (const r of result) {
          expect(r.startsWith("linked-dir")).to.equal(false);
        }
      } finally {
        try {
          fs.unlinkSync(linkDirPath);
        } catch {
          /* ignore */
        }
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });
});
