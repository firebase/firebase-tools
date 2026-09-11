import { expect } from "chai";
import * as sinon from "sinon";
import * as fs from "fs-extra";
import { AppHostingYamlConfig } from "../yaml";
import * as apphosting from "../../gcp/apphosting";
import * as csm from "../../gcp/secretManager";
import * as secretsHelper from "../secrets";
import * as projectNumberHelper from "../../getProjectNumber";
import { setupSandboxSecrets, cleanupSandboxSecrets } from "./secrets";

describe("Sandbox Secrets Manager", () => {
  let pathExistsStub: sinon.SinonStub;
  let loadConfigStub: sinon.SinonStub;
  let getProjectNumberStub: sinon.SinonStub;
  let getBackendStub: sinon.SinonStub;
  let serviceAccountsStub: sinon.SinonStub;
  let secretExistsStub: sinon.SinonStub;
  let createSecretStub: sinon.SinonStub;
  let addVersionStub: sinon.SinonStub;
  let deleteSecretStub: sinon.SinonStub;
  let grantSecretAccessStub: sinon.SinonStub;

  beforeEach(() => {
    pathExistsStub = sinon.stub(fs, "pathExists");
    loadConfigStub = sinon.stub(AppHostingYamlConfig, "loadFromFile");
    getProjectNumberStub = sinon.stub(projectNumberHelper, "getProjectNumber");
    getBackendStub = sinon.stub(apphosting, "getBackend");
    serviceAccountsStub = sinon.stub(secretsHelper, "serviceAccountsForBackend");
    secretExistsStub = sinon.stub(csm, "secretExists");
    createSecretStub = sinon.stub(csm, "createSecret");
    addVersionStub = sinon.stub(csm, "addVersion");
    deleteSecretStub = sinon.stub(csm, "deleteSecret");
    grantSecretAccessStub = sinon.stub(secretsHelper, "grantSecretAccess");
  });

  afterEach(() => {
    sinon.restore();
  });

  it("should setup sandbox secrets for yaml configuration", async () => {
    pathExistsStub.resolves(true);

    const mockYaml = new AppHostingYamlConfig();
    mockYaml.env = {
      API_KEY: { secret: "my-production-api-key", availability: ["RUNTIME"] },
    };
    loadConfigStub.resolves(mockYaml);
    getProjectNumberStub.resolves("12345");

    getBackendStub.resolves({ name: "backend-resource" });
    serviceAccountsStub.resolves({
      buildServiceAccount: "build-sa@google.com",
      runServiceAccount: "run-sa@google.com",
    });

    secretExistsStub.resolves(false);
    createSecretStub.resolves();
    addVersionStub.resolves();
    grantSecretAccessStub.resolves();

    const mappings = await setupSandboxSecrets("aryanf-test", "us-central1", "/app/path", 1, [
      "compare-slot-1-a",
      "compare-slot-1-b",
    ]);

    expect(mappings).to.have.lengthOf(1);
    expect(mappings[0].originalName).to.equal("my-production-api-key");
    expect(mappings[0].mockSecretName).to.equal("cmp-sec-1-my-production-api-key");
    expect(mappings[0].mockValue).to.equal("mock-value-for-API_KEY-slot-1");

    expect(createSecretStub.callCount).to.equal(1);
    expect(addVersionStub.callCount).to.equal(1);
    expect(grantSecretAccessStub.callCount).to.equal(1);
  });

  it("should delete secrets on cleanup", async () => {
    deleteSecretStub.resolves();

    const mappings = [
      { originalName: "my-key", mockSecretName: "cmp-sec-1-my-key", mockValue: "val" },
    ];

    await cleanupSandboxSecrets("aryanf-test", mappings);
    expect(deleteSecretStub.callCount).to.equal(1);
    expect(deleteSecretStub.firstCall.args[1]).to.equal("cmp-sec-1-my-key");
  });
});
