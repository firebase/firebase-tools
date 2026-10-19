import { expect } from "chai";
import * as sinon from "sinon";

import { command } from "./ailogic-config-get";
import * as ailogic from "../gcp/ailogic";
import * as projectUtils from "../projectUtils";
import { FirebaseError } from "../error";

const PROJECT_ID = "test-project";

describe("ailogic:config:get", () => {
  let enabledStub: sinon.SinonStub;
  let listProvidersStub: sinon.SinonStub;
  let getConfigStub: sinon.SinonStub;

  beforeEach(() => {
    (command as unknown as { befores: unknown[] }).befores = []; // bypass pre-action hooks
    sinon.stub(projectUtils, "needProjectId").returns(PROJECT_ID);
    enabledStub = sinon.stub(ailogic, "isAILogicApiEnabled").resolves(true);
    listProvidersStub = sinon.stub(ailogic, "listProviders").resolves(["gemini-developer-api"]);
    getConfigStub = sinon.stub(ailogic, "getConfig").resolves({
      name: "config",
      trafficFilter: { firebaseAuthRequired: true, templateOnly: false },
      telemetryConfig: { mode: "ALL", samplingRate: 0.5 },
    });
  });

  afterEach(() => sinon.restore());

  it("returns a structured config with mapped values", async () => {
    expect(await command.runner()(undefined, { project: PROJECT_ID })).to.deep.equal({
      providers: {
        "gemini-developer-api": true,
        "gemini-agent-platform-api": false,
      },
      security: { "auth-only": true, "template-only": false },
      monitoring: { state: true, "sample-rate-percentage": 50 },
    });
  });

  it("returns a single value for a valid path", async () => {
    expect(await command.runner()("security.auth-only", { project: PROJECT_ID })).to.equal(true);
  });

  it("returns a nested object for a group path", async () => {
    expect(await command.runner()("monitoring", { project: PROJECT_ID })).to.deep.equal({
      state: true,
      "sample-rate-percentage": 50,
    });
  });

  it("only checks provider enablement when the path needs it", async () => {
    await command.runner()("security.auth-only", { project: PROJECT_ID });
    expect(listProvidersStub).to.not.have.been.called;

    await command.runner()("providers.gemini-developer-api", { project: PROJECT_ID });
    expect(listProvidersStub).to.have.been.calledOnce;
  });

  it("throws on an unknown path before making any API calls", async () => {
    await expect(command.runner()("security.authonly", { project: PROJECT_ID })).to.be.rejectedWith(
      FirebaseError,
      /Unknown configuration path/,
    );
    expect(enabledStub).to.not.have.been.called;
    expect(getConfigStub).to.not.have.been.called;
    expect(listProvidersStub).to.not.have.been.called;
  });

  it("returns early when AI Logic is not enabled", async () => {
    enabledStub.resolves(false);
    expect(await command.runner()(undefined, { project: PROJECT_ID })).to.be.undefined;
  });
});
