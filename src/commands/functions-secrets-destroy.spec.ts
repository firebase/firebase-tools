import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./functions-secrets-destroy";
import * as backend from "../deploy/functions/backend";
import * as secrets from "../functions/secrets";
import * as secretManager from "../gcp/secretManager";
import * as projectUtils from "../projectUtils";
import * as utils from "../utils";

const PROJECT_ID = "test-project";
const SECRET = { projectId: PROJECT_ID, name: "MY_SECRET", labels: {}, replication: {} };

describe("functions:secrets:destroy", () => {
  let inUseStub: sinon.SinonStub;
  let destroyStub: sinon.SinonStub;
  let logWarningStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    sinon.stub(projectUtils, "needProjectNumber").resolves("123");
    sinon.stub(backend, "existingBackend").resolves(backend.empty());
    sinon
      .stub(backend, "allEndpoints")
      .returns([{ id: "fn", platform: "gcfv2", region: "us-central1" } as backend.Endpoint]);
    inUseStub = sinon.stub(secrets, "inUse").returns(false);
    sinon
      .stub(secretManager, "getSecretVersion")
      .resolves({ secret: SECRET, versionId: "2", state: "ENABLED", createTime: "" });
    destroyStub = sinon.stub(secretManager, "destroySecretVersion").resolves();
    sinon.stub(secretManager, "getSecret").resolves(SECRET);
    sinon.stub(secretManager, "isFunctionsManaged").returns(false);
    sinon.stub(utils, "logBullet");
    logWarningStub = sinon.stub(utils, "logWarning");
  });

  afterEach(() => sinon.restore());

  it("documents --force and --non-interactive behavior in the description", () => {
    const cmd = command as unknown as { name: string; descriptionText: string };
    expect(cmd.name).to.equal("functions:secrets:destroy");
    expect(cmd.descriptionText).to.match(/--non-interactive/);
    expect(cmd.descriptionText).to.match(/--force/);
  });

  it("destroys an unused version in --non-interactive mode without --force", async () => {
    await command.runner()("MY_SECRET@2", { project: PROJECT_ID, nonInteractive: true });
    expect(destroyStub).to.have.been.calledWith(PROJECT_ID, "MY_SECRET", "2");
  });

  it("refuses to destroy a version used by deployed functions without --force", async () => {
    inUseStub.returns(true);
    await command.runner()("MY_SECRET", { project: PROJECT_ID, nonInteractive: true });
    expect(destroyStub).to.not.have.been.called;
    expect(logWarningStub).to.have.been.calledWithMatch(/Use -f \(--force\)/);
  });

  it("destroys a version used by deployed functions with --force", async () => {
    inUseStub.returns(true);
    await command.runner()("MY_SECRET", { project: PROJECT_ID, force: true });
    expect(destroyStub).to.have.been.calledWith(PROJECT_ID, "MY_SECRET", "latest");
  });
});
