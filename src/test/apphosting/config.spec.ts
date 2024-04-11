import { expect } from "chai";
import * as sinon from "sinon";
import * as yaml from "yaml";

import * as fsImport from "../../fsutils";
import * as config from "../../apphosting/config";
import { NodeType } from "yaml/dist/nodes/Node";

describe("config", () => {
  describe("yamlPath", () => {
    let fs: sinon.SinonStubbedInstance<typeof fsImport>;

    beforeEach(() => {
      fs = sinon.stub(fsImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("finds apphosting.yaml at cwd", () => {
      fs.fileExistsSync.withArgs("/cwd/apphosting.yaml").returns(true);
      expect(config.yamlPath("/cwd")).equals("/cwd/apphosting.yaml");
    });

    it("finds apphosting.yaml in a parent directory", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(true);

      expect(config.yamlPath("/parent/cwd")).equals("/parent/apphosting.yaml");
    });

    it("returns null if it finds firebase.json without finding apphosting.yaml", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(true);

      expect(config.yamlPath("/parent/cwd")).equals(null);
    });

    it("returns if it reaches the fs root", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/firebase.json").returns(false);

      expect(config.yamlPath("/parent/cwd")).equals(null);
    });
  });

  describe("get/setEnv", () => {
    it("sets new envs", () => {
      const doc = new yaml.Document<NodeType<config.Config>>();
      const env: config.Env = {
        variable: "VARIABLE",
        value: "value",
      };

      config.setEnv(doc, env);

      const envAgain = config.getEnv(doc, env.variable);
      expect(envAgain).deep.equals(env);

      // Also check raw YAML:
      const envs = doc.get("env") as yaml.YAMLSeq<config.Env>;
      expect(envs.toJSON()).to.deep.equal([env]);
    });

    it("overwrites envs", () => {
      const doc = new yaml.Document<NodeType<config.Config>>();
      const env: config.Env = {
        variable: "VARIABLE",
        value: "value",
      };

      const newEnv: config.Env = {
        variable: env.variable,
        secret: "my-secret",
      };

      config.setEnv(doc, env);
      config.setEnv(doc, newEnv);

      expect(config.getEnv(doc, env.variable)).to.deep.equal(newEnv);
    });

    it("Preserves comments", () => {
      const rawDoc = `
# Run config
runConfig:
  # Reserve capacity
  minInstances: 1

env:
  # Publicly available
  - variable: NEXT_PUBLIC_BUCKET
    value: mybucket.appspot.com
`.trim();

      const expectedAmendments = `
  - variable: GOOGLE_API_KEY
    secret: api-key
`;

      const doc = yaml.parseDocument(rawDoc) as yaml.Document<NodeType<config.Config>>;
      config.setEnv(doc, {
        variable: "GOOGLE_API_KEY",
        secret: "api-key",
      });

      expect(doc.toString()).to.equal(rawDoc + expectedAmendments);
    });
  });
});
