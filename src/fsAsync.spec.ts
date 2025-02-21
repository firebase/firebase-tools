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
//   ignored/
//     not-included
//   subdir/
//     subfile
//       nesteddir/
//         nestedfile
//       node_modules/
//         nestednodemodules
//     ignored
//        included
//   node_modules
//     subfile
describe("fsAsync", () => {
  let baseDir = "";
  const files = [
    ".hidden",
    "visible",
    "ignored/not-included",
    "subdir/subfile",
    "subdir/nesteddir/nestedfile",
    "subdir/node_modules/nestednodemodules",
    "subdir/ignored/included",
    "node_modules/subfile",
  ];

  before(() => {
    baseDir = path.join(os.tmpdir(), crypto.randomBytes(10).toString("hex"));
    fs.mkdirSync(baseDir);
    fs.mkdirSync(path.join(baseDir, "ignored"));
    fs.mkdirSync(path.join(baseDir, "subdir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "nesteddir"));
    fs.mkdirSync(path.join(baseDir, "subdir", "node_modules"));
    fs.mkdirSync(path.join(baseDir, "subdir", "ignored"));
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
      const results = await fsAsync.readdirRecursive({ path: baseDir, ignore: ["node_modules"] });

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
        ignore: ["**/node_modules/**", "ignored/*"],
      });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .filter((file) => !file.includes("node_modules"))
        .filter((file) => !file.includes("not-included"))
        .map((file) => path.join(baseDir, file))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });

    it("should support negation rules", async () => {
      const results = await fsAsync.readdirRecursive({ path: baseDir, ignore: ["!visible"] });

      const gotFileNames = results.map((r) => r.name).sort();
      const expectFiles = files
        .filter((file) => file === "visible")
        .map((file) => path.join(baseDir, file))
        .sort();
      return expect(gotFileNames).to.deep.equal(expectFiles);
    });
  });
});
