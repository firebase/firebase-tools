import { expect } from "chai";
import * as sinon from "sinon";
import * as env from "./env";
import * as promptNS from "../prompt";
import * as config from "./config";
import * as gcsmNS from "../gcp/secretManager";
import * as secretsNS from "./secrets";
import * as utilsNS from "../utils";
import { Document } from "yaml";

describe("env", () => {
  let prompt: sinon.SinonStubbedInstance<typeof promptNS>;
  let gcsm: sinon.SinonStubbedInstance<typeof gcsmNS>;
  let secrets: sinon.SinonStubbedInstance<typeof secretsNS>;
  let utils: sinon.SinonStubbedInstance<typeof utilsNS>;

  function makeDocument(...envs: config.Env[]): Document {
    const doc = new Document();
    for (const e of envs) {
      config.upsertEnv(doc, e);
    }
    return doc;
  }

  beforeEach(() => {
    prompt = sinon.stub(promptNS);
    gcsm = sinon.stub(gcsmNS);
    secrets = sinon.stub(secretsNS);
    utils = sinon.stub(utilsNS);

    utils.logLabeledWarning.resolves();
    prompt.input.rejects(new Error("Should not be called"));
    gcsm.accessSecretVersion.rejects(new Error("Should not be called"));
    gcsm.addVersion.rejects(new Error("Should not be called"));
    secrets.upsertSecret.rejects(new Error("Should not be called"));
  });

  afterEach(() => {
    sinon.verifyAndRestore();
  });

  it("should diffEnvs", async () => {
    gcsm.accessSecretVersion
      .withArgs("test-project", "matching-secret", "latest")
      .resolves("unchanged");
    gcsm.accessSecretVersion
      .withArgs("test-project", "changed-secret", "latest")
      .resolves("original-value");
    gcsm.accessSecretVersion
      .withArgs("test-project", "error-secret", "latest")
      .rejects(new Error("Cannot access secret"));

    const existingEnv = makeDocument(
      { variable: "MATCHING_PLAIN", value: "existing" },
      { variable: "CHANGED_PLAIN", value: "original-value" },
      { variable: "UNREFERENCED_PLAIN", value: "existing" },

      { variable: "MATCHING_SECRET", secret: "matching-secret" },
      { variable: "UNREFERENCED_SECRET", secret: "unreferenced-secret" },
      { variable: "CHANGED_SECRET", secret: "changed-secret" },
      { variable: "ERROR_SECRET", secret: "error-secret" },
    );

    const importingEnv = {
      MATCHING_PLAIN: "existing",
      CHANGED_PLAIN: "new-value",
      NEW_PLAIN: "new",

      MATCHING_SECRET: "unchanged",
      NEW_SECRET: "new",
      CHANGED_SECRET: "changed-value",
      ERROR_SECRET: "attempted-value",
    };

    await expect(env.diffEnvs("test-project", importingEnv, existingEnv)).to.eventually.deep.equal({
      newVars: ["NEW_PLAIN", "NEW_SECRET"],
      matched: ["MATCHING_PLAIN", "MATCHING_SECRET"],
      conflicts: ["CHANGED_PLAIN", "CHANGED_SECRET", "ERROR_SECRET"],
    });
    expect(gcsm.accessSecretVersion).to.have.been.calledThrice;
    expect(utils.logLabeledWarning).to.have.been.calledWith(
      "apphosting",
      "Cannot read value of existing secret error-secret to see if it has changed. Assuming it has changed.",
    );
  });

  describe("confirmConflicts", () => {
    it("should return an empty array if no conflicts", async () => {
      const result = await env.confirmConflicts([]);
      expect(result).to.be.empty;
    });

    it("should prompt the user to resolve conflicts", async () => {
      prompt.checkbox.resolves(["FOO"]);
      const result = await env.confirmConflicts(["FOO", "BAZ"]);
      expect(result).to.deep.equal(["FOO"]);
      expect(prompt.checkbox).to.have.been.calledOnce;
    });
  });

  describe("chooseNewSecrets", () => {
    it("should return an empty array if no vars", async () => {
      const result = await env.chooseNewSecrets([]);
      expect(result).to.be.empty;
    });

    it("should suggest which values to store as secrets", async () => {
      prompt.checkbox.resolves(["MY_KEY"]);
      const result = await env.chooseNewSecrets(["FOO", "BAZ", "MY_KEY", "MY_SECRET"]);
      expect(result).to.deep.equal(["MY_KEY"]);
      expect(prompt.checkbox).to.have.been.calledWithMatch({
        message:
          "Sensitive data should be stored in Cloud Secrets Manager so that access to its value is protected. Which variables are sensitive?",
        choices: [
          { value: "FOO", checked: false },
          { value: "BAZ", checked: false },
          { value: "MY_KEY", checked: true },
          { value: "MY_SECRET", checked: true },
        ],
      });
    });
  });

  describe("importEnv", () => {
    // We could break this into multiple tests, but the same code is execrcised in all cases.
    it("should keep existing secrets as secrets, prompt for new vars to be secrets, and store only selected info", async () => {
      const existingEnv = makeDocument(
        { variable: "EXISTING_PLAIN1", value: "existing" },
        { variable: "EXISTING_PLAIN2", value: "existing" },
        { variable: "EXISTING_SECRET1", secret: "existing-secret1" },
        { variable: "EXISTING_SECRET2", secret: "existing-secret2" },
      );

      const importingEnv = {
        EXISTING_PLAIN1: "new",
        EXISTING_PLAIN2: "new",
        NEW_PLAIN: "new",
        EXISTING_SECRET1: "new",
        EXISTING_SECRET2: "new",
        NEW_SECRET: "new",
      };

      sinon.stub(env, "diffEnvs").resolves({
        newVars: ["NEW_PLAIN", "NEW_SECRET"],
        conflicts: ["EXISTING_PLAIN1", "EXISTING_PLAIN2", "EXISTING_SECRET1", "EXISTING_SECRET2"],
        matched: [],
      });
      // Leave #2 alone and verify that they haven't been modified
      sinon.stub(env, "confirmConflicts").resolves(["EXISTING_PLAIN1", "EXISTING_SECRET1"]);
      // Verify that only new variables are offered to be stored as secrets
      sinon.stub(env, "chooseNewSecrets").resolves(["NEW_SECRET"]);
      secrets.upsertSecret.withArgs("test-project", "NEW_SECRET").resolves();
      gcsm.addVersion.withArgs("test-project", "NEW_SECRET", "new").resolves();
      gcsm.addVersion.withArgs("test-project", "existing-secret1", "new").resolves();

      const createdSecrets = await env.importEnv("test-project", importingEnv, existingEnv);

      // Confirm new variables are not part of the confirm prompt
      expect(env.confirmConflicts).calledWithMatch([
        "EXISTING_PLAIN1",
        "EXISTING_PLAIN2",
        "EXISTING_SECRET1",
        "EXISTING_SECRET2",
      ]);

      // Confirm that variables which already existed are not asked to be stored as secrets
      expect(env.chooseNewSecrets).calledWithMatch(["NEW_PLAIN", "NEW_SECRET"]);

      // Confirm that we don't unnecessarily upsert existing secrets
      expect(secrets.upsertSecret).to.have.been.calledOnceWith("test-project", "NEW_SECRET");

      // Confirm that we updated the versions of the secrets we were asked to update
      expect(gcsm.addVersion).to.have.been.calledWith("test-project", "NEW_SECRET", "new");
      expect(gcsm.addVersion).to.have.been.calledWith("test-project", "existing-secret1", "new");

      // Confirm that we return the list of created secrets for furhter IAM granting
      expect(createdSecrets).to.deep.equal(["NEW_SECRET"]);

      // Confirm that the existing env was properly updated
      expect(config.findEnv(existingEnv, "EXISTING_PLAIN1")?.value).to.equal("new");
      expect(config.findEnv(existingEnv, "EXISTING_PLAIN2")?.value).to.equal("existing");
      expect(config.findEnv(existingEnv, "NEW_PLAIN")?.value).to.equal("new");
      expect(config.findEnv(existingEnv, "EXISTING_SECRET1")?.secret).to.equal("existing-secret1");
      expect(config.findEnv(existingEnv, "EXISTING_SECRET2")?.secret).to.equal("existing-secret2");
      expect(config.findEnv(existingEnv, "NEW_SECRET")?.secret).to.equal("NEW_SECRET");
    });
  });
});
