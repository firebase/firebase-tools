import { expect } from "chai";
import * as sinon from "sinon";
import * as yaml from "yaml";
import * as path from "path";
import * as fsImport from "../fsutils";
import * as promptImport from "../prompt";
import * as dialogs from "./secrets/dialogs";
import * as config from "./config";
import { NodeType } from "yaml/dist/nodes/Node";
import { AppHostingYamlConfig } from "./yaml";

describe("config", () => {
  describe("discoverBackendRoot", () => {
    let fs: sinon.SinonStubbedInstance<typeof fsImport>;

    beforeEach(() => {
      fs = sinon.stub(fsImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("finds apphosting.yaml at cwd", () => {
      fs.fileExistsSync.withArgs("/cwd/apphosting.yaml").returns(true);
      expect(config.discoverBackendRoot("/cwd")).equals("/cwd");
    });

    it("finds apphosting.yaml in a parent directory", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(true);

      expect(config.discoverBackendRoot("/parent/cwd")).equals("/parent");
    });

    it("returns null if it finds firebase.json without finding apphosting.yaml", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(true);

      expect(config.discoverBackendRoot("/parent/cwd")).equals(null);
    });

    it("returns if it reaches the fs root", () => {
      fs.fileExistsSync.withArgs("/parent/cwd/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/cwd/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/parent/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/parent/firebase.json").returns(false);
      fs.fileExistsSync.withArgs("/apphosting.yaml").returns(false);
      fs.fileExistsSync.withArgs("/firebase.json").returns(false);

      expect(config.discoverBackendRoot("/parent/cwd")).equals(null);
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
    let discoverBackendRoot: sinon.SinonStub;
    let load: sinon.SinonStub;
    let findEnv: sinon.SinonStub;
    let upsertEnv: sinon.SinonStub;
    let store: sinon.SinonStub;
    let envVarForSecret: sinon.SinonStub;

    beforeEach(() => {
      prompt = sinon.stub(promptImport);
      discoverBackendRoot = sinon.stub(config, "discoverBackendRoot");
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
      discoverBackendRoot.returns("CWD");
      load.returns(doc);
      findEnv.withArgs(doc, "SECRET").returns({ variable: "SECRET", secret: "SECRET" });

      await config.maybeAddSecretToYaml("SECRET");

      expect(discoverBackendRoot).to.have.been.called;
      expect(load).to.have.been.calledWith("CWD/apphosting.yaml");
      expect(prompt.confirm).to.not.have.been.called;
      expect(prompt.promptOnce).to.not.have.been.called;
    });

    it("inserts into an existing doc", async () => {
      const doc = yaml.parseDocument("{}");
      discoverBackendRoot.returns("CWD");
      load.withArgs(path.join("CWD", "apphosting.yaml")).returns(doc);
      findEnv.withArgs(doc, "SECRET").returns(undefined);
      prompt.confirm.resolves(true);
      envVarForSecret.resolves("SECRET_VARIABLE");

      await config.maybeAddSecretToYaml("SECRET");

      expect(discoverBackendRoot).to.have.been.called;
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
      discoverBackendRoot.returns(null);
      findEnv.withArgs(doc, "SECRET").returns(undefined);
      prompt.confirm.resolves(true);
      prompt.promptOnce.resolves("CWD");
      envVarForSecret.resolves("SECRET_VARIABLE");

      await config.maybeAddSecretToYaml("SECRET");

      expect(discoverBackendRoot).to.have.been.called;
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

  describe("listAppHostingFilesInPath", () => {
    let fs: sinon.SinonStubbedInstance<typeof fsImport>;

    beforeEach(() => {
      fs = sinon.stub(fsImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("only returns valid App Hosting YAML files", () => {
      fs.listFiles
        .withArgs("/parent/cwd")
        .returns([
          "test1.js",
          "test2.js",
          "apphosting.yaml",
          "test4.js",
          "apphosting.staging.yaml",
        ]);

      const apphostingYamls = config.listAppHostingFilesInPath("/parent/cwd");
      expect(apphostingYamls).to.deep.equal([
        "/parent/cwd/apphosting.yaml",
        "/parent/cwd/apphosting.staging.yaml",
      ]);
    });
  });
  describe("loadConfigForEnvironment", () => {
    let loadFromFileStub: sinon.SinonStub;
    let baseAppHostingYaml: AppHostingYamlConfig;
    let stagingAppHostingYaml: AppHostingYamlConfig;

    beforeEach(() => {
      baseAppHostingYaml = AppHostingYamlConfig.empty();
      baseAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_1",
        value: "base_env_1",
      });
      baseAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_3",
        value: "base_env_3",
      });
      baseAppHostingYaml.addSecret({
        variable: "SECRET_1",
        secret: "base_secret_1",
      });
      baseAppHostingYaml.addSecret({
        variable: "SECRET_2",
        secret: "base_secret_2",
      });
      baseAppHostingYaml.addSecret({
        variable: "SECRET_3",
        secret: "base_secret_3",
      });

      stagingAppHostingYaml = AppHostingYamlConfig.empty();
      stagingAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_1",
        value: "staging_env_1",
      });
      stagingAppHostingYaml.addEnvironmentVariable({
        variable: "ENV_2",
        value: "staging_env_2",
      });
      stagingAppHostingYaml.addSecret({
        variable: "SECRET_1",
        secret: "staging_secret_1",
      });
      stagingAppHostingYaml.addSecret({
        variable: "SECRET_2",
        secret: "staging_secret_2",
      });

      loadFromFileStub = sinon.stub(AppHostingYamlConfig, "loadFromFile");
      loadFromFileStub.callsFake(async (filePath) => {
        if (filePath?.includes("apphosting.staging.yaml")) {
          return Promise.resolve(stagingAppHostingYaml);
        }
        return Promise.resolve(baseAppHostingYaml);
      });
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("returns a config that complies with the expected precendence", async () => {
      const resultingConfig = await config.loadConfigForEnvironment(
        "/parent/cwd/apphosting.staging.yaml",
        "/parent/cwd/apphosting.yaml",
      );
      expect(JSON.stringify(resultingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "ENV_1", value: "staging_env_1" },
          { variable: "ENV_3", value: "base_env_3" },
          { variable: "ENV_2", value: "staging_env_2" },
        ]),
      );

      expect(JSON.stringify(resultingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "SECRET_1", secret: "staging_secret_1" },
          { variable: "SECRET_2", secret: "staging_secret_2" },
          { variable: "SECRET_3", secret: "base_secret_3" },
        ]),
      );
    });

    it("returns appropriate config if only base file was selected", async () => {
      const resultingConfig = await config.loadConfigForEnvironment("/parent/cwd/apphosting.yaml");
      expect(JSON.stringify(resultingConfig.environmentVariables)).to.equal(
        JSON.stringify([
          { variable: "ENV_1", value: "base_env_1" },
          { variable: "ENV_3", value: "base_env_3" },
        ]),
      );

      expect(JSON.stringify(resultingConfig.secrets)).to.equal(
        JSON.stringify([
          { variable: "SECRET_1", secret: "base_secret_1" },
          { variable: "SECRET_2", secret: "base_secret_2" },
          { variable: "SECRET_3", secret: "base_secret_3" },
        ]),
      );
    });
  });
});
