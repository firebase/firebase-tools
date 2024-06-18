import { expect } from "chai";

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
});
