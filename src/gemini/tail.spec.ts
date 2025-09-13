import { expect } from "chai";
import * as mockFs from "mock-fs";
import { tail } from "./tail";

describe("tail", () => {
  afterEach(() => {
    mockFs.restore();
  });

  it("should return the last N lines of a file", async () => {
    mockFs({
      "test.log": "line1\nline2\nline3\nline4\nline5",
    });
    const lines = await tail("test.log", 3);
    expect(lines).to.deep.equal(["line3", "line4", "line5"]);
  });

  it("should return all lines if N is larger than the file's line count", async () => {
    mockFs({
      "test.log": "line1\nline2",
    });
    const lines = await tail("test.log", 5);
    expect(lines).to.deep.equal(["line1", "line2"]);
  });

  it("should return all lines if N is equal to the file's line count", async () => {
    mockFs({
      "test.log": "line1\nline2\nline3",
    });
    const lines = await tail("test.log", 3);
    expect(lines).to.deep.equal(["line1", "line2", "line3"]);
  });

  it("should return an empty array for an empty file", async () => {
    mockFs({
      "test.log": "",
    });
    const lines = await tail("test.log", 5);
    expect(lines).to.deep.equal([]);
  });

  it("should return an empty array for a non-existent file", async () => {
    mockFs({});
    const lines = await tail("nonexistent.log", 5);
    expect(lines).to.deep.equal([]);
  });
});
