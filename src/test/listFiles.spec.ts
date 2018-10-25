import { expect } from "chai";

import * as path from "path";

import { listFiles } from "../listFiles";

describe("listFiles", () => {
  // for details, see the file structure and firebase.json in test/fixtures/ignores
  it("should ignore firebase-debug.log, specified ignores, and nothing else", () => {
    const fileNames = listFiles(path.resolve(__dirname, "./fixtures/ignores"), [
      "**/.*",
      "firebase.json",
      "ignored.txt",
      "ignored/**/*.txt",
    ]);
    expect(fileNames).to.deep.equal(["index.html", "ignored/index.html", "present/index.html"]);
  });
});
