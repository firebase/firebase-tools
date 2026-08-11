import { expect } from "chai";
import * as sinon from "sinon";
import { AppHostingYamlConfig, toEnvMap, toEnvList } from "./yaml";
import * as configModule from "./config";
import * as utils from "../utils";
import * as fsutils from "../fsutils";
import { FirebaseError } from "../error";

describe("apphosting/yaml", () => {
  let fileExistsStub: sinon.SinonStub;
  let readFileStub: sinon.SinonStub;
  let storeStub: sinon.SinonStub;

  beforeEach(() => {
    fileExistsStub = sinon.stub(fsutils, "fileExistsSync");
    readFileStub = sinon.stub(utils, "readFileFromDirectory");
    storeStub = sinon.stub(configModule, "store");
  });

  afterEach(() => {
    sinon.restore();
  });

  describe("loadFromFile", () => {
    it("should successfully load configuration with env vars", async () => {
      fileExistsStub.returns(true);
      readFileStub.resolves({ source: "env:\n  - variable: FOO\n    value: bar" });

      const res = await AppHostingYamlConfig.loadFromFile("apphosting.yaml");

      expect(res.filename).to.equal("apphosting.yaml");
      expect(res.env).to.deep.equal({ FOO: { value: "bar" } });
    });

    it("should throw if file does not exist", async () => {
      fileExistsStub.returns(false);

      await expect(AppHostingYamlConfig.loadFromFile("missing.yaml")).to.be.rejectedWith(
        FirebaseError,
        /Cannot load missing.yaml from given path/,
      );
    });

    it("should return empty env if file contains no env", async () => {
      fileExistsStub.returns(true);
      readFileStub.resolves({ source: "runConfig:\n  cpu: 2" });

      const res = await AppHostingYamlConfig.loadFromFile("apphosting.yaml");

      expect(res.env).to.deep.equal({});
    });
  });

  describe("empty", () => {
    it("should create an empty config", () => {
      const res = AppHostingYamlConfig.empty();
      expect(res.env).to.deep.equal({});
    });
  });

  describe("merge", () => {
    it("should override variables from incoming config", () => {
      const base = AppHostingYamlConfig.empty();
      base.env = { FOO: { value: "1" }, BAR: { secret: "sec" } };

      const other = AppHostingYamlConfig.empty();
      other.env = { FOO: { value: "2" }, BAZ: { value: "3" } };

      base.merge(other, true);

      expect(base.env).to.deep.equal({
        FOO: { value: "2" },
        BAR: { secret: "sec" },
        BAZ: { value: "3" },
      });
    });

    it("should throw when a secret turns into plaintext and allowSecretsToBecomePlaintext is false", () => {
      const base = AppHostingYamlConfig.empty();
      base.env = { DB_PASS: { secret: "my-secret" } };

      const other = AppHostingYamlConfig.empty();
      other.env = { DB_PASS: { value: "plaintext" } };

      expect(() => base.merge(other, false)).to.throw(/Cannot convert secret to plaintext/);
    });
  });

  describe("utilities", () => {
    it("toEnvMap", () => {
      const list = [{ variable: "FOO", value: "bar" }];
      const map = toEnvMap(list);
      expect(map).to.deep.equal({ FOO: { value: "bar" } });
    });

    it("toEnvList", () => {
      const map = { FOO: { value: "bar" } };
      const list = toEnvList(map);
      expect(list).to.deep.equal([{ variable: "FOO", value: "bar" }]);
    });
  });

  describe("upsertFile", () => {
    it("should parse, merge, and store successfully", async () => {
      fileExistsStub.returns(true);
      readFileStub.resolves({ source: "env:\n  - variable: FOO\n    value: bar" });

      const conf = AppHostingYamlConfig.empty();
      conf.env = { BAZ: { value: "qux" } };

      await conf.upsertFile("apphosting.yaml");

      expect(storeStub).to.have.been.calledOnce;
    });
  });
});
