import { expect } from "chai";
import * as sinon from "sinon";
import * as yaml from "yaml";
import * as path from "path";

import * as fsImport from "../../fsutils";
import * as promptImport from "../../prompt";
import * as dialogs from "../../apphosting/secrets/dialogs";
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

      config.upsertEnv(doc, env);

      const envAgain = config.findEnv(doc, env.variable);
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

      config.upsertEnv(doc, env);
      config.upsertEnv(doc, newEnv);

      expect(config.findEnv(doc, env.variable)).to.deep.equal(newEnv);
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
      config.upsertEnv(doc, {
        variable: "GOOGLE_API_KEY",
        secret: "api-key",
      });

      expect(doc.toString()).to.equal(rawDoc + expectedAmendments);
    });
  });

  describe("maybeAddSecretToYaml", () => {
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;
    let yamlPath: sinon.SinonStub;
    let load: sinon.SinonStub;
    let findEnv: sinon.SinonStub;
    let upsertEnv: sinon.SinonStub;
    let store: sinon.SinonStub;
    let envVarForSecret: sinon.SinonStub;

    beforeEach(() => {
      prompt = sinon.stub(promptImport);
      yamlPath = sinon.stub(config, "yamlPath");
      load = sinon.stub(config, "load");
      findEnv = sinon.stub(config, "findEnv");
      upsertEnv = sinon.stub(config, "upsertEnv");
      store = sinon.stub(config, "store");
      envVarForSecret = sinon.stub(dialogs, "envVarForSecret");
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("noops if the env already exists", async () => {
      const doc = yaml.parseDocument("{}");
      yamlPath.returns("CWD/apphosting.yaml");
      load.returns(doc);
      findEnv.withArgs(doc, "SECRET").returns({ variable: "SECRET", secret: "SECRET" });

      await config.maybeAddSecretToYaml("SECRET");

      expect(yamlPath).to.have.been.called;
      expect(load).to.have.been.calledWith("CWD/apphosting.yaml");
      expect(prompt.confirm).to.not.have.been.called;
      expect(prompt.promptOnce).to.not.have.been.called;
    });

    it("inserts into an existing doc", async () => {
      const doc = yaml.parseDocument("{}");
      yamlPath.returns("CWD/apphosting.yaml");
      load.withArgs(path.join("CWD", "apphosting.yaml")).returns(doc);
      findEnv.withArgs(doc, "SECRET").returns(undefined);
      prompt.confirm.resolves(true);
      envVarForSecret.resolves("SECRET_VARIABLE");

      await config.maybeAddSecretToYaml("SECRET");

      expect(yamlPath).to.have.been.called;
      expect(load).to.have.been.calledWith("CWD/apphosting.yaml");
      expect(prompt.confirm).to.have.been.calledWithMatch({
        message: "Would you like to add this secret to apphosting.yaml?",
        default: true,
      });
      expect(envVarForSecret).to.have.been.calledWith("SECRET");
      expect(upsertEnv).to.have.been.calledWithMatch(doc, {
        variable: "SECRET_VARIABLE",
        secret: "SECRET",
      });
      expect(store).to.have.been.calledWithMatch(path.join("CWD", "apphosting.yaml"), doc);
      expect(prompt.promptOnce).to.not.have.been.called;
    });

    it("inserts into an new doc", async () => {
      const doc = new yaml.Document();
      yamlPath.returns(undefined);
      findEnv.withArgs(doc, "SECRET").returns(undefined);
      prompt.confirm.resolves(true);
      prompt.promptOnce.resolves("CWD");
      envVarForSecret.resolves("SECRET_VARIABLE");

      await config.maybeAddSecretToYaml("SECRET");

      expect(yamlPath).to.have.been.called;
      expect(load).to.not.have.been.called;
      expect(prompt.confirm).to.have.been.calledWithMatch({
        message: "Would you like to add this secret to apphosting.yaml?",
        default: true,
      });
      expect(prompt.promptOnce).to.have.been.calledWithMatch({
        message:
          "It looks like you don't have an apphosting.yaml yet. Where would you like to store it?",
        default: process.cwd(),
      });
      expect(envVarForSecret).to.have.been.calledWith("SECRET");
      expect(upsertEnv).to.have.been.calledWithMatch(doc, {
        variable: "SECRET_VARIABLE",
        secret: "SECRET",
      });
      expect(store).to.have.been.calledWithMatch(path.join("CWD", "apphosting.yaml"), doc);
    });
  });
});
