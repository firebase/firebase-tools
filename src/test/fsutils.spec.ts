import { expect } from "chai";

import * as fsutils from "../fsutils";

describe("fsutils", () => {
  describe("fileExistsSync", () => {
    it("should return true if the file exists", () => {
      expect(fsutils.fileExistsSync(__filename)).to.be.true;
    });

    it("should return false if the file does not exist", () => {
      expect(fsutils.fileExistsSync(`${__filename}/nope.never`)).to.be.false;
    });

    it("should return false if the path is a directory", () => {
      expect(fsutils.fileExistsSync(__dirname)).to.be.false;
    });
  });

  describe("dirExistsSync", () => {
    it("should return true if the directory exists", () => {
      expect(fsutils.dirExistsSync(__dirname)).to.be.true;
    });

    it("should return false if the directory does not exist", () => {
      expect(fsutils.dirExistsSync(`${__dirname}/nope/never`)).to.be.false;
    });

    it("should return false if the path is a file", () => {
      expect(fsutils.dirExistsSync(__filename)).to.be.false;
    });
  });
});
