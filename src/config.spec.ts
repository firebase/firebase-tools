import { expect } from "chai";
import * as path from "path";

import { Config } from "./config";
import { FIREBASE_JSON_PATH as VALID_CONFIG_PATH } from "./test/fixtures/valid-config";
import { FIXTURE_DIR as SIMPLE_CONFIG_DIR } from "./test/fixtures/config-imports";
import { FIXTURE_DIR as DUP_TOP_LEVEL_CONFIG_DIR } from "./test/fixtures/dup-top-level";
import * as os from "os";
import * as fs from "fs";
import * as tmp from "tmp";

describe("Config", () => {
  describe("#load", () => {
    it("should load a cjson file when configPath is specified", () => {
      const cwd = __dirname;
      const config = Config.load({
        cwd,
        configPath: path.relative(cwd, VALID_CONFIG_PATH),
      });
      expect(config).to.not.be.null;
      if (config) {
        expect(config.get("database.rules")).to.eq("config/security-rules.json");
      }
    });
  });

  describe("#path", () => {
    it("should skip an absolute path", () => {
      const config = new Config({}, { cwd: SIMPLE_CONFIG_DIR });
      const absPath = "/Users/something";
      expect(config.path(absPath)).to.eq(absPath);
    });
    it("should append a non-absolute path", () => {
      const config = new Config({}, { cwd: SIMPLE_CONFIG_DIR });
      const relativePath = "something";
      expect(config.path(relativePath)).to.eq(path.join(SIMPLE_CONFIG_DIR, relativePath));
    });
  });

  describe("#parseFile", () => {
    it("should load a cjson file", () => {
      const config = new Config({}, { cwd: SIMPLE_CONFIG_DIR });
      expect(config.parseFile("hosting", "hosting.json").public).to.equal(".");
    });

    it("should error out for an unknown file", () => {
      const config = new Config({}, { cwd: SIMPLE_CONFIG_DIR });
      expect(() => {
        config.parseFile("hosting", "i-dont-exist.json");
      }).to.throw("Imported file i-dont-exist.json does not exist");
    });

    it("should error out for an unrecognized extension", () => {
      const config = new Config({}, { cwd: SIMPLE_CONFIG_DIR });
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
      const config = new Config({ rules: "rules.json" }, { cwd: DUP_TOP_LEVEL_CONFIG_DIR });
      expect(config.materialize("rules")).to.deep.equal({ ".read": true });
    });
  });

  describe("default functions.source injection", () => {
    it("does not inject when remoteSource is present", () => {
      const tdir = tmp.dirSync({ prefix: "fb-config-inject-", unsafeCleanup: true });
      const dir = tdir.name;
      fs.mkdirSync(path.join(dir, "functions"));
      // Ensure detectProjectRoot sets projectDir to this tmp folder.
      fs.writeFileSync(path.join(dir, "firebase.json"), "{}", "utf8");
      const cfg = new Config(
        {
          functions: {
            remoteSource: { repository: "https://github.com/org/repo", ref: "main" },
            runtime: "nodejs20",
          },
        },
        { cwd: dir },
      );
      // Should not inject functions.source when remoteSource is set
      expect(cfg.get("functions.source")).to.be.undefined;
    });

    it("injects when neither source nor remoteSource is set and default dir exists", () => {
      const tdir = tmp.dirSync({ prefix: "fb-config-inject-", unsafeCleanup: true });
      const dir = tdir.name;
      fs.mkdirSync(path.join(dir, "functions"));
      // Create a minimal firebase.json so detectProjectRoot() identifies the projectDir
      fs.writeFileSync(path.join(dir, "firebase.json"), "{}", "utf8");
      const cfg = new Config({ functions: {} }, { cwd: dir });
      expect(cfg.get("functions.source")).to.equal("functions");
    });
  });
});
