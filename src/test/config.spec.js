"use strict";

var chai = require("chai");
var expect = chai.expect;

const { Config } = require("../config");
var path = require("path");

var _fixtureDir = function (name) {
  return path.resolve(__dirname, "./fixtures/" + name);
};

describe("Config", function () {
  describe("#load", () => {
    it("should load a cjson file when configPath is specified", () => {
      const config = Config.load({
        cwd: __dirname,
        configPath: "./fixtures/valid-config/firebase.json",
      });
      expect(config).to.not.be.null;
      if (config) {
        expect(config.get("database.rules")).to.eq("config/security-rules.json");
      }
    });
  });

  describe("#parseFile", function () {
    it("should load a cjson file", function () {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(config.parseFile("hosting", "hosting.json").public).to.equal(".");
    });

    it("should error out for an unknown file", function () {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(function () {
        config.parseFile("hosting", "i-dont-exist.json");
      }).to.throw("Imported file i-dont-exist.json does not exist");
    });

    it("should error out for an unrecognized extension", function () {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(function () {
        config.parseFile("hosting", "unsupported.txt");
      }).to.throw("unsupported.txt is not of a supported config file type");
    });
  });

  describe("#materialize", function () {
    it("should assign unaltered if an object is found", function () {
      var config = new Config({ example: { foo: "bar" } }, {});
      expect(config.materialize("example").foo).to.equal("bar");
    });

    it("should prevent top-level key duplication", function () {
      var config = new Config({ rules: "rules.json" }, { cwd: _fixtureDir("dup-top-level") });
      expect(config.materialize("rules")).to.deep.equal({ ".read": true });
    });
  });
});
