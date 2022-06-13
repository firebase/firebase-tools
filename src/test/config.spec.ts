import { expect } from "chai";
import * as path from "path";

import { Config } from "../config";

function fixtureDir(name: string): string {
  return path.resolve(__dirname, "./fixtures/" + name);
}

describe("Config", () => {
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

  describe("#parseFile", () => {
    it("should load a cjson file", () => {
      const config = new Config({}, { cwd: fixtureDir("config-imports") });
      expect(config.parseFile("hosting", "hosting.json").public).to.equal(".");
    });

    it("should error out for an unknown file", () => {
      const config = new Config({}, { cwd: fixtureDir("config-imports") });
      expect(() => {
        config.parseFile("hosting", "i-dont-exist.json");
      }).to.throw("Imported file i-dont-exist.json does not exist");
    });

    it("should error out for an unrecognized extension", () => {
      const config = new Config({}, { cwd: fixtureDir("config-imports") });
      expect(() => {
        config.parseFile("hosting", "unsupported.txt");
      }).to.throw("unsupported.txt is not of a supported config file type");
    });
  });

  describe("#materialize", () => {
    it("should assign unaltered if an object is found", () => {
      const config = new Config({ example: { foo: "bar" } }, {});
      expect(config.materialize("example").foo).to.equal("bar");
    });

    it("should prevent top-level key duplication", () => {
      const config = new Config({ rules: "rules.json" }, { cwd: fixtureDir("dup-top-level") });
      expect(config.materialize("rules")).to.deep.equal({ ".read": true });
    });
  });
});
