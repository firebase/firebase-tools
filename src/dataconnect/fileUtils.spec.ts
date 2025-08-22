import { expect } from "chai";
import * as fs from "fs-extra";
import { fileExists } from "./fileUtils";

describe("fileExists", () => {
  const testFile = "test.txt";
  afterEach(() => {
    fs.removeSync(testFile);
  });

  it("should return true if file exists", () => {
    fs.outputFileSync(testFile, "hello");
    expect(fileExists(testFile)).to.be.true;
  });

  it("should return false if file does not exist", () => {
    expect(fileExists(testFile)).to.be.false;
  });
});
