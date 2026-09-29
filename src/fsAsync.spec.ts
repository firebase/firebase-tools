import { expect } from "chai";
import * as crypto from "crypto";
import * as fs from "fs-extra";
import * as os from "os";
import * as path from "path";
import { rmSync } from "node:fs";

import * as fsAsync from "./fsAsync";

// These tests work on the following directory structure:
// <basedir>
//   .hidden
//   visible
//   subdir/
//     subfile
//     nesteddir/
//       nestedfile
//       nestedfile2
//     node_modules/
//       nestednodemodules
//   node_modules
//     subfile
describe("fsAsync", () => {
  let baseDir = "";
  const files = [
    ".hidden",
    "visible",
    "subdir/subfile",
    "subdir/nesteddir/nestedfile",
    "subdir/nesteddir/nestedfile2",
    "subdir/node_modules/nestednodemodules",
    "node_modules/subfile",
  ];

  before(() => {
    baseDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
    fs.mkdirSync(baseDir);
    fs.mkdirSync(path.join(baseDir, "subdir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "nesteddir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "node_modules"));
    fs.mkdirSync(path.join(baseDir, "node_modules"));
    for (const file of files) {
      fs.writeFileSync(path.join(baseDir, file), file);
    }
  });

  after(() => {
    rmSync(baseDir, { recursive: true });
    expect(() => {
      fs.statSync(baseDir);
    }).to.throw();
  });

  describe("readdirRecursive", () => {
    it("can recurse directories", async () => {
      const results = await fsAsync.readdirRecursive({ path: baseDir });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files.map((file) => path.join(baseDir, file)).sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("can ignore directories", async () => {
      const results = await fsAsync.readdirRecursive({
        path: baseDir,
        ignoreStrings: ["node_modules"],
      });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .filter((file) => !file.includes("node_modules"))
        .map((file) => path.join(baseDir, file))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("supports blob rules", async () => {
      const results = await fsAsync.readdirRecursive({
        path: baseDir,
        ignoreStrings: ["**/node_modules/**"],
      });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .filter((file) => !file.includes("node_modules"))
        .map((file) => path.join(baseDir, file))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("should support negation rules", async () => {
      const results = await fsAsync.readdirRecursive({
        path: baseDir,
        ignoreStrings: ["!visible"],
      });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .filter((file) => file === "visible")
        .map((file) => path.join(baseDir, file))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("should support .gitignore rules via options", async () => {
      const results = await fsAsync.readdirRecursive({
        path: baseDir,
        ignoreStrings: ["subdir/nesteddir/*", "!subdir/nesteddir/nestedfile"],
        supportGitIgnore: true,
      });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .map((file) => path.join(baseDir, file))
        .filter((file) => file !== path.join(baseDir, "subdir/nesteddir/nestedfile2"))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("should support .gitignore files in subdirectories dynamically", async () => {
      const testDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
      fs.mkdirSync(testDir);
      fs.mkdirSync(path.join(testDir, "a"));
      fs.mkdirSync(path.join(testDir, "b"));

      fs.writeFileSync(path.join(testDir, "b.txt"), "b.txt");
      fs.writeFileSync(path.join(testDir, "a", "foo.txt"), "foo.txt");
      fs.writeFileSync(path.join(testDir, "a", ".env"), ".env");
      fs.writeFileSync(path.join(testDir, "b", "bar.txt"), "bar.txt");

      fs.writeFileSync(path.join(testDir, ".gitignore"), "b.txt");
      fs.writeFileSync(path.join(testDir, "a", ".gitignore"), ".env");

      try {
        const results = await fsAsync.readdirRecursive({
          path: testDir,
          supportGitIgnore: true,
          ignoreStrings: ["node_modules", ".git", "b.txt"],
        });

        const gotFileNames = results.map((r) => path.relative(testDir, r.name)).sort();
        const expectedFiles = [".gitignore", "a/.gitignore", "a/foo.txt", "b/bar.txt"].sort();

        expect(gotFileNames).to.deep.equal(expectedFiles);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should respect nested subdirectory overrides and path scoping", async () => {
      const testDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
      fs.mkdirSync(testDir);
      fs.mkdirSync(path.join(testDir, "subdir"));
      fs.mkdirSync(path.join(testDir, "subdir", "nested"));

      fs.writeFileSync(path.join(testDir, "subdir", "foo.txt"), "foo");
      fs.writeFileSync(path.join(testDir, "subdir", "bar.txt"), "bar");
      fs.writeFileSync(path.join(testDir, "subdir", "nested", "foo.txt"), "nested foo");
      fs.writeFileSync(path.join(testDir, "subdir", "nested", "baz.txt"), "nested baz");

      fs.writeFileSync(path.join(testDir, ".gitignore"), "*.txt");
      fs.writeFileSync(
        path.join(testDir, "subdir", ".gitignore"),
        ["!foo.txt", "/nested/baz.txt"].join("\n"),
      );

      try {
        const results = await fsAsync.readdirRecursive({
          path: testDir,
          supportGitIgnore: true,
        });

        const gotFileNames = results.map((r) => path.relative(testDir, r.name)).sort();
        const expectedFiles = [
          ".gitignore",
          "subdir/.gitignore",
          "subdir/foo.txt",
          "subdir/nested/foo.txt",
        ].sort();

        expect(gotFileNames).to.deep.equal(expectedFiles);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should handle subdirectories without .gitignore and directories named .gitignore gracefully", async () => {
      const testDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
      fs.mkdirSync(testDir);

      fs.mkdirSync(path.join(testDir, "a"));
      fs.writeFileSync(path.join(testDir, "a", "keep.log"), "keep");
      fs.writeFileSync(path.join(testDir, "a", "ignore.log"), "ignore");

      fs.mkdirSync(path.join(testDir, "b"));
      fs.mkdirSync(path.join(testDir, "b", ".gitignore"));
      fs.writeFileSync(path.join(testDir, "b", "file.txt"), "file");

      fs.writeFileSync(path.join(testDir, ".gitignore"), "ignore.log");

      try {
        const results = await fsAsync.readdirRecursive({
          path: testDir,
          supportGitIgnore: true,
        });

        const gotFileNames = results.map((r) => path.relative(testDir, r.name)).sort();
        const expectedFiles = [".gitignore", "a/keep.log", "b/file.txt"].sort();

        expect(gotFileNames).to.deep.equal(expectedFiles);
      } finally {
        rmSync(testDir, { recursive: true, force: true });
      }
    });

    it("should support maximum recursion depth", async () => {
      const results = await fsAsync.readdirRecursive({ path: baseDir, maxDepth: 2 });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = [".hidden", "visible", "subdir/subfile", "node_modules/subfile"];
      const expectPaths = expectFiles.map((file) => path.join(baseDir, file)).sort();
      return expect(gotFileNames).to.deep.equal(expectPaths);
    });

    it("should ignore invalid maximum recursion depth", async () => {
      const results = await fsAsync.readdirRecursive({ path: baseDir, maxDepth: 0 });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files.map((file) => path.join(baseDir, file)).sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("should ignore symlinks when option is set", async () => {
      const symlinkPath = path.join(baseDir, "symlink");
      fs.symlinkSync(path.join(baseDir, "visible"), symlinkPath);

      try {
        const resultsWithSymlinks = await fsAsync.readdirRecursive({
          path: baseDir,
          ignoreSymlinks: true,
        });
        const gotFileNamesWithSymlinks = resultsWithSymlinks.map((r) => r.name).sort();
        const expectFiles = files.map((file) => path.join(baseDir, file)).sort();
        expect(gotFileNamesWithSymlinks).to.deep.equal(expectFiles);

        const resultsWithoutSymlinks = await fsAsync.readdirRecursive({
          path: baseDir,
          ignoreSymlinks: false,
        });
        const gotFileNamesWithoutSymlinks = resultsWithoutSymlinks.map((r) => r.name).sort();
        const expectFilesWithSymlinks = [...files, "symlink"]
          .map((file) => path.join(baseDir, file))
          .sort();
        expect(gotFileNamesWithoutSymlinks).to.deep.equal(expectFilesWithSymlinks);
      } finally {
        fs.unlinkSync(symlinkPath);
      }
    });
  });
});
