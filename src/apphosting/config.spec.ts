import { expect } from "chai";
import * as sinon from "sinon";
import * as yaml from "yaml";
import * as path from "path";
import * as fsImport from "../fsutils";
import * as csmImport from "../gcp/secretManager";
import * as promptImport from "../prompt";
import * as dialogs from "./secrets/dialogs";
import * as config from "./config";
import { NodeType } from "yaml/dist/nodes/Node";
import { AppHostingYamlConfig, toEnvList } from "./yaml";
import { FirebaseError } from "../error";

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
      fs.listFiles.withArgs("/parent/cwd").returns(["apphosting.yaml"]);
      expect(config.discoverBackendRoot("/parent/cwd")).equals("/parent/cwd");
    });

    it("finds apphosting.yaml in a parent directory", () => {
      fs.listFiles.withArgs("/parent/cwd").returns(["random_file.txt"]);
      fs.listFiles.withArgs("/parent").returns(["apphosting.yaml"]);

      expect(config.discoverBackendRoot("/parent/cwd")).equals("/parent");
    });

    it("returns null if it finds firebase.json without finding apphosting.yaml", () => {
      fs.listFiles.withArgs("/parent/cwd").returns([]);
      fs.listFiles.withArgs("/parent").returns(["firebase.json"]);

      expect(config.discoverBackendRoot("/parent/cwd")).equals(null);
    });

    it("returns if it reaches the fs root", () => {
      fs.listFiles.withArgs("/parent/cwd").returns([]);
      fs.listFiles.withArgs("/parent").returns(["random_file.txt"]);
      fs.listFiles.withArgs("/").returns([]);

      expect(config.discoverBackendRoot("/parent/cwd")).equals(null);
    });

    it("discovers backend root from any apphosting yaml file", () => {
      fs.listFiles.withArgs("/parent/cwd").returns(["apphosting.staging.yaml"]);

      expect(config.discoverBackendRoot("/parent/cwd")).equals("/parent/cwd");
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

  describe("maybeGenerateEmulatorsYaml", () => {
    let discoverBackendRoot: sinon.SinonStub;
    let overrideChosenEnv: sinon.SinonStub;
    let loadFromFile: sinon.SinonStub;
    let store: sinon.SinonStub;
    let fs: sinon.SinonStubbedInstance<typeof fsImport>;
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    const existingYaml = AppHostingYamlConfig.empty();
    existingYaml.env = {
      VAR: { value: "value" },
      API_KEY: { secret: "api-key" },
      API_KEY2: { secret: "api-key2" },
    };

    beforeEach(() => {
      discoverBackendRoot = sinon.stub(config, "discoverBackendRoot");
      overrideChosenEnv = sinon.stub(config, "overrideChosenEnv");
      store = sinon.stub(config, "store");
      loadFromFile = sinon.stub(AppHostingYamlConfig, "loadFromFile");
      fs = sinon.stub(fsImport);
      prompt = sinon.stub(promptImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("noops if emulators.yaml already exists", async () => {
      discoverBackendRoot.withArgs("/project").returns("/project");
      fs.fileExistsSync.withArgs(`/project/${config.APPHOSTING_EMULATORS_YAML_FILE}`).returns(true);

      await config.maybeGenerateEmulatorYaml("projectId", "/project");

      expect(prompt.confirm).to.not.have.been.called;
      expect(store).to.not.have.been.called;
    });

    // This allows us to prompt to give devs access to prod keys
    it("returns existing config even if the user does not create apphosting.emulator.yaml", async () => {
      discoverBackendRoot.withArgs("/project").returns("/project");
      fs.fileExistsSync
        .withArgs(`/project/${config.APPHOSTING_EMULATORS_YAML_FILE}`)
        .returns(false);
      // Do not create emulator file
      prompt.confirm.resolves(false);
      loadFromFile.resolves(existingYaml);

      await expect(
        config.maybeGenerateEmulatorYaml("projectId", "/project"),
      ).to.eventually.deep.equal(toEnvList(existingYaml.env));
    });

    it("returns overwritten config", async () => {
      discoverBackendRoot.withArgs("/project").returns("/project");
      fs.fileExistsSync
        .withArgs(`/project/${config.APPHOSTING_EMULATORS_YAML_FILE}`)
        .returns(false);
      loadFromFile.resolves(existingYaml);
      // Create emulator file
      prompt.confirm.resolves(true);
      overrideChosenEnv.resolves({
        API_KEY2: { secret: "test-api-key2" },
      });
      store.resolves();

      await expect(
        config.maybeGenerateEmulatorYaml("projectId", "/project"),
      ).to.eventually.deep.equal([
        { variable: "VAR", value: "value" },
        { variable: "API_KEY", secret: "api-key" },
        { variable: "API_KEY2", secret: "test-api-key2" },
      ]);

      expect(overrideChosenEnv.firstCall.args[1]).to.deep.equal({
        VAR: { value: "value" },
        API_KEY: { secret: "api-key" },
        API_KEY2: { secret: "api-key2" },
      });
      expect(store).to.have.been.called;
      const emulatorYaml = store.firstCall.args[1] as yaml.Document;
      expect(emulatorYaml.toJSON()).to.deep.equal({
        env: [{ variable: "API_KEY2", secret: "test-api-key2" }],
      });
    });
  });

  describe("overrideChosenEnv", () => {
    let csm: sinon.SinonStubbedInstance<typeof csmImport>;
    let prompt: sinon.SinonStubbedInstance<typeof promptImport>;

    beforeEach(() => {
      csm = sinon.stub(csmImport);
      prompt = sinon.stub(promptImport);
    });

    afterEach(() => {
      sinon.verifyAndRestore();
    });

    it("noops with no envs", async () => {
      await expect(config.overrideChosenEnv(undefined, {})).to.eventually.deep.equal({});

      expect(promptImport.promptOnce).to.not.have.been.called;
      expect(csmImport.getSecret).to.not.have.been.called;
    });

    it("noops with no selected envs", async () => {
      const originalEnv: Record<string, Omit<config.Env, "variable">> = {
        VARIABLE: { value: "value" },
        API_KEY: { secret: "api-key" },
      };

      prompt.promptOnce.onFirstCall().resolves([]);

      await expect(config.overrideChosenEnv(undefined, originalEnv)).to.eventually.deep.equal({});

      expect(prompt.promptOnce).to.have.been.calledOnce;
      expect(csm.secretExists).to.not.have.been.called;
    });

    it("can override plaintext values", async () => {
      const originalEnv: Record<string, config.Env> = {
        VARIABLE: { variable: "VARIABLE", value: "value" },
        VARIABLE2: { variable: "VARIABLE2", value: "value2" },
      };

      prompt.promptOnce.onFirstCall().resolves(["VARIABLE2"]);
      prompt.promptOnce.onSecondCall().resolves("new-value2");

      await expect(config.overrideChosenEnv(undefined, originalEnv)).to.eventually.deep.equal({
        VARIABLE2: { variable: "VARIABLE2", value: "new-value2" },
      });

      expect(prompt.promptOnce).to.have.been.calledTwice;
      expect(csmImport.secretExists).to.not.have.been.called;
    });

    it("throws when trying to overwrite secrets without knowing the project", async () => {
      const originalEnv: Record<string, config.Env> = {
        API_KEY: { variable: "API_KEY", secret: "api-key" },
      };

      prompt.promptOnce.onFirstCall().resolves(["API_KEY"]);

      await expect(config.overrideChosenEnv(undefined, originalEnv)).to.be.rejectedWith(
        FirebaseError,
        /Need a project ID to overwrite a secret./,
      );
    });

    it("can create new secrets", async () => {
      const originalEnv: Record<string, config.Env> = {
        API_KEY: { variable: "API_KEY", secret: "api-key" },
      };

      prompt.promptOnce.onFirstCall().resolves(["API_KEY"]);
      prompt.promptOnce.onSecondCall().resolves("test-api-key");
      csm.secretExists.withArgs("project", "test-api-key").resolves(false);
      prompt.promptOnce.onThirdCall().resolves("plaintext secret value");

      await expect(config.overrideChosenEnv("project", originalEnv)).to.eventually.deep.equal({
        API_KEY: { variable: "API_KEY", secret: "test-api-key" },
      });

      expect(prompt.promptOnce).to.have.been.calledThrice;
      expect(csm.secretExists).to.have.been.calledOnce;
      expect(csm.createSecret).to.have.been.calledOnce;
      expect(csm.addVersion).to.have.been.calledOnce;
      expect(csm.addVersion.getCall(0).args[2]).to.equal("plaintext secret value");
    });

    it("can create new secrets after warning about reuse", async () => {
      const originalEnv: Record<string, config.Env> = {
        API_KEY: { variable: "API_KEY", secret: "api-key" },
      };

      prompt.promptOnce.onCall(0).resolves(["API_KEY"]);
      prompt.promptOnce.onCall(1).resolves("test-api-key");
      csm.secretExists.withArgs("project", "test-api-key").resolves(true);
      prompt.promptOnce.onCall(2).resolves("pick-new");
      prompt.promptOnce.onCall(3).resolves("test-api-key2");
      prompt.promptOnce.onCall(4).resolves("plaintext secret value");

      await expect(config.overrideChosenEnv("project", originalEnv)).to.eventually.deep.equal({
        API_KEY: { variable: "API_KEY", secret: "test-api-key2" },
      });

      expect(prompt.promptOnce.callCount).to.equal(5);
      expect(csm.secretExists).to.have.been.calledTwice;
      expect(csm.createSecret).to.have.been.calledOnce;
      expect(csm.addVersion).to.have.been.calledOnce;
      expect(csm.addVersion.getCall(0).args[2]).to.equal("plaintext secret value");
    });

    it("can reuse secrets", async () => {
      const originalEnv: Record<string, config.Env> = {
        API_KEY: { variable: "API_KEY", secret: "api-key" },
      };

      prompt.promptOnce.onFirstCall().resolves(["API_KEY"]);
      prompt.promptOnce.onSecondCall().resolves("test-api-key");
      csm.secretExists.withArgs("project", "test-api-key").resolves(true);
      prompt.promptOnce.onThirdCall().resolves("reuse");

      await expect(config.overrideChosenEnv("project", originalEnv)).to.eventually.deep.equal({
        API_KEY: { variable: "API_KEY", secret: "test-api-key" },
      });

      expect(prompt.promptOnce).to.have.been.calledThrice;
      expect(csm.secretExists).to.have.been.calledOnce;
      expect(csm.createSecret).to.not.have.been.called;
      expect(csm.addVersion).to.not.have.been.called;
    });

    it("suggests test key names", () => {
      expect(config.suggestedTestKeyName("GOOGLE_GENAI_API_KEY")).to.equal(
        "test-google-genai-api-key",
      );
    });
  });
});
