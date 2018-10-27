import { expect } from "chai";
import { resolve } from "path";

import { listFiles } from "../listFiles";

describe("listFiles", () => {
  // for details, see the file structure and firebase.json in test/fixtures/ignores
  it("should ignore firebase-debug.log, specified ignores, and nothing else", () => {
    const fileNames = listFiles(resolve(__dirname, "./fixtures/ignores"), [
      "**/.*",
      "firebase.json",
      "ignored.txt",
      "ignored/**/*.txt",
    ]);
    expect(fileNames).to.deep.equal(["index.html", "ignored/index.html", "present/index.html"]);
  });

  it("should allow us to not specify additional ignores", () => {
    const fileNames = listFiles(resolve(__dirname, "./fixtures/ignores"));
    expect(fileNames.sort()).to.have.members([
      ".hiddenfile",
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
