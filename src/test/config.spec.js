"use strict";

var chai = require("chai");
var expect = chai.expect;

var Config = require("../config");
var path = require("path");

var _fixtureDir = function(name) {
  return path.resolve(__dirname, "./fixtures/" + name);
};

describe("Config", function() {
  describe("#_parseFile", function() {
    it("should load a cjson file", function() {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(config._parseFile("hosting", "hosting.json").public).to.equal(".");
    });

    it("should error out for an unknown file", function() {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(function() {
        config._parseFile("hosting", "i-dont-exist.json");
      }).to.throw("Imported file i-dont-exist.json does not exist");
    });

    it("should error out for an unrecognized extension", function() {
      var config = new Config({}, { cwd: _fixtureDir("config-imports") });
      expect(function() {
        config._parseFile("hosting", "unsupported.txt");
      }).to.throw("unsupported.txt is not of a supported config file type");
    });
  });

  describe("#_materialize", function() {
    it("should assign unaltered if an object is found", function() {
      var config = new Config({ example: { foo: "bar" } }, {});
      expect(config._materialize("example").foo).to.equal("bar");
    });

    it("should prevent top-level key duplication", function() {
      var config = new Config({ rules: "rules.json" }, { cwd: _fixtureDir("dup-top-level") });
      expect(config._materialize("rules")).to.deep.equal({ ".read": true });
    });
  });

  describe("#load", function() {
    it("should try to load default config if no config flag is provided", function() {
      var config = Config.load({ cwd: _fixtureDir("config-imports") });
      expect(config._src.hosting).to.equal("hosting.json");
      expect(config._src.rules).to.equal("rules.json");
    });

    it("should load config from specified path when config flag is provided", function() {
      var config = Config.load({
        cwd: _fixtureDir("invalid-config"),
        configPath: "../valid-config/still-valid-firebase.json",
      });
      expect(config._src.firebase).to.equal("myfirebasetoo");
    });
  });
});
