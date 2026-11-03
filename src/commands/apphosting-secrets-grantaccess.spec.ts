import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./apphosting-secrets-grantaccess";
import * as projectUtils from "../projectUtils";
import * as secretManager from "../gcp/secretManager";
import * as apphosting from "../gcp/apphosting";
import * as secrets from "../apphosting/secrets";
import * as prompt from "../prompt";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";
const PROJECT_NUMBER = "123456789";

function backend(location: string, id: string): apphosting.Backend {
  return {
    name: `projects/${PROJECT_ID}/locations/${location}/backends/${id}`,
  } as apphosting.Backend;
}

describe("apphosting:secrets:grantaccess", () => {
  let needProjectNumberStub: sinon.SinonStub;
  let secretExistsStub: sinon.SinonStub;
  let grantEmailsStub: sinon.SinonStub;
  let listBackendsStub: sinon.SinonStub;
  let selectStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = [];
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    needProjectNumberStub = sinon.stub(projectUtils, "needProjectNumber").resolves(PROJECT_NUMBER);
    secretExistsStub = sinon.stub(secretManager, "secretExists").resolves(true);
    grantEmailsStub = sinon.stub(secrets, "grantEmailsSecretAccess").resolves();
    listBackendsStub = sinon.stub(apphosting, "listBackends");
    selectStub = sinon.stub(prompt, "select");
  });

  afterEach(() => sinon.restore());

  it("requires one of --backend or --emails", async () => {
    await expect(command.runner()("my-secret", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /specify exactly one of --backend <backendId> or --emails <emails>/,
    );
    expect(needProjectNumberStub).to.not.have.been.called;
    expect(secretExistsStub).to.not.have.been.called;
  });

  it("rejects --backend and --emails together", async () => {
    await expect(
      command.runner()("my-secret", {
        project: PROJECT_ID,
        backend: "my-backend",
        emails: "a@example.com",
      }),
    ).to.be.rejectedWith(FirebaseError, /Cannot specify both --backend and --emails/);
    expect(needProjectNumberStub).to.not.have.been.called;
    expect(secretExistsStub).to.not.have.been.called;
  });

  it("grants access to each email when --emails is passed", async () => {
    await command.runner()("s1,s2", { project: PROJECT_ID, emails: "a@example.com,b@example.com" });
    expect(grantEmailsStub).to.have.been.calledWith(
      PROJECT_ID,
      ["s1", "s2"],
      ["a@example.com", "b@example.com"],
    );
  });

  it("requires --location in non-interactive mode when the backend exists in multiple locations", async () => {
    listBackendsStub.resolves({
      backends: [backend("us-central1", "my-backend"), backend("europe-west4", "my-backend")],
    });
    await expect(
      command.runner()("my-secret", {
        project: PROJECT_ID,
        backend: "my-backend",
        location: "-",
        nonInteractive: true,
      }),
    ).to.be.rejectedWith(
      FirebaseError,
      /Multiple backends found with ID my-backend \(in locations: us-central1, europe-west4\)\. Please specify the location of your target backend with --location\./,
    );
    expect(selectStub).to.not.have.been.called;
  });
});
