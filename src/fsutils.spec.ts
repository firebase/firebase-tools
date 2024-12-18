import { expect } from "chai";

import * as fsutils from "./fsutils.js";


describe("fsutils", () => {
  describe("fileExistsSync", () => {
    it("should return true if the file exists", () => {
      expect(fsutils.fileExistsSync(import.meta.filename)).to.be.true;
    });

    it("should return false if the file does not exist", () => {
      expect(fsutils.fileExistsSync(`${import.meta.filename}/nope.never`)).to.be.false;
    });

    it("should return false if the path is a directory", () => {
      expect(fsutils.fileExistsSync(import.meta.dirname)).to.be.false;
    });
  });

  describe("dirExistsSync", () => {
    it("should return true if the directory exists", () => {
      expect(fsutils.dirExistsSync(import.meta.dirname)).to.be.true;
    });

    it("should return false if the directory does not exist", () => {
      expect(fsutils.dirExistsSync(`${import.meta.dirname}/nope/never`)).to.be.false;
    });

    it("should return false if the path is a file", () => {
      expect(fsutils.dirExistsSync(import.meta.filename)).to.be.false;
    });
  });
});
