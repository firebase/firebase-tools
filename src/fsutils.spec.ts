import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as tmp from "tmp";
import { fileExistsSync, dirExistsSync, readFile, listFiles, moveAll } from "./fsutils";

describe("fsutils", () => {
  let tmpDir: tmp.DirResult;

  beforeEach(() => {
    tmpDir = tmp.dirSync({ unsafeCleanup: true });
  });

  afterEach(() => {
    tmpDir.removeCallback();
  });

  describe("fileExistsSync", () => {
    it("should return true if the file exists", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test.txt"), "hello");
      expect(fileExistsSync(path.join(tmpDir.name, "test.txt"))).to.be.true;
    });

    it("should return false if a file does not exist", () => {
      expect(fileExistsSync(path.join(tmpDir.name, "test.txt"))).to.be.false;
    });

    it("should return false for a directory", () => {
      fs.mkdirSync(path.join(tmpDir.name, "test-dir"));
      expect(fileExistsSync(path.join(tmpDir.name, "test-dir"))).to.be.false;
    });
  });

  describe("dirExistsSync", () => {
    it("should return true if a directory exists", () => {
      fs.mkdirSync(path.join(tmpDir.name, "test-dir"));
      expect(dirExistsSync(path.join(tmpDir.name, "test-dir"))).to.be.true;
    });

    it("should return false if a directory does not exist", () => {
      expect(dirExistsSync(path.join(tmpDir.name, "test-dir"))).to.be.false;
    });

    it("should return false for a file", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test.txt"), "hello");
      expect(dirExistsSync(path.join(tmpDir.name, "test.txt"))).to.be.false;
    });
  });

  describe("readFile", () => {
    it("should read a file", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test.txt"), "hello world");
      expect(readFile(path.join(tmpDir.name, "test.txt"))).to.equal("hello world");
    });

    it("should throw an error if the file does not exist", () => {
      expect(() => readFile(path.join(tmpDir.name, "test.txt"))).to.throw("File not found");
    });
  });

  describe("listFiles", () => {
    it("should list files in a directory", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test1.txt"), "");
      fs.writeFileSync(path.join(tmpDir.name, "test2.txt"), "");
      fs.mkdirSync(path.join(tmpDir.name, "test-dir"));
      const files = listFiles(tmpDir.name).sort();
      expect(files).to.deep.equal(["test-dir", "test1.txt", "test2.txt"]);
    });

    it("should throw an error if the directory does not exist", () => {
      expect(() => listFiles(path.join(tmpDir.name, "non-existent-dir"))).to.throw(
        "Directory not found",
      );
    });

    it("should throw an error for a file", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test.txt"), "");
      expect(() => listFiles(path.join(tmpDir.name, "test.txt"))).to.throw();
    });
  });

  describe("readFile", () => {
    it("should read a file", () => {
      fs.writeFileSync(path.join(tmpDir.name, "test.txt"), "hello world");
      expect(readFile(path.join(tmpDir.name, "test.txt"))).to.equal("hello world");
    });

    it("should throw an error if the file does not exist", () => {
      expect(() => readFile(path.join(tmpDir.name, "test.txt"))).to.throw("File not found");
    });

    it("should throw an error for a directory", () => {
      fs.mkdirSync(path.join(tmpDir.name, "test-dir"));
      expect(() => readFile(path.join(tmpDir.name, "test-dir"))).to.throw();
    });
  });

  describe("moveAll", () => {
    it("should move all files and directories from one directory to another", () => {
      const srcDir = path.join(tmpDir.name, "src");
      const destDir = path.join(tmpDir.name, "dest");
      fs.mkdirSync(srcDir);
      fs.writeFileSync(path.join(srcDir, "file1.txt"), "hello");
      fs.mkdirSync(path.join(srcDir, "dir1"));
      fs.writeFileSync(path.join(srcDir, "dir1", "file2.txt"), "world");

      moveAll(srcDir, destDir);

      expect(fs.existsSync(path.join(destDir, "file1.txt"))).to.be.true;
      expect(fs.existsSync(path.join(destDir, "dir1"))).to.be.true;
      expect(fs.existsSync(path.join(destDir, "dir1", "file2.txt"))).to.be.true;
    });

    it("should not move the destination directory into itself", () => {
      const srcDir = path.join(tmpDir.name, "src");
      const destDir = path.join(srcDir, "dest");
      fs.mkdirSync(srcDir);
      fs.mkdirSync(destDir);
      fs.writeFileSync(path.join(srcDir, "file1.txt"), "hello");

      moveAll(srcDir, destDir);

      expect(fs.existsSync(path.join(destDir, "file1.txt"))).to.be.true;
      expect(fs.existsSync(path.join(destDir, "dest"))).to.be.false;
    });
  });
});
